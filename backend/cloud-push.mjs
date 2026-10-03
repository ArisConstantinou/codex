import { randomUUID, createHash } from 'node:crypto';
import { newVapid, subscription, sendPush } from './push.mjs';
import { settings, validatePlan, reconcilePlans } from '../public/shared/domain.mjs';
import { cyprus } from '../public/shared/time.mjs';
import { duration } from '../public/shared/wait.mjs';
import { withCloudLedger } from './cloud-store.mjs';
import seed from '../public/history-seed.json' with { type: 'json' };
const CLIENT = 'https://arisconstantinou.github.io';
const PLAN_FIELDS = ['id','at','title','kind','url','status','cancelled','dismissed','calendarSeen','repeatHours','lastNoticeAt','arrivalSeen','snoozedUntil','snoozePending'];
const hash = value => createHash('sha256').update(value).digest('hex');
function plans(value) {
  if (!Array.isArray(value) || value.length > 1000) throw Error('Invalid plans');
  return value.map(p => { validatePlan(p); return Object.fromEntries(PLAN_FIELDS.filter(k => p[k] !== undefined).map(k => [k,p[k]])); });
}
function initialize(ledger) {
  if (!ledger.get('vapid')) ledger.set('vapid', newVapid());
  if (!ledger.get('seeded')) { ledger.event('history-seed', { kind: 'seed', seed }); ledger.set('seeded', true); }
}
export async function cloudAPI(store, request, { ip = 'unknown', now = Date.now() } = {}) {
  const origin = request.headers.get('origin'), url = new URL(request.url);
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' };
  if (origin === CLIENT) Object.assign(headers, { 'Access-Control-Allow-Origin': CLIENT, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' });
  const response = (status, data) => new Response(data === null ? null : JSON.stringify(data), { status, headers });
  if (origin && origin !== CLIENT) return response(403, { error: 'Origin refused' });
  if (request.method === 'OPTIONS') return response(origin === CLIENT ? 204 : 403, null);
  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/windows-usage') return response(404, { error: 'Not found' });
  if (request.method !== 'GET' && origin !== CLIENT) return response(403, { error: 'Origin required' });
  let body = {};
  try {
    if (request.method === 'POST') { const text = await request.text(); if (Buffer.byteLength(text) > 200000) return response(413, { error: 'Body too large' }); body = JSON.parse(text || '{}'); }
    const result = await withCloudLedger(store, ledger => {
      initialize(ledger);
      const key = `rate:${hash(ip).slice(0,32)}`, rate = ledger.get(key) || { at: now, count: 0 };
      if (now - rate.at >= 60000) { rate.at = now; rate.count = 0; }
      rate.count++; if (rate.count > 120) return { status: 429, data: { error: 'Rate limit' } };
      ledger.set(key, rate);
      ledger.db.prepare("DELETE FROM meta WHERE key LIKE 'rate:%' AND json_extract(value,'$.at')<?").run(now - 86400000);
      const ok = data => ({ status: 200, data });
      if (request.method === 'GET' && url.pathname === '/api/config') return ok({ publicKey: ledger.get('vapid').publicKey, status: 'running', lastRefreshAt: ledger.get('lastRefreshAt'), lastSchedulerAt: ledger.get('lastSchedulerAt') });
      const cursor = Number(url.searchParams.get('cursor') || 0);
      if (!Number.isSafeInteger(cursor) || cursor < 0) return { status: 400, data: { error: 'Invalid cursor' } };
      if (request.method === 'GET' && url.pathname === '/api/events') { const events = ledger.publicEvents(cursor); return ok({ events, cursor: events.at(-1)?.seq || cursor, more: events.length === 500 }); }
      if (request.method === 'POST' && url.pathname === '/api/subscribe') {
        const sub = subscription(body.subscription), old = ledger.db.prepare('SELECT id FROM devices WHERE id=?').get(hash(sub.endpoint).slice(0,40));
        if (!old && ledger.db.prepare('SELECT COUNT(*) AS count FROM devices').get().count >= 100) return { status: 503, data: { error: 'Device capacity reached' } };
        return ok(ledger.register(sub, settings(body.settings), reconcilePlans(plans(body.plans), ledger.get('items') || [])));
      }
      const device = ledger.authorize(request.headers.get('authorization')?.replace(/^Bearer /, ''));
      if (!device) return { status: 401, data: { error: 'Device subscription needs renewal' } };
      if (request.method === 'GET' && url.pathname === '/api/inbox') {
        const rows = ledger.inbox(device.id, cursor), receipts = ledger.db.prepare('SELECT o.id,o.status AS transport,a.at AS displayRequestedAt FROM outbox o LEFT JOIN acknowledgements a ON a.id=o.id AND a.device=o.device WHERE o.device=? ORDER BY o.seq DESC LIMIT 200').all(device.id);
        return ok({ rows, receipts, cursor: rows.at(-1)?.seq || cursor, more: rows.length === 500, active: !!device.active, plans: JSON.parse(device.plans) });
      }
      if (request.method === 'POST' && url.pathname === '/api/preferences') {
        const prefs = settings(body.settings), next = reconcilePlans(plans(body.plans), ledger.get('items') || []);
        ledger.update(device, prefs, next);
        for (const row of ledger.db.prepare("SELECT seq,plan_id FROM outbox WHERE device=? AND status IN ('queued','retry','sending')").all(device.id)) if (!prefs.notifications || row.plan_id && !next.some(p => p.id === row.plan_id && !p.cancelled)) ledger.db.prepare("UPDATE outbox SET status='cancelled' WHERE seq=?").run(row.seq);
        return ok({ saved: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/test') {
        const latest = ledger.db.prepare('SELECT payload FROM outbox WHERE device=? AND plan_id IS NULL ORDER BY seq DESC LIMIT 1').get(device.id);
        if (latest && now - Date.parse(JSON.parse(latest.payload).at) < 30000) return { status: 429, data: { error: 'Wait 30 seconds between tests' } };
        const id = `test:${device.id}:${now}`; ledger.queue(device.id, { id, at: new Date(now).toISOString(), title: 'Reset Radar · δοκιμαστική ειδοποίηση', body: 'Δοκιμή ειδοποιήσεων. Έλεγξε την εμφάνιση στο Κέντρο ειδοποιήσεων του iPhone.', read: false }, now);
        return { status: 202, data: { id, status: 'queued' } };
      }
      if (request.method === 'POST' && url.pathname === '/api/ack') { ledger.ack(device.id, String(body.id)); return ok({ saved: true }); }
      if (request.method === 'DELETE' && url.pathname === '/api/subscribe') { ledger.db.prepare('DELETE FROM acknowledgements WHERE device=?').run(device.id); ledger.db.prepare('DELETE FROM outbox WHERE device=?').run(device.id); ledger.db.prepare('DELETE FROM devices WHERE id=?').run(device.id); return ok({ removed: true }); }
      return { status: 404, data: { error: 'Not found' } };
    });
    return response(result.status, result.data);
  } catch (error) { return response(error.status || 400, { error: error.status === 503 ? 'Please retry shortly' : 'Invalid request or temporary storage failure' }); }
}
export async function refreshCloudSources(store, fetcher = fetch, now = Date.now()) {
  const last = await withCloudLedger(store, ledger => { initialize(ledger); return ledger.get('lastRefreshAt'); });
  if (last && now - Date.parse(last) < 300000) return;
  const response = await fetcher(`${CLIENT}/codex/snapshot.json`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw Error('Public snapshot unavailable');
  const packet = await response.json();
  if (packet.version !== 1 || !Array.isArray(packet.items) || packet.items.length > 50000 || !packet.sources) throw Error('Invalid public snapshot');
  for (const x of packet.items) if (typeof x.id !== 'string' || typeof x.text !== 'string' || !Number.isFinite(Date.parse(x.at)) || x.scheduledAt && !Number.isFinite(Date.parse(x.scheduledAt))) throw Error('Invalid public record');
  await withCloudLedger(store, ledger => {
    const stored = new Map((ledger.get('items') || []).map(x => [x.id,x]));
    for (const x of packet.items) { if (JSON.stringify(stored.get(x.id)) !== JSON.stringify(x)) ledger.event(`item:${x.id}:${hash(JSON.stringify(x))}`, { kind: 'item', item: x }); stored.set(x.id,x); }
    const items = [...stored.values()]; ledger.set('items', items);
    if (JSON.stringify(ledger.get('sources')) !== JSON.stringify(packet.sources)) { ledger.set('sources', packet.sources); ledger.event(`sources:${hash(JSON.stringify(packet.sources))}`, { kind: 'sources', sources: packet.sources }); }
    for (const d of ledger.db.prepare('SELECT id,plans FROM devices WHERE active=1').all()) ledger.db.prepare('UPDATE devices SET plans=? WHERE id=?').run(JSON.stringify(reconcilePlans(JSON.parse(d.plans), items)), d.id);
    ledger.set('lastRefreshAt', new Date(now).toISOString());
  });
}
export async function cloudTick(store, { now = Date.now(), sender = sendPush } = {}) {
  const lease = randomUUID();
  const prepared = await withCloudLedger(store, ledger => {
    initialize(ledger);
    ledger.db.prepare("UPDATE outbox SET status='retry' WHERE status='sending' AND next_at<=?").run(now);
    ledger.schedule(now);
    ledger.db.prepare("UPDATE outbox SET status='cancelled' WHERE status IN ('queued','retry','sending') AND device IN (SELECT id FROM devices WHERE active=0 OR json_extract(preferences,'$.notifications')=0)").run();
    const jobs = ledger.jobs(now).slice(0,4);
    for (const row of jobs) ledger.db.prepare("UPDATE outbox SET status='sending',next_at=?,last_error=? WHERE seq=?").run(now + 120000, lease, row.seq);
    ledger.set('lastSchedulerAt', new Date(now).toISOString());
    return { jobs, vapid: ledger.get('vapid') };
  });
  await Promise.all(prepared.jobs.map(async row => {
    let error;
    try {
      const valid = await withCloudLedger(store, ledger => { const r = ledger.db.prepare('SELECT o.status,o.last_error,d.active FROM outbox o JOIN devices d ON d.id=o.device WHERE o.seq=?').get(row.seq); return r?.status === 'sending' && r.last_error === lease && !!r.active; });
      if (!valid) return;
      const notice = JSON.parse(row.payload), left = notice.deadline ? Math.max(0,Date.parse(notice.deadline)-now) : null;
      const body = notice.deadline ? `${notice.body}\n${cyprus(notice.deadline)} · ${left ? 'Μένουν ' + duration(left) : 'Η ώρα έφτασε'}` : notice.body;
      await sender(JSON.parse(row.subscription), { web_push: 8030, notification: { title: notice.title, body, navigate: `${CLIENT}/codex/#inbox`, tag: `radar:${notice.planId || notice.id}`, icon: `${CLIENT}/codex/icon-512.png`, silent: false }, radar: { ...notice, body, deviceCursor: row.seq } }, prepared.vapid);
    } catch (e) { error = e; }
    await withCloudLedger(store, ledger => {
      const current = ledger.db.prepare('SELECT * FROM outbox WHERE seq=?').get(row.seq);
      if (current?.status !== 'sending' || current.last_error !== lease) return;
      if (error) ledger.failure(current, error, now); else ledger.success(current);
    });
  }));
  return { processed: prepared.jobs.length };
}

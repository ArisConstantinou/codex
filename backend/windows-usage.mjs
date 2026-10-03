import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { weeklyPoint, validAnchor, retainAnchors } from '../public/shared/day-usage.mjs';
import { validateUsage } from '../public/shared/usage-file.mjs';

export function localUsageAllowed(req, config) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  const origin = `http://${config.host}:${config.port}`;
  if (req.headers.host !== `${config.host}:${config.port}` || req.headers.origin && req.headers.origin !== origin) return false;
  return !req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']);
}

export function sanitizedUsage(state, now = Date.now()) {
  if (state?.allowance?.version !== 1) throw Error('Invalid local state');
  const a = state.allowance, current = weeklyPoint(a.snapshot);
  if (!current || Date.parse(current.at) > now) throw Error('No verified weekly measurement');
  const raw = (Array.isArray(a.history) ? a.history : []).slice(-1440).map(weeklyPoint).filter(p => p?.scope === current.scope && Date.parse(p.at) <= now);
  raw.push(current);
  const saved = Array.isArray(a.dayAnchors) ? a.dayAnchors.filter(p => validAnchor(p) && p.scope === current.scope && Date.parse(p.at) <= now) : [];
  const anchors = retainAnchors(raw, saved), scope = createHash('sha256').update(current.scope).digest('hex');
  const clean = p => ({ scope, at: p.at, used: p.used, remaining: p.remaining, resetsAt: p.resetsAt, origin: 'codex' });
  const points = [...new Map([...anchors, ...raw].map(p => [p.at, clean(p)])).values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const usage = { points, anchors: anchors.map(a => ({ ...clean(a), day: a.day, adjusted: a.adjusted })), activeScope: scope };
  validateUsage(usage);
  return { version: 1, health: now - Date.parse(current.at) < 150000 ? 'live' : 'cached', measuredAt: current.at, usage, error: null };
}

// Read only the installed app's saved quota cache. Never spawn Codex or expose
// its profile, credentials, account identifiers, filesystem paths or raw errors.
export class WindowsUsageReader {
  constructor({ file = process.platform === 'win32' && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ResetRadar/account/radar.json') : null } = {}) { this.file = file; this.last = null; }
  async read(now = Date.now()) {
    if (this.file) for (const file of [this.file, `${this.file}.bak`]) {
      try {
        const info = await fs.stat(file); if (!info.isFile() || info.size > 32 * 1024 * 1024) throw Error('Invalid local cache size');
        const packet = sanitizedUsage(JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')), now);
        if (file !== this.file) {
          if (this.last && Date.parse(this.last.measuredAt) > Date.parse(packet.measuredAt)) return { ...this.last, health: 'cached', error: 'Διατηρήθηκε η νεότερη ασφαλής μέτρηση Windows.' };
          packet.health = 'cached'; packet.error = 'Εμφανίζεται το προηγούμενο ασφαλές αντίγραφο Windows.';
        }
        this.last = packet; return packet;
      } catch { /* Preserve last good measurements; primary may be atomically replaced. */ }
    }
    return this.last ? { ...this.last, health: 'cached', error: 'Η τοπική ανάγνωση δεν είναι διαθέσιμη. Διατηρήθηκε η τελευταία μέτρηση.' } : { version: 1, health: 'unavailable', measuredAt: null, usage: null, error: 'Περιμένουμε αποθηκευμένη εβδομαδιαία μέτρηση από την εφαρμογή Windows Reset Radar.' };
  }
}

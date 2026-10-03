import { validPoint, validAnchor, retainAnchors } from './day-usage.mjs';
export const emptyUsage = () => ({ points: [], anchors: [], activeScope: null });
const opaque = /^[a-f0-9]{64}$/;
export function validateUsage(u) {
  if (!u || !Array.isArray(u.points) || !Array.isArray(u.anchors) || u.points.length > 100000 || u.anchors.length > 20000 || !u.points.every(p => validPoint(p) && opaque.test(p.scope)) || !u.anchors.every(a => validAnchor(a) && opaque.test(a.scope)) || u.activeScope !== null && !opaque.test(u.activeScope)) throw Error('Μη έγκυρες προσωπικές μετρήσεις.');
  return u;
}
export function mergeUsage(before = emptyUsage(), incoming = emptyUsage(), select = false) {
  validateUsage(before); validateUsage(incoming);
  const map = new Map(before.points.map(p => [JSON.stringify([p.scope, p.at]), p]));
  for (const p of incoming.points) {
    const key = JSON.stringify([p.scope, p.at]), old = map.get(key);
    if (old && (old.remaining !== p.remaining || old.used !== p.used || old.resetsAt !== p.resetsAt)) throw Error('Αντικρουόμενη μέτρηση στην ίδια ώρα. Τα προηγούμενα στοιχεία διατηρήθηκαν.');
    if (!old) map.set(key, p);
  }
  const points = [...map.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return validateUsage({ points, anchors: retainAnchors(points, [...before.anchors, ...incoming.anchors]), activeScope: select ? incoming.activeScope : before.activeScope || incoming.activeScope });
}
export async function digest(text) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function usageFile(usage, now = Date.now()) {
  validateUsage(usage);
  if (!usage.activeScope) throw Error('Δεν υπάρχει επιβεβαιωμένη εβδομαδιαία μέτρηση για εξαγωγή.');
  const u = { points: usage.points.filter(p => p.scope === usage.activeScope), anchors: usage.anchors.filter(p => p.scope === usage.activeScope), activeScope: usage.activeScope };
  const body = { format: 'reset-radar-personal-usage', version: 1, createdAt: new Date(now).toISOString(), timezone: 'Asia/Nicosia', startOfDay: '06:00', usage: u };
  return { ...body, sha256: await digest(JSON.stringify(body)) };
}
export async function readUsageFile(text) {
  if (text.length > 16 * 1024 * 1024) throw Error('Το αρχείο μετρήσεων ξεπερνά τα 16 MiB.');
  const { sha256, ...body } = JSON.parse(text);
  if (body.format !== 'reset-radar-personal-usage' || body.version !== 1 || body.timezone !== 'Asia/Nicosia' || body.startOfDay !== '06:00' || await digest(JSON.stringify(body)) !== sha256) throw Error('Μη έγκυρο αρχείο ή checksum μετρήσεων.');
  const u = validateUsage(body.usage);
  if (!u.activeScope || !u.points.length || [...u.points, ...u.anchors].some(p => p.scope !== u.activeScope || Date.parse(p.at) > Date.now())) throw Error('Μη έγκυρη ώρα ή λογαριασμός μετρήσεων.');
  // Construct only the supported fields; never retain unknown file contents.
  const point = p => ({ scope: p.scope, at: p.at, used: p.used, remaining: p.remaining, resetsAt: p.resetsAt, origin: p.origin });
  return { points: u.points.map(point), anchors: u.anchors.map(a => ({ ...point(a), day: a.day, adjusted: a.adjusted })), activeScope: u.activeScope };
}

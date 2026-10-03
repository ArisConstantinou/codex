export const CYPRUS_ZONE = 'Asia/Nicosia';
const formats = new Map();
export function validTime(value) {
  return typeof value === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
}
export function cyprus(value, style = 'full') {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Δεν δόθηκε ώρα';
  const options = {
    full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    short: { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    day: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
    clock: { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' },
    zone: { timeZoneName: 'shortOffset', hour: '2-digit', hourCycle: 'h23' }
  };
  if (!formats.has(style)) formats.set(style, new Intl.DateTimeFormat('el-CY', { timeZone: CYPRUS_ZONE, ...(options[style] || options.full) }));
  return formats.get(style).format(date);
}
export function remaining(at, now = Date.now()) {
  if (!validTime(at)) return null;
  const seconds = Math.max(0, Math.ceil((Date.parse(at) - now) / 1000));
  return { days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600), minutes: Math.floor(seconds % 3600 / 60), seconds: seconds % 60, total: seconds };
}
export function ago(at, now = Date.now()) {
  const duration = now - Date.parse(at);
  if (!Number.isFinite(duration)) return 'Δεν υπάρχει συγχρονισμός';
  if (duration < 0) return 'Ώρα πηγής μπροστά από το ρολόι';
  if (duration < 60000) return 'μόλις τώρα';
  if (duration < 3600000) return `${Math.floor(duration / 60000)} λεπτά πριν`;
  if (duration < 86400000) return `${Math.floor(duration / 3600000)} ώρες πριν`;
  return `${Math.floor(duration / 86400000)} ημέρες πριν`;
}

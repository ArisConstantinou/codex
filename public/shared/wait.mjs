import { validTime } from './time.mjs';
export const DAY_MS = 86400000;
export function duration(milliseconds, seconds = false) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'μη διαθέσιμο';
  const total = Math.floor(milliseconds / 1000);
  const days = Math.floor(total / 86400), hours = Math.floor(total % 86400 / 3600), minutes = Math.floor(total % 3600 / 60);
  const parts = [...(days ? [`${days}ημ.`] : []), ...(hours || days ? [`${hours}ώρ.`] : []), `${minutes}λ.`];
  if (seconds) parts.push(`${total % 60}δ.`);
  return parts.join(' ');
}
export function waitModel(raw, now = Date.now()) {
  if (!validTime(raw?.lastReset)) return { available: false, reason: 'Δεν έχει δοθεί ώρα τελευταίου reset.' };
  const last = Date.parse(raw.lastReset);
  if (!Number.isFinite(now) || now < last) return { available: false, reason: 'Το ρολόι της συσκευής βρίσκεται πριν από την ώρα του τελευταίου reset.' };
  const elapsedMs = now - last;
  const fromDeadline = validTime(raw.cadence?.expectedAt) ? Date.parse(raw.cadence.expectedAt) - last : NaN;
  const roundedPace = raw.cadence?.paceDays ?? raw.stats?.pace30Days;
  const paceMs = fromDeadline > 0 ? fromDeadline : Number.isFinite(roundedPace) && roundedPace > 0 ? roundedPace * DAY_MS : NaN;
  if (!Number.isFinite(paceMs)) return { available: false, reason: 'Ο ρυθμός αναμονής δεν είναι διαθέσιμος από την πηγή.' };
  const gaps = (Array.isArray(raw.cadence?.recentGaps) ? raw.cadence.recentGaps : []).filter(value => Number.isFinite(value) && value > 0).slice(0, 200);
  const elapsedDays = elapsedMs / DAY_MS, paceDays = paceMs / DAY_MS;
  const max = Math.max(paceDays * 2, elapsedDays * 1.12, ...gaps, 1);
  const unit = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 14, 30, 60, 90, 180, 365].find(value => value >= max / 6) || Math.ceil(max / 6 / 365) * 365;
  const domainDays = Math.ceil(max / unit) * unit;
  const ticks = Array.from({ length: Math.round(domainDays / unit) + 1 }, (_, index) => index * unit);
  const shorter = gaps.filter(value => value * DAY_MS <= elapsedMs).length;
  return { available: true, ownModel: raw.cadence?.modelOrigin === 'local', referenceLabel: raw.cadence?.method === 'recent-gap-mean' ? 'Μέσος όρος τελευταίων διαστημάτων' : 'Ρυθμός τελευταίων 30 ημερών', elapsedMs, elapsedDays, paceMs, paceDays, domainDays, ticks, gaps, shorter, total: gaps.length, deltaMs: paceMs - elapsedMs, pacePercent: elapsedMs / paceMs * 100, progress: elapsedDays / domainDays, reference: paceDays / domainDays, historyMeanDays: gaps.length ? gaps.reduce((sum, value) => sum + value, 0) / gaps.length : null, expectedAt: new Date(last + paceMs).toISOString(), lastReset: raw.lastReset };
}
export function point(progress, radius = 103, center = 142) {
  const angle = -135 + Math.max(0, Math.min(1, progress)) * 270;
  const radians = angle * Math.PI / 180;
  return { x: center + Math.sin(radians) * radius, y: center - Math.cos(radians) * radius, angle };
}
export function historyPoints(model, width = 720) {
  const lanes = [[], [], [], []];
  return model.gaps.map((days, index) => {
    const x = 24 + days / model.domainDays * (width - 48);
    let lane = lanes.findIndex(positions => positions.every(previous => Math.abs(previous - x) >= 16));
    if (lane < 0) lane = index % lanes.length;
    lanes[lane].push(x);
    return { days, x, y: 134 + lane * 18, index };
  });
}

import { validTime, cyprus } from './time.mjs';
const clock = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Nicosia', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const deadlineChanged = (a, b) => !!(a && b && Math.abs(Date.parse(a) - Date.parse(b)) >= 60000);
export function dayClock(at) {
  const p = Object.fromEntries(clock.formatToParts(new Date(at)).map(p => [p.type, p.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
export function validPoint(p) {
  return !!p && typeof p.scope === 'string' && p.scope.length > 0 && p.scope.length <= 1000 && validTime(p.at) && Number.isFinite(p.used) && p.used >= 0 && Number.isFinite(p.remaining) && p.remaining === Math.max(0, Math.min(100, 100 - p.used)) && (p.resetsAt === null || validTime(p.resetsAt)) && ['codex', 'manual'].includes(p.origin);
}
export function weeklyPoint(snapshot) {
  if (!snapshot?.identityVerified) return null;
  const bucket = snapshot.buckets?.find(b => b.id === 'codex') || snapshot.buckets?.find(b => b.windows.some(w => w.durationMins === 10080));
  const windows = bucket?.windows.filter(w => w.durationMins === 10080);
  if (windows?.length !== 1) return null;
  const w = windows[0], point = { scope: JSON.stringify([snapshot.identityHash, snapshot.planType, bucket.id, bucket.planType]), at: snapshot.observedAt, used: w.usedPercent, remaining: w.remainingPercent, resetsAt: w.resetsAt, origin: 'codex' };
  return validPoint(point) ? point : null;
}
export function validAnchor(a) {
  return validPoint(a) && a.day === dayClock(a.at).day && dayClock(a.at).minutes >= 360 && typeof a.adjusted === 'boolean';
}
// First actual post-06:00 sample, retained independently of the rolling cache.
// A refill anywhere in the day survives pruning even if later use hides it.
export function retainAnchors(points, existing = []) {
  const map = new Map();
  for (const a of existing) if (validAnchor(a)) {
    const key = JSON.stringify([a.scope, a.day]), old = map.get(key);
    map.set(key, { ...(old && Date.parse(old.at) < Date.parse(a.at) ? old : a), adjusted: !!(old?.adjusted || a.adjusted) });
  }
  const previous = new Map();
  for (const p of points.filter(validPoint).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const { day, minutes } = dayClock(p.at), key = JSON.stringify([p.scope, day]), old = map.get(key), before = previous.get(key);
    if (minutes >= 360) {
      const adjusted = !!(old?.adjusted || before && (p.remaining > before.remaining + .0001 || deadlineChanged(p.resetsAt, before.resetsAt)));
      map.set(key, { ...(old && Date.parse(old.at) <= Date.parse(p.at) ? old : { ...p, day }), adjusted });
      previous.set(key, p);
    }
  }
  return [...map.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
export function compareDay(latest, anchors, now = Date.now()) {
  const { day, minutes } = dayClock(now);
  const baseline = minutes >= 360 && validPoint(latest) ? anchors.find(a => validAnchor(a) && a.day === day && a.scope === latest.scope && Date.parse(a.at) <= Date.parse(latest.at) && Date.parse(a.at) <= now) : null;
  const current = validPoint(latest) && Date.parse(latest.at) <= now ? latest : null;
  return { day, baseline: baseline || null, current, delta: baseline && current ? current.remaining - baseline.remaining : null, adjusted: !!(baseline?.adjusted || baseline && current && (deadlineChanged(baseline.resetsAt, current.resetsAt) || current.remaining > baseline.remaining)), beforeMorning: minutes < 360 };
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const percent = n => `${n.toLocaleString('el-CY', { maximumFractionDigits: 1 })}%`;
export function comparisonHTML(comparison) {
  const { baseline, current, delta, adjusted, beforeMorning } = comparison;
  const value = p => p ? `<strong>${percent(p.remaining)} <span>υπόλοιπο</span></strong><p>${percent(p.used)} χρησιμοποιημένο</p><time datetime="${esc(p.at)}">${esc(cyprus(p.at, 'short'))} · Κύπρος${p.origin === 'manual' ? ' · χειροκίνητο' : ''}</time>` : '<strong class="day-missing">Μη διαθέσιμο</strong>';
  return `<div class="day-heading"><span>Η ΣΗΜΕΡΙΝΗ ΣΟΥ ΣΥΓΚΡΙΣΗ</span><span>Αφετηρία 06:00 · Κύπρος</span></div><div class="day-values"><div class="day-before"><span>ΠΡΩΙ · ΠΡΩΤΗ ΜΕΤΡΗΣΗ ΑΠΟ 06:00</span>${value(baseline)}${!baseline ? `<p>${beforeMorning ? 'Η σύγκριση ξεκινά στις 06:00.' : 'Δεν καταγράφηκε ακόμη πρωινή μέτρηση σήμερα.'}</p>` : ''}</div><span class="day-arrow" aria-hidden="true">→</span><div class="day-now"><span>ΤΩΡΑ · ΤΕΛΕΥΤΑΙΑ ΜΕΤΡΗΣΗ</span>${value(current)}</div></div><p class="day-delta">${delta === null ? 'Θα συγκρίνουμε πραγματικές μετρήσεις της ίδιας ημέρας και του ίδιου λογαριασμού.' : `Καθαρή μεταβολή υπολοίπου: <b>${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toLocaleString('el-CY', { maximumFractionDigits: 1 })} ποσοστιαίες μονάδες</b>.${adjusted ? ' Μεσολάβησε ανανέωση ή προσαρμογή ορίου· η διαφορά δεν μετρά συνολική κατανάλωση.' : ''}`} Η ώρα αφορά την πραγματική καταγραφή.</p>`;
}

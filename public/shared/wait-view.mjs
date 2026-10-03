import { waitModel, duration, point, historyPoints } from './wait.mjs';
import { cyprus } from './time.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const days = value => `${value.toLocaleString('el-CY', { maximumFractionDigits: 1 })}ημ.`;
const fixed = value => value.toFixed(3);
function arc(progress) {
  const start = point(0), end = point(progress);
  return `M ${fixed(start.x)} ${fixed(start.y)} A 103 103 0 ${progress > 2 / 3 ? 1 : 0} 1 ${fixed(end.x)} ${fixed(end.y)}`;
}
function compass(model) {
  const current = point(model.progress), reference = point(model.reference);
  const refInside = point(model.reference, 90), refOutside = point(model.reference, 117);
  return `<div class="wait-compass-panel"><span class="small-label">ΚΥΚΛΙΚΟ ΚΑΝΤΡΑΝ</span><svg class="wait-compass" viewBox="0 0 284 284" role="img" aria-label="Τωρινή αναμονή σε σύγκριση με τον ιστορικό ρυθμό"><path class="compass-track" d="${arc(1)}"/><path id="wait-arc" class="compass-progress" d="${arc(model.progress)}"/>${model.ticks.map(tick => { const inside = point(tick / model.domainDays, 117), outside = point(tick / model.domainDays, 122), label = point(tick / model.domainDays, 133); return `<line class="compass-tick" x1="${fixed(inside.x)}" y1="${fixed(inside.y)}" x2="${fixed(outside.x)}" y2="${fixed(outside.y)}"/><text class="compass-axis-label" x="${fixed(label.x)}" y="${fixed(label.y + 4)}">${tick.toLocaleString('el-CY')}</text>`; }).join('')}<line class="compass-reference" x1="${fixed(refInside.x)}" y1="${fixed(refInside.y)}" x2="${fixed(refOutside.x)}" y2="${fixed(refOutside.y)}"/><circle class="compass-reference-dot" cx="${fixed(reference.x)}" cy="${fixed(reference.y)}" r="6"/><line id="wait-needle" class="compass-needle" x1="142" y1="142" x2="${fixed(current.x)}" y2="${fixed(current.y)}"/><circle class="compass-center" cx="142" cy="142" r="68"/><text class="compass-center-label" x="142" y="124">ΑΝΑΜΟΝΗ ΤΩΡΑ</text><text id="wait-dial-elapsed" class="compass-center-value" x="142" y="152">${escape(duration(model.elapsedMs))}</text><text id="wait-percent" class="compass-center-note" x="142" y="177">${Math.round(model.pacePercent)}% του ρυθμού</text><circle id="wait-dial-dot" class="compass-current-dot" cx="${fixed(current.x)}" cy="${fixed(current.y)}" r="7"/><text class="compass-unit-label" x="142" y="251">ΚΛΙΜΑΚΑ ΣΕ ΗΜΕΡΕΣ</text></svg><div class="wait-legend"><span><i class="legend-you"></i>Εσύ τώρα</span><span><i class="legend-reference"></i>Δικός μας ρυθμός</span></div></div>`;
}
function linear(model) {
  const currentX = 24 + model.progress * 672, referenceX = 24 + model.reference * 672;
  return `<div class="wait-linear-panel"><span class="small-label">ΓΡΑΜΜΙΚΗ ΣΥΓΚΡΙΣΗ</span><div class="wait-readouts"><div><span><i class="legend-you"></i>Ο χρόνος που πέρασε</span><strong id="wait-elapsed">${escape(duration(model.elapsedMs, true))}</strong></div><div><span><i class="legend-reference"></i>${escape(model.referenceLabel)}</span><strong>${days(model.paceDays)}</strong></div></div><svg class="wait-line" viewBox="0 0 720 215" aria-label="Γραμμική κλίμακα αναμονής και πραγματικές προηγούμενες αναμονές"><line class="wait-track" x1="24" y1="33" x2="696" y2="33"/><line id="wait-fill" class="wait-fill" x1="24" y1="33" x2="${fixed(currentX)}" y2="33"/><line class="wait-reference" x1="${fixed(referenceX)}" y1="10" x2="${fixed(referenceX)}" y2="56"/><path class="wait-reference-diamond" d="M ${fixed(referenceX)} 25 l 8 8 -8 8 -8 -8 Z"/><circle id="wait-line-dot" class="wait-line-dot" cx="${fixed(currentX)}" cy="33" r="8"/>${model.ticks.map(tick => { const x = 24 + tick / model.domainDays * 672; return `<line class="wait-axis-tick" x1="${fixed(x)}" y1="56" x2="${fixed(x)}" y2="63"/><text class="wait-axis-label" x="${fixed(x)}" y="85">${tick === 0 ? '0' : days(tick)}</text>`; }).join('')}<rect class="history-backdrop" x="10" y="112" width="700" height="89" rx="12"/>${historyPoints(model).map(item => `<g class="history-dot" tabindex="0" role="button" data-gap="${item.days}" data-gap-index="${item.index}" aria-label="Αναμονή ${item.index + 1}: ${escape(duration(item.days * 86400000))}"><circle class="history-hit" cx="${fixed(item.x)}" cy="${item.y}" r="9"/><circle class="history-visible" cx="${fixed(item.x)}" cy="${item.y}" r="4"/></g>`).join('')}</svg><div class="history-caption"><span><i class="legend-history"></i>${model.total} προηγούμενες αναμονές</span><span>Κάθε κουκκίδα = ένα διάστημα</span></div><label class="history-selector">Διάστημα ιστορικού<select id="history-gap" aria-label="Διάστημα ιστορικού">${model.gaps.map((gap,index)=>`<option value="${index}">Αναμονή ${index+1}: ${escape(duration(gap*86400000))}</option>`).join('')}</select></label><div class="history-hint" id="history-hint" role="status">Άγγιξε μια κουκκίδα ή διάλεξε διάστημα από τη λίστα παρακάτω.</div></div>`;
}
export function renderWait(raw, now = Date.now()) {
  const model = waitModel(raw, now);
  if (!model.available) return `<section class="wait-comparison"><h2>Πού βρίσκεται η αναμονή σου;</h2><p>${escape(model.reason)}</p></section>`;
  return `<section class="wait-comparison" data-domain="${model.domainDays}" aria-labelledby="wait-heading"><div class="wait-heading"><div><div class="eyebrow">WAIT COMPASS</div><h2 id="wait-heading">Πού βρίσκεται η αναμονή σου;</h2></div><div class="wait-distance"><strong id="wait-distance-value">${escape(duration(Math.abs(model.deltaMs)))}</strong><span id="wait-distance-label">${model.deltaMs >= 0 ? 'πριν τον συνήθη ρυθμό' : 'πέρα από τον συνήθη ρυθμό'}</span></div></div><div class="wait-grid">${compass(model)}${linear(model)}</div><div class="wait-conclusion"><p id="wait-history-summary">${model.shorter} από τις ${model.total} προηγούμενες αναμονές είχαν ολοκληρωθεί μέσα σε ${escape(duration(model.elapsedMs))}.</p><div><span>Σημείο αναφοράς σε ώρα Κύπρου:</span> <strong>${escape(cyprus(model.expectedAt))}</strong></div><p class="wait-caution">Δικός μας υπολογισμός από το τοπικό ιστορικό global και banked records · δεν αποτελεί ανακοινωμένη ώρα reset.</p></div></section>`;
}
export function updateWait(raw, now) {
  const section = document.querySelector('.wait-comparison');
  if (!section) return;
  const model = waitModel(raw, now);
  // A long offline wait can outgrow the axis; rebuild both scales together.
  if (!model.available || !section.querySelector('.wait-grid') || Number(section.dataset.domain) !== model.domainDays) {
    section.outerHTML = renderWait(raw, now);
    return;
  }
  const current = point(model.progress), x = 24 + model.progress * 672;
  const setText = (id, text) => { const element = document.getElementById(id); if (element) element.textContent = text; };
  setText('wait-dial-elapsed', duration(model.elapsedMs));
  setText('wait-elapsed', duration(model.elapsedMs, true));
  setText('wait-percent', `${Math.round(model.pacePercent)}% του ρυθμού`);
  setText('wait-distance-value', duration(Math.abs(model.deltaMs)));
  setText('wait-distance-label', model.deltaMs >= 0 ? 'πριν τον συνήθη ρυθμό' : 'πέρα από τον συνήθη ρυθμό');
  setText('wait-history-summary', `${model.shorter} από τις ${model.total} προηγούμενες αναμονές είχαν ολοκληρωθεί μέσα σε ${duration(model.elapsedMs)}.`);
  const needle = document.getElementById('wait-needle'), dot = document.getElementById('wait-dial-dot');
  needle.setAttribute('x2', fixed(current.x)); needle.setAttribute('y2', fixed(current.y));
  dot.setAttribute('cx', fixed(current.x)); dot.setAttribute('cy', fixed(current.y));
  document.getElementById('wait-arc').setAttribute('d', arc(model.progress));
  document.getElementById('wait-fill').setAttribute('x2', fixed(x));
  document.getElementById('wait-line-dot').setAttribute('cx', fixed(x));
}
export function historyHint(element) {
  const hint = document.getElementById('history-hint');
  if (hint && element?.dataset.gap) hint.textContent = `Αναμονή ${Number(element.dataset.gapIndex) + 1}: ${duration(Number(element.dataset.gap) * 86400000)} (${days(Number(element.dataset.gap))}).`;
}


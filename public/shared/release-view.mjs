import { cyprus } from './time.mjs';
import { safeLink } from './core.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(text) {
  const pattern = /`([^`\n]+)`|\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*/g;
  let html = '', last = 0;
  for (const match of text.matchAll(pattern)) {
    html += escape(text.slice(last, match.index));
    html += match[1] ? `<code>${escape(match[1])}</code>` : match[2] ? safeLink(match[3]) ? `<a class="release-inline-link" href="${escape(safeLink(match[3]))}" target="_blank" rel="noopener noreferrer">${escape(match[2])} ↗</a>` : escape(match[2]) : `<strong>${escape(match[4])}</strong>`;
    last = match.index + match[0].length;
  }
  return html + escape(text.slice(last));
}
// Small, escaped Markdown subset: no source HTML, remote images, scripts or renderer requests.
export function markdown(body) {
  const output = []; let paragraph = [], list = null, code = null;
  const flush = () => { if (paragraph.length) { output.push(`<p>${inline(paragraph.join('\n'))}</p>`); paragraph = []; } if (list) { output.push(`</${list}>`); list = null; } };
  for (const line of String(body || '').split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { flush(); if (code) { output.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`); code = null; } else code = []; continue; }
    if (code) { code.push(line); continue; }
    const heading = line.match(/^#{1,6}\s+(.+)/), bullet = line.match(/^\s*([-*+]\s+|\d+\.\s+)(.*)/);
    if (heading) { flush(); output.push(`<h3>${inline(heading[1])}</h3>`); }
    else if (bullet) { if (paragraph.length) flush(); const tag = /^\d/.test(bullet[1]) ? 'ol' : 'ul'; if (list !== tag) { if (list) output.push(`</${list}>`); output.push(`<${tag}>`); list = tag; } output.push(`<li>${inline(bullet[2])}</li>`); }
    else if (!line.trim()) flush();
    else { if (list) flush(); paragraph.push(line); }
  }
  flush(); if (code) output.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
  return output.join('');
}
export function releasePanel(item, status = {}) {
  const notes = item.releaseNotes, comparison = notes?.comparison;
  const hint = status.loading ? 'Λήψη πλήρων σημειώσεων…' : status.error || notes?.comparisonError || (notes ? 'Αποθηκευμένο για offline ανάγνωση' : 'Οι πλήρεις σημειώσεις χρειάζονται μία αρχική σύνδεση.');
  const authored = notes?.authored;
  return `<section class="release-notes" aria-label="Σημειώσεις έκδοσης"><div class="release-status" role="status"><span class="status-dot ${status.loading ? 'release-loading' : ''}"></span><span>${escape(hint)}</span>${notes ? `<span class="release-saved">${escape(cyprus(notes.fetchedAt,'short'))} · Κύπρος</span>` : ''}</div>${authored ? `<div class="release-section-heading"><h3>Τι άλλαξε</h3><span class="tag">ΕΠΙΣΗΜΕΣ ΣΗΜΕΙΩΣΕΙΣ</span></div><div class="release-markdown">${markdown(notes.body)}</div>` : `<div class="release-section-heading"><h3>Τι άλλαξε</h3>${comparison ? `<span class="tag">${comparison.fetched} COMMITS</span>` : ''}</div><p class="release-explanation">${comparison ? 'Η ανακοίνωση δεν έχει αναλυτικές σημειώσεις. Παρακάτω: πραγματικά commits.' : 'Δεν έχουν ληφθεί πλήρεις σημειώσεις έκδοσης.'}</p>${comparison ? `<div class="release-comparison"><span class="small-label">ΣΥΓΚΡΙΣΗ ΚΩΔΙΚΑ · OPENAI / CODEX</span><a href="${escape(comparison.url)}" target="_blank" rel="noopener noreferrer">${escape(comparison.base.replace('rust-v',''))} <span>→</span> ${escape(comparison.head.replace('rust-v',''))} ↗</a></div><details class="release-provenance"><summary>${comparison.status === 'diverged' ? 'Ετικέτες με απόκλιση · τι καλύπτει η σύγκριση' : 'Προέλευση και κάλυψη σύγκρισης'}</summary><p>${comparison.status === 'diverged' ? 'Οι ετικέτες έχουν αποκλίνει: η λίστα δείχνει commits της νέας ετικέτας μετά τον κοινό πρόγονο. Δεν είναι συνταγμένες σημειώσεις έκδοσης.' : 'Καταγραφές κώδικα μεταξύ των δύο ετικετών, στην αρχική γλώσσα.'}</p></details>${!comparison.complete ? `<p class="release-provenance">Εμφανίζονται ${comparison.fetched} από ${comparison.total} commits. Η πλήρης σύγκριση ανοίγει από τον σύνδεσμο παραπάνω.</p>` : ''}<ol class="release-changes">${notes.commits.map(commit => `<li><a href="${escape(safeLink(commit.url) || '')}" target="_blank" rel="noopener noreferrer"><span>${escape(commit.title)}</span><small>${escape(commit.sha.slice(0,7))} ↗</small></a></li>`).join('')}</ol>${comparison.total === 0 ? '<p>Δεν υπάρχουν νέα commits μεταξύ αυτών των ετικετών.</p>' : ''}` : ''}`}${notes ? `<details class="release-original"><summary>Αρχικό κείμενο ανακοίνωσης${authored ? ' · Markdown' : ''}</summary><pre>${escape(notes.body || 'Η πηγή δεν παρέχει κείμενο.')}</pre></details>` : `<p class="release-provenance">${escape(item.text)}</p>`}<button class="secondary-button release-retry" data-release-retry="${escape(item.id)}" ${status.loading ? 'disabled' : ''}>${notes ? 'Ανανέωση σημειώσεων' : 'Λήψη σημειώσεων'} ↻</button></section>`;
}

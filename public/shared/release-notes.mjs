const API = 'https://api.github.com/repos/openai/codex';
const REPO = 'https://github.com/openai/codex';
const DAY = 86400000;
export function validateNotes(n){if(n?.version!==1||releaseTag(n.releaseUrl)!==n.tag||typeof n.body!=='string'||typeof n.title!=='string'||typeof n.authored!=='boolean'||!Number.isFinite(Date.parse(n.fetchedAt))||!Array.isArray(n.commits)||n.commits.length>500||n.commits.some(c=>!/^[a-f0-9]{40}$/.test(c.sha)||typeof c.title!=='string'||typeof c.message!=='string'||c.url!==`${REPO}/commit/${c.sha}`))throw Error('Μη έγκυρες αποθηκευμένες release notes.');if(n.comparison&&(!releaseTag(`${REPO}/releases/tag/${n.comparison.base}`)||n.comparison.head!==n.tag||n.comparison.url!==`${REPO}/compare/${encodeURIComponent(n.comparison.base)}...${encodeURIComponent(n.tag)}`||!Number.isSafeInteger(n.comparison.total)||!['ahead','identical','diverged'].includes(n.comparison.status)))throw Error('Μη έγκυρη σύγκριση εκδόσεων.');return n}
export function releaseTag(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://github.com' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    const tag = decodeURIComponent(parsed.pathname.match(/^\/openai\/codex\/releases\/tag\/([^/]+)$/)?.[1] || '');
    return /^rust-v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(tag) ? tag : null;
  } catch { return null; }
}
const version = tag => tag.match(/^rust-v(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/)?.slice(1);
function order(a, b) {
  const av = version(a), bv = version(b);
  for (let i = 0; i < 3; i++) if (+av[i] !== +bv[i]) return +av[i] - +bv[i];
  const ranks = { alpha: 0, beta: 1, rc: 2, undefined: 3 };
  return ranks[av[3]] - ranks[bv[3]] || +(av[4] || 0) - +(bv[4] || 0);
}
export function previousRelease(tag, items) {
  const current = version(tag); if (!current) return null;
  const candidates = [...new Set(items.map(item => releaseTag(item.url)).filter(candidate => candidate && order(candidate, tag) < 0))];
  // Compare stable releases with stable releases; prereleases prefer their own version series.
  const sameSeries = current[3] && candidates.filter(candidate => version(candidate).slice(0,3).join('.') === current.slice(0,3).join('.'));
  const eligible = sameSeries?.length ? sameSeries : candidates.filter(candidate => !version(candidate)[3]);
  return eligible.sort((a,b) => order(b,a))[0] || null;
}
export function hasReleaseNotes(body, tag) {
  const text = String(body || '').trim().replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim();
  return !!text && !new Set([tag, tag.replace(/^rust-v/, ''), `Release ${tag.replace(/^rust-v/, '')}`, `Release ${tag}`]).has(text);
}
export class ReleaseNotesReader {
  constructor(fetcher = (...args) => fetch(...args)) { this.fetcher = fetcher; this.blockedUntil = 0; }
  async json(suffix, now) {
    if (now < this.blockedUntil) throw Object.assign(new Error('Το GitHub έχει περιορίσει προσωρινά τις λήψεις.'), { retryAt: new Date(this.blockedUntil).toISOString() });
    const response = await this.fetcher(`${API}/${suffix}`, { signal: AbortSignal.timeout(12000), redirect: 'error', headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' } });
    if (!response.ok) {
      if ([403,429].includes(response.status)) {
        const reset = Number(response.headers?.get('x-ratelimit-reset')) * 1000;
        const retry = Number(response.headers?.get('retry-after')) * 1000;
        this.blockedUntil = Math.min(now + DAY, Math.max(now + 60000, reset || (retry ? now + retry : now + 15 * 60000))) + 1000;
      }
      throw Object.assign(new Error(`GitHub HTTP ${response.status}. Οι αποθηκευμένες σημειώσεις διατηρούνται.`), { retryAt: new Date(this.blockedUntil > now ? this.blockedUntil : now + 15 * 60000).toISOString() });
    }
    const text = await response.text();
    if (text.length > 6 * 1024 * 1024) throw new Error('Η απάντηση GitHub ξεπέρασε το όριο ασφαλούς λήψης.');
    return JSON.parse(text);
  }
  async read(item, items, now = Date.now()) {
    const tag = releaseTag(item.url); if (!tag) throw new Error('Δεν είναι υποστηριζόμενη έκδοση Codex.');
    const release = await this.json(`releases/tags/${encodeURIComponent(tag)}`, now);
    if (release.tag_name !== tag || releaseTag(release.html_url) !== tag || typeof release.body !== 'string') throw new Error('Η απάντηση GitHub δεν αντιστοιχεί στην έκδοση.');
    const notes = { version: 1, tag, title: String(release.name || tag).slice(0,300), body: release.body, authored: hasReleaseNotes(release.body, tag), fetchedAt: new Date(now).toISOString(), releaseUrl: item.url, publishedAt: release.published_at || null, commits: [], comparison: null, comparisonError: null };
    if (notes.authored) return notes;
    // A placeholder release body is not a changelog. Preserve it and offer actual source commits.
    try {
      let base = previousRelease(tag, items);
      if (!base) {
        const releases = await this.json('releases?per_page=100', now);
        if (!Array.isArray(releases)) throw new Error('Δεν ήταν διαθέσιμη η λίστα εκδόσεων.');
        base = previousRelease(tag, releases.filter(r => !r.draft).map(r => ({ url: r.html_url })));
      }
      if (!base) throw new Error('Δεν βρέθηκε προηγούμενη έκδοση για επαληθεύσιμη σύγκριση.');
      const comparison = { base, head: tag, url: `${REPO}/compare/${encodeURIComponent(base)}...${encodeURIComponent(tag)}`, status: null, total: null, behind: null, complete: false, fetched: 0 };
      const unique = new Map();
      for (let page = 1; page <= 5; page++) {
        const data = await this.json(`compare/${encodeURIComponent(base)}...${encodeURIComponent(tag)}?per_page=100&page=${page}`, now);
        if (!Array.isArray(data.commits) || !Number.isSafeInteger(data.total_commits) || !['ahead','identical','diverged'].includes(data.status)) throw new Error('Η μορφή σύγκρισης GitHub άλλαξε.');
        if (page === 1) { comparison.status = data.status; comparison.total = data.total_commits; comparison.behind = data.behind_by; }
        for (const commit of data.commits) {
          if (!/^[a-f0-9]{40}$/.test(commit.sha) || typeof commit.commit?.message !== 'string') throw new Error('Μη έγκυρη καταγραφή commit.');
          unique.set(commit.sha, { sha: commit.sha, title: commit.commit.message.split('\n')[0].slice(0,2000), message: commit.commit.message, url: `${REPO}/commit/${commit.sha}` });
        }
        comparison.fetched = unique.size; comparison.complete = unique.size === comparison.total;
        notes.commits = [...unique.values()]; notes.comparison = comparison;
        if (unique.size >= comparison.total || data.commits.length < 100) break;
      }
      comparison.fetched = unique.size; comparison.complete = unique.size === comparison.total;
      notes.commits = [...unique.values()]; notes.comparison = comparison;
    } catch (error) { notes.comparisonError = error.message; notes.retryAt = error.retryAt || new Date(now + 15 * 60000).toISOString(); }
    return notes;
  }
}
export function notesAreFresh(notes, now = Date.now()) {
  return notes?.version === 1 && now - Date.parse(notes.fetchedAt) < (notes.authored ? DAY : 3600000) && !notes.comparisonError;
}
export function retainReleaseNotes(previous, incoming) {
  if (!incoming.authored && incoming.comparisonError && previous?.tag === incoming.tag && previous.comparison && (!incoming.comparison || incoming.comparison.base === previous.comparison.base && incoming.commits.length < previous.commits.length)) {
    return { ...incoming, commits: previous.commits, comparison: previous.comparison, comparisonError: `${incoming.comparisonError} Η σύγκριση διατηρήθηκε από την προηγούμενη λήψη.`, comparisonFetchedAt: previous.comparisonFetchedAt || previous.fetchedAt };
  }
  return incoming;
}

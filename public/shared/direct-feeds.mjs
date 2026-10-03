import { validTime } from './time.mjs';
import { safeLink } from './core.mjs';
export const FEEDS = [
  { id: 'openai-news', name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', type: 'rss' },
  { id: 'codex-releases', name: 'Codex Releases', url: 'https://github.com/openai/codex/releases.atom', type: 'atom' },
  { id: 'openai-status', name: 'OpenAI Status', url: 'https://status.openai.com/api/v2/incidents.json', type: 'status' }
];
const decode = value => String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, entity => {
  const named = { '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'" };
  if (named[entity]) return named[entity];
  const number = entity.startsWith('&#x') ? parseInt(entity.slice(3,-1),16) : parseInt(entity.slice(2,-1),10);
  return number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
});
const plain = value => decode(value).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,6000);
const field = (text,tag) => text.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'))?.[1] || '';
function stamp(value) {
  if (!validTime(value) && !/\b(?:GMT|UTC)\b|[+-]\d{4}\s*$/.test(value || '')) return null;
  const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function explicitResetTime(text, publishedAt) {
  // Conservative: one fully stated date, clock and UTC offset near reset wording.
  // Ambiguous prose, a date alone, relative days and multiple times remain unknown.
  const matches = [...text.matchAll(/\b(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:\d{2}|\s+(?:UTC|GMT))\b/gi)];
  if (matches.length !== 1) return null;
  const match = matches[0], prefix = text.slice(Math.max(0, match.index - 200), match.index);
  if (!/\bresets?\b/i.test(prefix) || !/\b(?:will|planned|scheduled|incoming|tomorrow|at|on)\b/i.test(prefix)) return null;
  const zone = /UTC|GMT/i.test(match[3]) ? 'Z' : match[3].toUpperCase();
  const literal = `${match[1]}T${match[2]}${zone}`, parsed = Date.parse(literal);
  if (!Number.isFinite(parsed) || parsed <= Date.parse(publishedAt) || parsed - Date.parse(publishedAt) > 31 * 86400000) return null;
  const offset = zone === 'Z' ? 0 : (zone[0] === '+' ? 1 : -1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6))) * 60000;
  // Date.parse can normalize an invalid date such as 30 February; refuse it.
  if (new Date(parsed + offset).toISOString().slice(0, 16) !== `${match[1]}T${match[2].slice(0, 5)}`) return null;
  return new Date(parsed).toISOString();
}
function item(feed,id,at,url,text,kind='release',extra={}) {
  const link=safeLink(url); if(!at || !link || !text)return null;
  const reset = (feed.id==='codex-releases' || /\bcodex\b/i.test(text)) && /\b(?:global|banked|all accounts|all paid|usage limits|rate limits)\b/i.test(text) && /\bresets?\b/i.test(text);
  const delivered = reset && /\b(?:resets? (?:all )?(?:have )?(?:propagated|completed)|(?:we have|we've) reset|resets? (?:are|is) (?:live|done|complete))\b/i.test(text) && !/\b(?:will|tomorrow|planned)\b/i.test(text);
  return { id:`${feed.id}:${id}`,at,url:link,text,kind:reset? /\bbanked\b/i.test(text)?'banked':'global':kind,status:delivered?'delivered':reset?'pending':'post',author:feed.name,hasAnnouncement:true,tags:[...(kind==='release'?['release']:['status']),...(reset?['reset']:[])],origin:'direct-official',...(reset && !delivered ? { scheduledAt: explicitResetTime(text, at) } : {}),...extra };
}
export function parseFeed(feed,text) {
  if (feed.type==='status') {
    const data=JSON.parse(text); if(!Array.isArray(data.incidents))throw new Error('Η μορφή της πηγής άλλαξε.');
    return data.incidents.slice(0,100).map(record => {
      const update=record.incident_updates?.[0];
      return item(feed,record.id,stamp(record.updated_at || record.created_at),record.shortlink || `https://status.openai.com/incidents/${encodeURIComponent(record.id)}`,`${record.name}. ${update?.body || ''}`, 'signal',{serviceStatus:record.status,publishedAt:stamp(record.created_at)});
    }).filter(Boolean);
  }
  const tag=feed.type==='atom'?'entry':'item';
  if (!new RegExp(`<${feed.type==='atom'?'feed':'rss'}(?:\\s|>)`).test(text))throw new Error('Η μορφή της πηγής άλλαξε.');
  const entries=[...text.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'g'))].slice(0,150);
  return entries.map(([,entry])=>{
    const title=plain(field(entry,'title'));
    const url=feed.type==='atom' ? decode(entry.match(/<link\b[^>]*href="([^"]+)"/)?.[1]) : decode(field(entry,'link')).trim();
    const at=stamp(plain(field(entry,feed.type==='atom'?'updated':'pubDate')));
    const content=plain(field(entry,feed.type==='atom'?'content':'description'));
    return item(feed,plain(field(entry,feed.type==='atom'?'id':'guid')) || url,at,url,`${title}${content && content!==title ? '. '+content : ''}`,'release',{prerelease:feed.type==='atom' && /(?:alpha|beta|rc)[.-]?\d/i.test(title)});
  }).filter(Boolean);
}
export async function readDirectFeeds(previous={},fetcher=fetch,now=Date.now()) {
  const results=await Promise.allSettled(FEEDS.map(async feed=>{
    const response=await fetcher(feed.url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json, application/xml, text/xml','User-Agent':'ResetRadar/0.1.3'},cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const text=await response.text();if(text.length>2*1024*1024)throw new Error('Η απάντηση της πηγής είναι υπερβολικά μεγάλη.');
    return parseFeed(feed,text);
  }));
  const items=[],sources={};let successes=0;
  for(let index=0;index<FEEDS.length;index++) {
    const feed=FEEDS[index],result=results[index];
    if(result.status==='fulfilled'){successes++;items.push(...result.value);sources[feed.id]={...feed,lastSuccessAt:new Date(now).toISOString(),error:null,count:result.value.length};}
    else sources[feed.id]={...feed,lastSuccessAt:previous[feed.id]?.lastSuccessAt || null,error:result.reason.message,count:previous[feed.id]?.count || 0};
  }
  if(!successes)throw new Error('Οι απευθείας πηγές δεν ήταν διαθέσιμες: '+Object.values(sources).map(source=>source.error).join(' · '));
  return {items,sources};
}

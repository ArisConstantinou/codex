import {validTime,CYPRUS_ZONE} from './time.mjs';
import {safeLink} from './core.mjs';
import {validateNotes} from './release-notes.mjs';
export const defaults={notifications:true,dayBefore:true,resetDay:true,morning:'08:00',evening:'20:00',repeatHours:3,reducedMotion:false};
const H=3600000,D=86400000;
const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:CYPRUS_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const parts=t=>Object.fromEntries(fmt.formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
export const dateOf=t=>{const p=parts(t);return `${p.year}-${p.month}-${p.day}`};
export const shiftDay=(d,n)=>new Date(Date.parse(`${d}T12:00:00Z`)+n*D).toISOString().slice(0,10);
export function timeAt(date,clock){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock)||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date)throw Error('Μη έγκυρη ημερομηνία/ώρα Κύπρου.');
 const naive=Date.parse(`${date}T${clock}:00Z`), offsets=new Set();
 for(const d of [-12,0,12]){const t=naive+d*H,p=parts(t);offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`)-Math.floor(t/60000)*60000)}
 for(let m=0;m<=180;m++){const local=naive+m*60000,iso=new Date(local).toISOString(),ds=iso.slice(0,10),cs=iso.slice(11,16);const candidates=[...offsets].map(o=>local-o).filter(t=>{const p=parts(t);return `${p.year}-${p.month}-${p.day}`===ds&&`${p.hour}:${p.minute}`===cs});if(candidates.length)return new Date(Math.min(...candidates)).toISOString()}
 throw Error('Η τοπική ώρα δεν επιλύθηκε.');
}
export function settings(input){const s={...defaults};for(const k of Object.keys(defaults))if(input?.[k]!==undefined)s[k]=input[k];for(const k of ['notifications','dayBefore','resetDay','reducedMotion'])if(typeof s[k]!=='boolean')throw Error('Μη έγκυρη επιλογή.');for(const k of ['morning','evening'])if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s[k]))throw Error('Μη έγκυρη ώρα.');if(!Number.isFinite(s.repeatHours)||s.repeatHours!==0&&(s.repeatHours<.25||s.repeatHours>168))throw Error('Η επανάληψη πρέπει να είναι 0 ή 0,25–168 ώρες.');return s}
export function validatePlan(p){if(!p||typeof p.id!=='string'||p.id.length>1000||typeof p.title!=='string'||p.title.length>300||!validTime(p.at)||!['official','manual'].includes(p.kind)||p.url!=null&&!safeLink(p.url)||['snoozedUntil','lastNoticeAt','arrivalSeen','createdAt'].some(k=>p[k]!=null&&!validTime(p[k]))||['cancelled','dismissed','snoozePending'].some(k=>p[k]!=null&&typeof p[k]!=='boolean')||p.calendarSeen!=null&&(!Array.isArray(p.calendarSeen)||p.calendarSeen.length>100||p.calendarSeen.some(k=>typeof k!=='string'||k.length>100))||p.repeatHours!=null&&(!Number.isFinite(p.repeatHours)||p.repeatHours!==0&&(p.repeatHours<.25||p.repeatHours>168)))throw Error('Μη έγκυρη αποθηκευμένη προθεσμία.');return p}
export function calendar(p,s){const ds=dateOf(Date.parse(p.at)),rows=[];for(const [n,enabled,stage] of [[-1,s.dayBefore,'before'],[0,s.resetDay,'day']])if(enabled)for(const clock of new Set([s.morning,s.evening])){const at=timeAt(shiftDay(ds,n),clock);if(Date.parse(at)<Date.parse(p.at))rows.push({key:`${stage}:${clock}`,at,stage})}if(s.resetDay&&Date.parse(p.at)<=Date.parse(timeAt(ds,s.morning)))rows.push({key:'day:early',at:timeAt(ds,'00:00'),stage:'day'});return rows.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))}
export function due(p,s,now=Date.now()){
 validatePlan(p);const next=structuredClone(p),end=Date.parse(p.at),stamp=new Date(now).toISOString();if(now>=end)next.status='awaiting-confirmation';
 if(p.cancelled||!s.notifications||p.snoozedUntil&&now<Date.parse(p.snoozedUntil))return {plan:next,notice:null};
 const rows=calendar(p,s).filter(r=>Date.parse(r.at)<=now&&!p.calendarSeen?.includes(r.key)),repeat=p.repeatHours??s.repeatHours;
 let stage=null;if(now>=end){if(!p.arrivalSeen)stage='arrival'}else if(rows.length)stage=rows.at(-1).stage;else if(!p.lastNoticeAt)stage='new';else if(p.snoozePending)stage='snooze';else if(repeat>0&&now>=Date.parse(p.lastNoticeAt)+repeat*H)stage='repeat';
 if(!stage)return {plan:next,notice:null};next.lastNoticeAt=stamp;next.calendarSeen=[...new Set([...(p.calendarSeen||[]),...rows.map(r=>r.key)])];next.snoozePending=false;next.snoozedUntil=null;if(stage==='arrival')next.arrivalSeen=stamp;
 const titles={new:'Νέα αποθηκευμένη προθεσμία',before:'Αύριο είναι ημέρα reset',day:'Σήμερα είναι ημέρα reset',repeat:'Υπενθύμιση reset',snooze:'Το snooze ολοκληρώθηκε',arrival:'Η αποθηκευμένη ώρα έφτασε'};
 return {plan:next,notice:{id:`${p.id}:${stage}:${stamp}`,planId:p.id,stage,at:stamp,deadline:p.at,title:titles[stage],body:stage==='arrival'?'Περιμένουμε επιβεβαίωση. Το διαθέσιμο όριο δεν αλλάζει αυτόματα.':p.title,read:false}};
}
export function historyModel(records,now=Date.now()){
 const times=records.filter(r=>validTime(r.at)&&Date.parse(r.at)<=now).map(r=>Date.parse(r.at)).sort((a,b)=>a-b),gaps=times.slice(1).map((t,i)=>(t-times[i])/D).filter(n=>n>0),recent=gaps.slice(-32),count30=times.filter(t=>t>=now-30*D).length,last=times.at(-1),pace=count30>=2?30/count30:recent.length?recent.reduce((a,b)=>a+b,0)/recent.length:null;
 return {lastReset:last?new Date(last).toISOString():null,cadence:{modelOrigin:'local',method:count30>=2?'30-day-frequency':'recent-gap-mean',paceDays:pace,expectedAt:last&&pace?new Date(last+pace*D).toISOString():null,recentGaps:recent},stats:{totalTracked:records.length,count30}};
}
export function officialPlans(items){const complete=new Map();for(const x of items)if(x.status==='delivered')complete.set(x.kind,Math.max(complete.get(x.kind)||0,Date.parse(x.at)));return items.filter(x=>x.status==='pending'&&validTime(x.scheduledAt)&&Date.parse(x.at)>(complete.get(x.kind)||0)).map(x=>({id:`official:${x.id}:${x.scheduledAt}`,at:x.scheduledAt,title:'Ανακοινωμένο Codex reset',kind:'official',url:safeLink(x.url)}))}
export function reconcilePlans(previous,items){const incoming=officialPlans(items),ids=new Set(incoming.map(p=>p.id)),map=new Map(previous.map(p=>[p.id,p.kind==='official'&&!ids.has(p.id)?{...p,cancelled:true}:p]));for(const p of incoming){const old=map.get(p.id);map.set(p.id,{...old,...p,cancelled:old?.dismissed===true})}return [...map.values()]}
export function emptyState(){return {version:1,records:[],items:[],sources:{},plans:[],inbox:[],journal:[],settings:{...defaults},cursor:0,deviceCursor:0,updatedAt:new Date().toISOString(),provenance:null}}
export function validateState(s){
 if(s?.version!==1||!Number.isSafeInteger(s.cursor)||s.cursor<0||!Number.isSafeInteger(s.deviceCursor)||s.deviceCursor<0||!validTime(s.updatedAt))throw Error('Μη συμβατό backup.');
 for(const k of ['records','items','plans','inbox','journal'])if(!Array.isArray(s[k]))throw Error('Μη έγκυρο αρχείο δεδομένων.');
 for(const r of s.records)if(typeof r.id!=='string'||!validTime(r.at)||!['global','banked'].includes(r.kind)||typeof r.text!=='string'||r.url!=null&&!safeLink(r.url))throw Error('Μη έγκυρο ιστορικό.');
 for(const x of s.items)if(typeof x.id!=='string'||!validTime(x.at)||typeof x.text!=='string'||!safeLink(x.url)||x.scheduledAt!=null&&!validTime(x.scheduledAt))throw Error('Μη έγκυρη πηγή.');
 for(const x of s.items)if(x.releaseNotes){validateNotes(x.releaseNotes);if(x.releaseNotes.releaseUrl!==x.url)throw Error('Οι σημειώσεις δεν αντιστοιχούν στην έκδοση.');}
 for(const p of s.plans)validatePlan(p);for(const n of s.inbox)if(typeof n.id!=='string'||!validTime(n.at)||typeof n.title!=='string'||typeof n.body!=='string'||typeof n.read!=='boolean'||n.deadline!=null&&!validTime(n.deadline))throw Error('Μη έγκυρο inbox.');
 if(!s.sources||typeof s.sources!=='object'||!s.journal.every(x=>typeof x.id==='string'&&validTime(x.at)&&typeof x.kind==='string'))throw Error('Μη έγκυρη καταγραφή.');s.settings=settings(s.settings);return s;
}

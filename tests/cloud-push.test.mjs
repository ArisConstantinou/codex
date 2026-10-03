import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { withCloudLedger } from '../backend/cloud-store.mjs';
import { cloudAPI, cloudTick, refreshCloudSources } from '../backend/cloud-push.mjs';
class Store {
  data = null; version = 0; writes = 0; backups = new Map();
  async getWithMetadata() { return this.data ? { data: Buffer.from(this.data), etag: String(this.version) } : null; }
  async set(key,data,condition) { if(key.startsWith('recovery/')){if(this.backups.has(key))return {modified:false};this.backups.set(key,Buffer.from(data));return {modified:true};} if (condition.onlyIfNew && this.data || condition.onlyIfMatch && condition.onlyIfMatch !== String(this.version)) return { modified:false }; this.data=Buffer.from(data);this.version++;this.writes++;return { modified:true }; }
}
const now=Date.parse('2026-10-03T16:00:00Z');
function sub(){const e=createECDH('prime256v1');e.generateKeys();return {endpoint:'https://web.push.apple.com/QA-only-synthetic',keys:{p256dh:e.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}};}
function request(path,method='GET',body,token,origin='https://arisconstantinou.github.io'){return new Request('https://qa.netlify.app/api/'+path,{method,headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});}
async function register(store,plan=[]){const r=await cloudAPI(store,request('subscribe','POST',{subscription:sub(),settings:{},plans:plan}),{now});assert.equal(r.status,200);return r.json();}
test('Private SQLite survives stateless cold reload; competing writes are retried without losing data',async()=>{
 const store=new Store();await withCloudLedger(store,l=>l.set('a',1));
 await Promise.all([withCloudLedger(store,l=>l.set('b',2)),withCloudLedger(store,l=>l.set('c',3))]);
 assert.deepEqual(await withCloudLedger(store,l=>[l.get('a'),l.get('b'),l.get('c')]),[1,2,3]);
 assert.equal(store.backups.size,1);
 const before=store.data.toString('base64');await assert.rejects(withCloudLedger(store,()=>{throw Error('failed')}));assert.equal(store.data.toString('base64'),before);
 const reject={getWithMetadata:async()=>null,set:async()=>({modified:false})};await assert.rejects(withCloudLedger(reject,l=>l.set('a',1)),e=>e.status===503);
});
test('Cloud API permits only the Pages origin, authenticates devices and never returns private Windows data',async()=>{
 const store=new Store();assert.equal((await cloudAPI(store,request('config','GET',null,null,'https://evil.example'),{now})).status,403);
 assert.equal((await cloudAPI(store,request('windows-usage'),{now})).status,404);
 assert.equal((await cloudAPI(store,request('test','POST'),{now})).status,401);
 const d=await register(store);const r=await cloudAPI(store,request('config'),{now}),config=await r.json();assert.equal(r.headers.get('access-control-allow-origin'),'https://arisconstantinou.github.io');assert.ok(config.publicKey);assert.equal(JSON.stringify(config).includes('privateKey'),false);
 const inbox=await cloudAPI(store,request('inbox','GET',null,d.token),{now});assert.equal(inbox.status,200);
 assert.equal((await cloudAPI(store,request('subscribe','DELETE',null,d.token),{now})).status,200);
 assert.equal((await cloudAPI(store,request('inbox','GET',null,d.token),{now})).status,401);
});
test('Future reset reminders use Cyprus dates, survive cold tick and do not double-send overlapping ticks',async()=>{
 const store=new Store(),deadline='2026-10-04T17:00:00Z',d=await register(store,[{id:'QA-reset',kind:'manual',at:deadline,title:'QA reset'}]);
 const sent=[],sender=async(sub,payload)=>sent.push(payload);
 await Promise.all([cloudTick(store,{now,sender}),cloudTick(store,{now,sender})]);assert.equal(sent.length,1);assert.match(sent[0].notification.body,/Κυριακή 4 Οκτωβρίου 2026 στις 20:00/);
 await cloudTick(store,{now:now+1000,sender});assert.equal(sent.length,1);
 const morning=Date.parse('2026-10-04T05:00:00Z');await cloudTick(store,{now:morning,sender});assert.equal(sent.at(-1).notification.title,'Σήμερα είναι ημέρα reset');
 await cloudTick(store,{now:Date.parse(deadline),sender});assert.equal(sent.at(-1).notification.title,'Η αποθηκευμένη ώρα έφτασε');
 const r=await cloudAPI(store,request('inbox','GET',null,d.token),{now:Date.parse(deadline)}),inbox=await r.json();assert.equal(inbox.rows.length,3);assert.equal(inbox.rows.every(x=>x.transport==='transport-accepted'),true);
});
test('A crashed send lease recovers, expired Apple subscriptions stop, and test requests are bounded',async()=>{
 const store=new Store(),d=await register(store);assert.equal((await cloudAPI(store,request('test','POST',null,d.token),{now})).status,202);assert.equal((await cloudAPI(store,request('test','POST',null,d.token),{now:now+1})).status,429);
 await withCloudLedger(store,l=>l.db.prepare("UPDATE outbox SET status='sending',next_at=?").run(now+120000));let count=0;
 await cloudTick(store,{now:now+60000,sender:async()=>count++});assert.equal(count,0);
 await cloudTick(store,{now:now+120000,sender:async()=>{count++;const e=Error('Push HTTP 410');e.status=410;throw e;}});assert.equal(count,1);
 const r=await cloudAPI(store,request('inbox','GET',null,d.token),{now:now+120000}),inbox=await r.json();assert.equal(inbox.active,false);assert.equal(inbox.rows[0].transport,'subscription-expired');
});
test('Official future announcements enter the durable ledger; source loss retains the exact deadline',async()=>{
 const store=new Store(),d=await register(store);const item={id:'QA-official',kind:'global',at:'2026-10-03T15:00:00Z',scheduledAt:'2026-10-04T17:00:00Z',status:'pending',url:'https://openai.com/news/',text:'QA explicit scheduled reset',author:'QA'};
 await refreshCloudSources(store,async()=>new Response(JSON.stringify({version:1,items:[item],sources:{}})),now);
 await assert.rejects(refreshCloudSources(store,async()=>new Response('',{status:503}),now+300000));
 const inbox=await (await cloudAPI(store,request('inbox','GET',null,d.token),{now:now+300000})).json();assert.equal(inbox.plans[0].at,item.scheduledAt);assert.equal(inbox.plans[0].kind,'official');
});
test('Opting out cancels queued sends before transport and retains the notification record',async()=>{
 const store=new Store(),d=await register(store);await cloudAPI(store,request('test','POST',null,d.token),{now});
 assert.equal((await cloudAPI(store,request('preferences','POST',{settings:{notifications:false},plans:[]},d.token),{now})).status,200);
 let sends=0;await cloudTick(store,{now,sender:async()=>sends++});assert.equal(sends,0);
 const inbox=await (await cloudAPI(store,request('inbox','GET',null,d.token),{now})).json();assert.equal(inbox.rows[0].transport,'cancelled');
});

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Ledger} from './ledger.mjs';
import {newVapid,subscription,sendPush} from './push.mjs';
import {readDirectFeeds,FEEDS} from '../public/shared/direct-feeds.mjs';
import {officialPlans,reconcilePlans} from '../public/shared/domain.mjs';
import {WindowsUsageReader,localUsageAllowed} from './windows-usage.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),config=JSON.parse(await fs.readFile(path.join(root,'runtime.json'),'utf8'));
const staticDir=path.join(root,process.env.RADAR_SERVE_BUILD==='1'?'dist':'public');
const runtime=process.env.RADAR_DATA_DIR||path.join(root,'.runtime');await fs.mkdir(runtime,{recursive:true});
const ledger=new Ledger(path.join(runtime,'ledger.sqlite'));let vapid=ledger.get('vapid');if(!vapid){vapid=newVapid();ledger.set('vapid',vapid)}
const clientOrigin=process.env.RADAR_CLIENT_ORIGIN||'https://arisconstantinou.github.io',origins=new Set([clientOrigin,`http://127.0.0.1:${config.port}`]);
const getJSON=async req=>{let data='';for await(const chunk of req){data+=chunk;if(data.length>200000)throw Error('Body too large')}return JSON.parse(data||'{}')};
const seed=JSON.parse((await fs.readFile(path.join(root,'public/history-seed.json'),'utf8')).replace(/^\uFEFF/,''));
if(!ledger.get('seeded')){ledger.event('history-seed',{kind:'seed',seed});ledger.set('seeded',true)}
let refreshing=false,lastRefresh=0,flushing=false;
async function refresh(){if(refreshing)return;refreshing=true;try{const old=ledger.get('sources')||{},packet=await readDirectFeeds(old);ledger.transaction(()=>{const stored=ledger.get('items')||[],map=new Map(stored.map(x=>[x.id,x]));for(const x of packet.items){if(JSON.stringify(map.get(x.id))!==JSON.stringify(x))ledger.event(`item:${x.id}:${createHash('sha256').update(JSON.stringify(x)).digest('hex')}`,{kind:'item',item:x});map.set(x.id,x)}const items=[...map.values()];ledger.set('items',items);ledger.set('sources',packet.sources);ledger.event(`health:${Date.now()}`,{kind:'sources',sources:packet.sources});const official=officialPlans(items);for(const d of ledger.db.prepare('SELECT * FROM devices WHERE active=1').all()){const plans=JSON.parse(d.plans),manual=plans.filter(p=>p.kind==='manual'),oldPlans=new Map(plans.map(p=>[p.id,p]));const next=reconcilePlans(plans,items);ledger.db.prepare('UPDATE devices SET plans=? WHERE id=?').run(JSON.stringify(next),d.id)}});lastRefresh=Date.now()}catch(e){const old=ledger.get('sources')||{};const sources=Object.fromEntries(FEEDS.map(f=>[f.id,{...f,...old[f.id],error:e.message}]));ledger.set('sources',sources);ledger.event(`failure:${Date.now()}`,{kind:'sources',sources});}finally{refreshing=false}}
async function flush(){if(flushing)return;flushing=true;try{ledger.schedule();for(const row of ledger.jobs()){try{const n=JSON.parse(row.payload);const payload={web_push:8030,notification:{title:n.title,body:n.body,navigate:`${clientOrigin}/codex/#inbox`,tag:`radar:${n.planId||n.id}`,icon:`${clientOrigin}/codex/icon-512.png`,silent:false},radar:{...n,deviceCursor:row.seq}};await sendPush(JSON.parse(row.subscription),payload,vapid);ledger.success(row)}catch(e){ledger.failure(row,e)}}}finally{flushing=false}}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const rates=new Map();
const windowsUsage = new WindowsUsageReader();
const server=http.createServer(async(req,res)=>{const origin=req.headers.origin;if(origin&&origins.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS')}res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value))};
 try{const u=new URL(req.url,'http://localhost');if(req.method==='OPTIONS'){res.writeHead(origins.has(origin)?204:403);res.end();return}if(u.pathname.startsWith('/api/')){
 if(u.pathname==='/api/windows-usage'){
   res.removeHeader('Access-Control-Allow-Origin');
   if(!localUsageAllowed(req,config))return json(403,{error:'Local usage access refused'});
   if(req.method!=='GET')return json(405,{error:'Method not allowed'});
   return json(200,await windowsUsage.read());
 }
 if(origin&&!origins.has(origin))return json(403,{error:'Origin refused'});
 const key=req.socket.remoteAddress,bucket=rates.get(key)||{start:Date.now(),count:0};if(Date.now()-bucket.start>60000){bucket.start=Date.now();bucket.count=0}bucket.count++;rates.set(key,bucket);if(bucket.count>120)return json(429,{error:'Rate limit'});
 if(req.method==='GET'&&u.pathname==='/api/config')return json(200,{publicKey:vapid.publicKey,status:'running',lastRefreshAt:lastRefresh?new Date(lastRefresh).toISOString():null});
 if(req.method==='GET'&&u.pathname==='/api/events'){const cursor=Number(u.searchParams.get('cursor')||0);if(!Number.isSafeInteger(cursor)||cursor<0)return json(400,{error:'Invalid cursor'});const events=ledger.publicEvents(cursor);return json(200,{events,cursor:events.at(-1)?.seq||cursor,more:events.length===500})}
 if(req.method==='POST'&&u.pathname==='/api/subscribe'){if(!origin)return json(403,{error:'Origin required'});const b=await getJSON(req),sub=subscription(b.subscription);if(!Array.isArray(b.plans)||b.plans.length>1000)return json(400,{error:'Invalid plans'});return json(200,ledger.register(sub,b.settings,b.plans))}
 const d=ledger.authorize(req.headers.authorization?.replace(/^Bearer /,''));if(!d)return json(401,{error:'Device subscription needs renewal'});
 if(req.method==='GET'&&u.pathname==='/api/inbox'){const cursor=Number(u.searchParams.get('cursor')||0);if(!Number.isSafeInteger(cursor)||cursor<0)return json(400,{error:'Invalid cursor'});const rows=ledger.inbox(d.id,cursor),receipts=ledger.db.prepare('SELECT o.id,o.status AS transport,a.at AS displayRequestedAt FROM outbox o LEFT JOIN acknowledgements a ON a.id=o.id AND a.device=o.device WHERE o.device=? ORDER BY o.seq DESC LIMIT 200').all(d.id);return json(200,{rows,receipts,cursor:rows.at(-1)?.seq||cursor,more:rows.length===500,active:!!d.active,plans:JSON.parse(d.plans)})}
 if(req.method==='POST'&&u.pathname==='/api/preferences'){const b=await getJSON(req);ledger.update(d,b.settings,b.plans);return json(200,{saved:true})}
 if(req.method==='POST'&&u.pathname==='/api/test'){const id=`test:${d.id}:${Date.now()}`;ledger.queue(d.id,{id,at:new Date().toISOString(),title:'Reset Radar · δοκιμή Web Push',body:'Το μήνυμα στάλθηκε από το backend μέσω της υπηρεσίας push.',read:false});void flush();return json(202,{id,status:'queued'})}
 if(req.method==='POST'&&u.pathname==='/api/ack'){const b=await getJSON(req);ledger.ack(d.id,String(b.id));return json(200,{saved:true})}
 if(req.method==='DELETE'&&u.pathname==='/api/subscribe'){ledger.db.prepare('DELETE FROM devices WHERE id=?').run(d.id);ledger.db.prepare('DELETE FROM outbox WHERE device=?').run(d.id);return json(200,{removed:true})}
 return json(404,{error:'Not found'});
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return json(405,{error:'Method not allowed'});
 if(u.pathname==='/'){res.writeHead(302,{Location:'/codex/'});res.end();return}if(!u.pathname.startsWith('/codex/'))return json(404,{error:'Not found'});
 const relative=decodeURIComponent(u.pathname.slice(7))||'index.html',file=path.resolve(staticDir,relative);if(!file.startsWith(staticDir+path.sep))return json(403,{error:'Forbidden'});
 let body;if(relative==='config.json')body=Buffer.from(JSON.stringify({version:'0.1.2',backendUrl:`http://127.0.0.1:${config.port}`,backendStatus:'local-running'}));else body=await fs.readFile(file);
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':relative==='sw.js'?'no-cache':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'"});res.end(req.method==='HEAD'?undefined:body);
 }catch(e){json(e.code==='ENOENT'?404:400,{error:e.message==='Body too large'?'Body too large':'Invalid request'})}});
server.on('error',e=>{console.error(`Server refused port ${config.port}: ${e.code}`);clearInterval(scheduler);clearInterval(collector);ledger.close();process.exit(1)});
server.listen(config.port,config.host,()=>console.log(`Reset Radar website: http://${config.host}:${config.port}/codex/ (strict port)`));
const scheduler=setInterval(()=>void flush(),15000),collector=setInterval(()=>void refresh(),300000);if(process.env.RADAR_NO_COLLECT!=='1')void refresh();
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{clearInterval(scheduler);clearInterval(collector);server.close(()=>{ledger.close();process.exit(0)})});

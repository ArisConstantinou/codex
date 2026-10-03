import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {WindowsUsageReader,sanitizedUsage,localUsageAllowed} from '../backend/windows-usage.mjs';
import {acceptLocalUsage,localUsageOrigin} from '../public/shared/local-usage.mjs';
import {emptyState} from '../public/shared/domain.mjs';import {compareDay} from '../public/shared/day-usage.mjs';import {latestPoint,usagePanel} from '../public/shared/usage-view.mjs';
const now=Date.parse('2026-10-03T16:00:00Z'),identity='a'.repeat(64),sample=(used,at,who=identity)=>({identityHash:who,identityVerified:true,observedAt:at,planType:'pro',buckets:[{id:'codex',planType:'pro',windows:[{durationMins:10080,remainingPercent:100-used,usedPercent:used,resetsAt:'2026-10-10T00:00:00Z'}]}]});
const state=()=>({version:1,credentials:'[QA] This must never be returned',allowance:{version:1,snapshot:sample(20,'2026-10-03T15:59:30Z'),history:[sample(15,'2026-10-03T03:00:00Z'),sample(20,'2026-10-03T15:59:30Z')],dayAnchors:[]}});
test('Local bridge returns actual weekly observations and first post-06:00 reading; raw identity/credentials are excluded',()=>{
 const packet=sanitizedUsage(state(),now);assert.equal(packet.health,'live');assert.equal(packet.usage.anchors[0].remaining,85);assert.equal(packet.usage.points.at(-1).remaining,80);assert.notEqual(packet.usage.activeScope,identity);
 assert.equal(JSON.stringify(packet).includes(identity),false);assert.equal(JSON.stringify(packet).includes('credentials'),false);assert.equal(JSON.stringify(packet).includes('identityHash'),false);
 const saved=acceptLocalUsage(emptyState(),packet,now);assert.equal(compareDay(latestPoint(saved.usage),saved.usage.anchors,now).delta,-5);assert.match(usagePanel(saved.usage,now,packet),/LIVE · WINDOWS/);
});
test('Old observations are saved, never falsely live; different account observations are excluded',()=>{
 const input=state();input.allowance.history.push(sample(0,'2026-10-03T05:00:00Z','b'.repeat(64)));
 const p=sanitizedUsage(input,now+300000);assert.equal(p.health,'cached');assert.equal(p.usage.points.length,2);assert.doesNotMatch(usagePanel(p.usage,now+300000,p),/LIVE · WINDOWS/);
 input.allowance.snapshot.identityVerified=false;assert.throws(()=>sanitizedUsage(input,now));
});
test('Remote clients, public origin, cross-site fetches, null origins and DNS-rebinding Host are refused',()=>{
 const config={host:'127.0.0.1',port:5376},r={socket:{remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:5376','sec-fetch-site':'same-origin'}};
 assert.equal(localUsageAllowed(r,config),true);
 for(const headers of [{origin:'https://arisconstantinou.github.io'},{origin:'null'},{host:'evil.example:5376'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'}])assert.equal(localUsageAllowed({...r,headers:{...r.headers,...headers}},config),false);
 assert.equal(localUsageAllowed({...r,socket:{remoteAddress:'192.168.1.5'}},config),false);
 assert.equal(localUsageOrigin({protocol:'https:',hostname:'arisconstantinou.github.io'}),false);assert.equal(localUsageOrigin({protocol:'http:',hostname:'127.0.0.1'}),true);
});
test('Reader polls actual cache changes, recovers backup after corrupt primary and retains previous measurement on missing files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'radar-local-usage-')),file=path.join(dir,'radar.json'),reader=new WindowsUsageReader({file});
 try{const input=state();await fs.writeFile(file,JSON.stringify(input));let p=await reader.read(now);assert.equal(p.health,'live');
 await fs.writeFile(file+'.bak',JSON.stringify(input));input.allowance.snapshot=sample(21,'2026-10-03T16:00:00Z');input.allowance.history.push(input.allowance.snapshot);await fs.writeFile(file,JSON.stringify(input));p=await reader.read(now);assert.equal(p.usage.points.at(-1).remaining,79);
 await fs.writeFile(file,'corrupt');p=await reader.read(now);assert.equal(p.health,'cached');assert.equal(p.usage.points.at(-1).remaining,79);
 const fresh=new WindowsUsageReader({file});assert.equal((await fresh.read(now)).usage.points.at(-1).remaining,80);
 await fs.rename(file,file+'.broken');await fs.rename(file+'.bak',file+'.saved');p=await reader.read(now);assert.equal(p.health,'cached');assert.equal(p.usage.points.at(-1).remaining,79);assert.equal(JSON.stringify(p).includes(dir),false);
 }finally{const target=path.resolve(dir),base=path.resolve(os.tmpdir());assert.ok(target.startsWith(base+path.sep)&&path.basename(target).startsWith('radar-local-usage-'));await fs.rm(target,{recursive:true});}
});
test('Unavailable bridge keeps offline state; malformed/future packets cannot overwrite saved measurements',()=>{
 const s=acceptLocalUsage(emptyState(),sanitizedUsage(state(),now),now),before=JSON.stringify(s);assert.equal(acceptLocalUsage(s,{version:1,health:'unavailable',usage:null},now),s);assert.equal(JSON.stringify(s),before);
 const broken=sanitizedUsage(state(),now);broken.measuredAt='2026-10-04T16:00:00Z';assert.throws(()=>acceptLocalUsage(s,broken,now));assert.equal(JSON.stringify(s),before);
});

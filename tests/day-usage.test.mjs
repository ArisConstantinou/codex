import test from 'node:test';
import assert from 'node:assert/strict';
import {dayClock,retainAnchors,compareDay} from '../public/shared/day-usage.mjs';
import {emptyState,validateState} from '../public/shared/domain.mjs';
import {mergeUsage,usageFile,readUsageFile} from '../public/shared/usage-file.mjs';
const scope='a'.repeat(64),p=(used,at)=>({scope,used,remaining:100-used,at,resetsAt:null,origin:'manual'});
test('Personal usage persists alongside existing data; old schemas remain valid; corrupt usage is rejected',()=>{
 const s=emptyState();validateState(s);s.usage=mergeUsage(undefined,{points:[p(15,'2026-10-03T03:00:00Z'),p(20,'2026-10-03T06:00:00Z')],anchors:[],activeScope:scope});validateState(s);
 const cold=validateState(JSON.parse(JSON.stringify(s)));assert.equal(compareDay(cold.usage.points[1],cold.usage.anchors,Date.parse('2026-10-03T07:00:00Z')).delta,-5);
 s.usage.points[0].remaining=99;assert.throws(()=>validateState(s));
});
test('Personal measurement imports are validated, merge without duplicates and retain the first morning reading',async()=>{
 const early=p(15,'2026-10-03T03:00:00Z'),late=p(20,'2026-10-03T06:00:00Z'),before=mergeUsage(undefined,{points:[late],anchors:[],activeScope:scope});
 const payload=await usageFile({points:[early,late],anchors:retainAnchors([early,late]),activeScope:scope}),incoming=await readUsageFile(JSON.stringify(payload));
 const after=mergeUsage(before,incoming,true);assert.equal(after.points.length,2);assert.equal(after.anchors[0].remaining,85);assert.deepEqual(mergeUsage(after,incoming),after);
 const broken=structuredClone(payload);broken.usage.points[0].used=33;await assert.rejects(readUsageFile(JSON.stringify(broken)),/checksum/);
});
test('Cyprus daylight-saving cutoff and midnight prevent a stale morning baseline on the next day',()=>{
 assert.equal(dayClock('2026-01-03T04:00:00Z').minutes,360);assert.equal(dayClock('2026-07-03T03:00:00Z').minutes,360);
 const early=p(15,'2026-10-03T03:00:00Z');assert.equal(compareDay(early,retainAnchors([early]),Date.parse('2026-10-03T21:00:00Z')).baseline,null);
});

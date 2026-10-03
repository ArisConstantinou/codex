import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';
import {readDirectFeeds,FEEDS} from '../public/shared/direct-feeds.mjs';
import {ReleaseNotesReader,releaseTag,notesAreFresh,retainReleaseNotes} from '../public/shared/release-notes.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),file=path.join(root,'public/snapshot.json');let previous={items:[],sources:{},journal:[]};try{previous=JSON.parse(await fs.readFile(file,'utf8'))}catch{}
let packet;try{packet=await readDirectFeeds(previous.sources)}catch(e){packet={items:[],sources:Object.fromEntries(FEEDS.map(f=>[f.id,{...previous.sources[f.id],...f,error:e.message}]))}}
const items=new Map(previous.items.map(x=>[x.id,x])),journal=[...(previous.journal||[])];const now=new Date().toISOString();
for(const x of packet.items){const old=items.get(x.id),next={...x,...(old?.releaseNotes?{releaseNotes:old.releaseNotes}:{})};if(JSON.stringify(old)!==JSON.stringify(next))journal.push({id:`${x.id}:${now}`,kind:'official-item-observed',at:now,item:next});items.set(x.id,next)}
const requests=previous.releaseRequests||{blockedUntil:0,retryByTag:{}};
const reader=new ReleaseNotesReader();reader.blockedUntil=Number.isFinite(requests.blockedUntil)?requests.blockedUntil:0;
requests.retryByTag=Object.fromEntries(Object.entries(requests.retryByTag||{}).filter(([tag,at])=>releaseTag('https://github.com/openai/codex/releases/tag/'+tag)&&Number.isFinite(at)));
const latest=[...items.values()].filter(x=>releaseTag(x.url)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0],tag=releaseTag(latest?.url);
const retryAt=Math.max(reader.blockedUntil,requests.retryByTag[tag]||0,Date.parse(latest?.releaseNotes?.retryAt)||0);
if(latest&&!notesAreFresh(latest.releaseNotes)&&Date.now()>retryAt)try{latest.releaseNotes=retainReleaseNotes(latest.releaseNotes,await reader.read(latest,[...items.values()]));if(latest.releaseNotes.retryAt)requests.retryByTag[tag]=Date.parse(latest.releaseNotes.retryAt);else delete requests.retryByTag[tag];journal.push({id:`notes:${latest.id}:${now}`,kind:'release-notes-saved',at:now,notes:latest.releaseNotes})}catch(e){requests.retryByTag[tag]=Date.parse(e.retryAt)||Date.now()+15*60000;console.log(`Latest release notes retained: ${e.message}`)}
requests.blockedUntil=reader.blockedUntil;
const snapshot={version:1,generatedAt:now,items:[...items.values()],sources:packet.sources,journal,releaseRequests:requests};await fs.writeFile(file,JSON.stringify(snapshot,null,2));console.log(JSON.stringify({items:snapshot.items.length,journal:journal.length,sources:Object.fromEntries(Object.entries(packet.sources).map(([k,v])=>[k,{count:v.count,error:v.error}]))}));

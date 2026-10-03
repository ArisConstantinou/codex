import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';
import {readDirectFeeds,FEEDS} from '../public/shared/direct-feeds.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),file=path.join(root,'public/snapshot.json');let previous={items:[],sources:{},journal:[]};try{previous=JSON.parse(await fs.readFile(file,'utf8'))}catch{}
let packet;try{packet=await readDirectFeeds(previous.sources)}catch(e){packet={items:[],sources:Object.fromEntries(FEEDS.map(f=>[f.id,{...previous.sources[f.id],...f,error:e.message}]))}}
const items=new Map(previous.items.map(x=>[x.id,x])),journal=[...(previous.journal||[])];const now=new Date().toISOString();
for(const x of packet.items){if(JSON.stringify(items.get(x.id))!==JSON.stringify(x))journal.push({id:`${x.id}:${now}`,kind:'official-item-observed',at:now,item:x});items.set(x.id,x)}
const snapshot={version:1,generatedAt:now,items:[...items.values()],sources:packet.sources,journal};await fs.writeFile(file,JSON.stringify(snapshot,null,2));console.log(JSON.stringify({items:snapshot.items.length,journal:journal.length,sources:Object.fromEntries(Object.entries(packet.sources).map(([k,v])=>[k,{count:v.count,error:v.error}]))}));

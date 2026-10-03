import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const publicDir=path.join(root,'public');
async function files(dir){const list=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())list.push(...await files(p));else if(e.name!=='sw.js'&&e.name!=='snapshot.json')list.push(p)}return list.sort()}
const swFile=path.join(publicDir,'sw.js'),swSource=await fs.readFile(swFile,'utf8');
const h=createHash('sha256');for(const file of await files(publicDir)){h.update(path.relative(publicDir,file).split(path.sep).join('/'));h.update(await fs.readFile(file))}h.update(swSource.replace(/reset-radar-codex-shell-[a-z0-9.-]+';/,"reset-radar-codex-shell-REVISION';"));const revision=h.digest('hex').slice(0,16);
const sw=swSource.replace(/reset-radar-codex-shell-[a-z0-9.-]+';/,`reset-radar-codex-shell-${revision}';`);await fs.writeFile(swFile,sw);
const dist=path.join(root,'dist');await fs.mkdir(dist,{recursive:true});await fs.cp(publicDir,dist,{recursive:true});
// One graph revision prevents a new module importing an older HTTP-cached dependency.
const versioned=href=>/\.(?:mjs|js|css|png|webmanifest)$/.test(href)?`${href}?v=${revision}`:href;
for(const file of [...await files(dist),path.join(dist,'sw.js')])if(/\.(?:mjs|js)$/.test(file)){
 let code=await fs.readFile(file,'utf8');code=code.replace(/((?:from\s*|import\s*(?:\(\s*)?)['"])(\.{1,2}\/[^'"]+\.(?:mjs|js))(['"])/g,(_,start,href,end)=>start+versioned(href)+end);
 if(path.basename(file)==='sw.js')code=code.replace(/const FILES=(\[[^\n]+\]);/,(_,list)=>`const FILES=${JSON.stringify(JSON.parse(list.replaceAll("'",'"')).map(versioned))};`);
 await fs.writeFile(file,code);
}
const indexFile=path.join(dist,'index.html');await fs.writeFile(indexFile,(await fs.readFile(indexFile,'utf8')).replace(/((?:src|href)=["'])(\.\/[^"']+)(["'])/g,(_,start,href,end)=>start+versioned(href)+end));
console.log(`Static PWA built: ${revision}. Backend files, credentials and private runtime excluded.`);

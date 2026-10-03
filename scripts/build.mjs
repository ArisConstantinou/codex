import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const publicDir=path.join(root,'public');
async function files(dir){const list=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())list.push(...await files(p));else if(e.name!=='sw.js'&&e.name!=='snapshot.json')list.push(p)}return list.sort()}
const h=createHash('sha256');for(const file of await files(publicDir)){h.update(path.relative(publicDir,file));h.update(await fs.readFile(file))}const revision=h.digest('hex').slice(0,16);
const swFile=path.join(publicDir,'sw.js');const sw=(await fs.readFile(swFile,'utf8')).replace(/reset-radar-codex-shell-[a-z0-9.-]+';/,`reset-radar-codex-shell-${revision}';`);await fs.writeFile(swFile,sw);
await fs.mkdir(path.join(root,'dist'),{recursive:true});await fs.cp(path.join(root,'public'),path.join(root,'dist'),{recursive:true});console.log('Static PWA built. Backend files, credentials and private runtime excluded.');

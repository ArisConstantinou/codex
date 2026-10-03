import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
export const {chromium}=require(process.env.RADAR_PLAYWRIGHT_MODULE||'playwright-core');
export function processes(){if(process.platform!=='win32')return [];return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress'],{encoding:'utf8',maxBuffer:10*1024*1024}))}
export function ownedProcesses(profile){const all=processes(),owned=all.filter(p=>p.CommandLine?.includes(profile)).map(p=>({pid:p.ProcessId,created:p.CreationDate}));for(let change=true;change;){change=false;for(const p of all)if(owned.some(x=>x.pid===p.ParentProcessId)&&!owned.some(x=>x.pid===p.ProcessId)){owned.push({pid:p.ProcessId,created:p.CreationDate});change=true}}return owned}
export async function waitFor(page,fn,timeout=30000){const start=Date.now();while(Date.now()-start<timeout){const result=await page.evaluate(fn);if(result)return result;await page.waitForTimeout(300)}throw Error('Timed out waiting for verified condition')}

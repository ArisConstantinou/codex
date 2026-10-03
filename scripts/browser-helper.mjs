import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import {ownedTree} from './process-ownership.mjs';
const require=createRequire(import.meta.url);
export const {chromium}=require(process.env.RADAR_PLAYWRIGHT_MODULE||'playwright-core');
export function processes(){if(process.platform!=='win32')return [];return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress'],{encoding:'utf8',maxBuffer:10*1024*1024}))}
export function ownedProcesses(profile){return ownedTree(profile,processes())}
export async function waitFor(page,fn,timeout=30000){const start=Date.now();while(Date.now()-start<timeout){const result=await page.evaluate(fn);if(result)return result;await page.waitForTimeout(300)}throw Error('Timed out waiting for verified condition')}

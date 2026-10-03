import type { Context, Config } from '@netlify/functions';
import { privateStore } from './_shared/runtime.mts';
import { refreshCloudSources, cloudTick } from '../../../backend/cloud-push.mjs';

export default async (_request: Request, context: Context) => {
  const store = privateStore(context);
  try { await refreshCloudSources(store); }
  catch { console.warn('Public source unavailable; retained deadlines remain active.'); }
  await cloudTick(store);
};
export const config: Config = { schedule: '* * * * *' };

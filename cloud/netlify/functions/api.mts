import type { Context, Config } from '@netlify/functions';
import { privateStore } from './_shared/runtime.mts';
import { cloudAPI, cloudTick } from '../../../backend/cloud-push.mjs';

export default async (request: Request, context: Context) => {
  const store = privateStore(context);
  const response = await cloudAPI(store, request, { ip: context.ip });
  if (request.method === 'POST' && new URL(request.url).pathname === '/api/test' && response.status === 202) context.waitUntil(cloudTick(store));
  return response;
};
export const config: Config = { path: '/api/*' };

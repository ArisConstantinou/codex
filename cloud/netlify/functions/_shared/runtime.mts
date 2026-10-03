import { getStore, getDeployStore } from '@netlify/blobs';
import type { Context } from '@netlify/functions';

export function privateStore(context: Context) {
  // A preview must never change real subscriptions, keys or deadlines.
  return context.deploy.context === 'production' && context.deploy.published
    ? getStore({ name: 'reset-radar-private', consistency: 'strong' })
    : getDeployStore({ name: 'reset-radar-private', consistency: 'strong' });
}

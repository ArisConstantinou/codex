import { mergeUsage, validateUsage } from './usage-file.mjs';
import { validTime } from './time.mjs';
export const localUsageOrigin = location => /^http:$/.test(location.protocol) && location.hostname === '127.0.0.1';
export function acceptLocalUsage(state, packet, now = Date.now()) {
  if (packet?.version !== 1 || !['live', 'cached', 'unavailable'].includes(packet.health)) throw Error('Μη έγκυρη τοπική μέτρηση.');
  if (!packet.usage) return state;
  validateUsage(packet.usage);
  if (!validTime(packet.measuredAt) || Date.parse(packet.measuredAt) > now || packet.usage.points.some(p => p.scope !== packet.usage.activeScope || p.origin !== 'codex' || Date.parse(p.at) > now) || packet.usage.anchors.some(p => p.scope !== packet.usage.activeScope || p.origin !== 'codex' || Date.parse(p.at) > now)) throw Error('Μη έγκυρη ώρα ή βάση τοπικών μετρήσεων.');
  const last = packet.usage.points.at(-1);
  if (!last || last.at !== packet.measuredAt) throw Error('Η ώρα δεν αντιστοιχεί στη νέα μέτρηση.');
  state.usage = mergeUsage(state.usage, packet.usage, true);
  return state;
}

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Ledger } from './ledger.mjs';
const digest = data => createHash('sha256').update(data).digest('hex');

// A private, strongly consistent blob retains the existing transactional SQLite
// ledger across stateless invocations. Conditional writes prevent lost updates.
// The callback must contain only ledger operations: never network sends.
export async function withCloudLedger(store, operation, { attempts = 4, now = Date.now() } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const saved = await store.getWithMetadata('ledger.sqlite', { type: 'arrayBuffer' });
    const before = saved ? Buffer.from(saved.data) : null;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reset-radar-cloud-'));
    const file = path.join(dir, 'ledger.sqlite');
    let ledger;
    try {
      if (before) await fs.writeFile(file, before);
      ledger = new Ledger(file);
      const result = operation(ledger);
      if (result && typeof result.then === 'function') throw Error('Cloud ledger callbacks must be synchronous');
      ledger.close(); ledger = null;
      const after = await fs.readFile(file);
      if (before && digest(before) === digest(after)) return result;
      if (before) await store.set(`recovery/${new Date(now).toISOString().slice(0,10)}.sqlite`, before, { onlyIfNew: true });
      const receipt = await store.set('ledger.sqlite', after, saved ? { onlyIfMatch: saved.etag } : { onlyIfNew: true });
      if (receipt.modified) return result;
    } finally {
      ledger?.close();
      const target = path.resolve(dir), base = path.resolve(os.tmpdir());
      if (!target.startsWith(base + path.sep) || !path.basename(target).startsWith('reset-radar-cloud-')) throw Error('Invalid temporary cleanup path');
      await fs.rm(target, { recursive: true, force: true });
    }
  }
  const error = Error('Concurrent update; retry shortly'); error.status = 503; throw error;
}

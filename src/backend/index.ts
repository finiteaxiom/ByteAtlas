import { mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { isBackendRequest } from '../shared/contracts/desktop';
import { IndexStore } from './index-store';

const port = process.parentPort;
if (!port) throw new Error('UTILITY_PROCESS_REQUIRED');
let store: IndexStore | undefined;

try {
  const dataDirectory = process.argv[2];
  if (!dataDirectory || !isAbsolute(dataDirectory)) throw new Error('INVALID_DATA_DIRECTORY');
  mkdirSync(dataDirectory, { recursive: true });
  store = new IndexStore(join(dataDirectory, 'index.sqlite'));
  const health = store.recordBoot();
  port.on('message', ({ data }: { data: unknown }) => {
    if (!isBackendRequest(data)) return;
    store?.close();
    store = undefined;
    process.exit(0);
  });
  port.postMessage({ type: 'ready', health });
} catch {
  store?.close();
  port.postMessage({ type: 'failed', code: 'INDEX_START_FAILED' });
  process.exit(1);
}

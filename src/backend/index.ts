import { mkdirSync } from 'node:fs';
import { isAbsolute, join, dirname } from 'node:path';
import { isBackendRequest, isRecord } from '../shared/contracts/desktop';
import { isCatalogRequest } from '../shared/contracts/catalog';
import { IndexStore } from './index-store';
import { Scanner } from './scanner';
import { ChangeMonitor } from './change-monitor';
import { checkedPath } from './path-safety';
const port = process.parentPort;
if (!port)
    throw Error('UTILITY_PROCESS_REQUIRED');
let store: IndexStore | undefined;
let scanner: Scanner | undefined;
let monitor: ChangeMonitor | undefined;
let pending = 0;
async function dispatch(request: unknown): Promise<unknown> {
    if (!store || !scanner)
        throw Error('UNAVAILABLE');
    if (isRecord(request) && request.action === 'createTrusted' && typeof request.path === 'string' && isAbsolute(request.path))
        return scanner.create(request.path);
    if (!isCatalogRequest(request))
        throw Error('BAD_REQUEST');
    switch (request.action) {
        case 'worlds': return store.worlds();
        case 'scan':
            if(request.command==='cancel') monitor?.disable(request.worldId);
            await scanner.control(request.worldId, request.command);
            if(request.command==='start'||request.command==='resume')monitor?.enable(request.worldId);
            return store.world(request.worldId);
        case 'remove':
            monitor?.disable(request.worldId);
            await scanner.control(request.worldId, 'cancel');
            store.removeWorld(request.worldId);
            return null;
        case 'scene': return store.scene(request.worldId, request.directoryId, request.page, request.selectedId);
        case 'search': return store.search(request.worldId, request.query, request.cursor);
        case 'members':
            store.entry(request.worldId, request.directoryId);
            return store.search(request.worldId, request.query, request.cursor, request.directoryId, request.groupKey);
        case 'resolve': return store.resolve(request.worldId, request.entryId);
        case 'saveView':
            store.saveView(request.worldId, request.view);
            return null;
        case 'system': {
            const world = store.world(request.worldId), entry = store.entry(world.id, request.entryId);
            const checked = await checkedPath(world.rootPath, entry.relativePath, true);
            if (checked.link && request.operation === 'open')
                throw Error('OUTSIDE_ROOT');
            return { root: world.rootPath, relativePath: entry.relativePath, ...checked };
        }
        default: throw Error('BAD_REQUEST');
    }
}
try {
    const directory = process.argv[2];
    if (!directory || !isAbsolute(directory))
        throw Error('INVALID_DATA_DIRECTORY');
    mkdirSync(directory, { recursive: true });
    store = new IndexStore(join(directory, 'index.sqlite'));
    scanner = new Scanner(store, undefined, [dirname(directory)]);
    monitor = new ChangeMonitor(store,scanner);
    const health = store.recordBoot();
    port.on('message', ({ data }: {
        data: unknown;
    }) => {
        if (isBackendRequest(data)) {
            void monitor!.stop().then(() => { store?.close(); store = undefined; process.exit(0); });
            return;
        }
        if (!isRecord(data) || data.type !== 'catalog' || !Number.isSafeInteger(data.id))
            return;
        if (pending >= 32) {
            port.postMessage({ type: 'reply', id: data.id, error: 'BUSY' });
            return;
        }
        pending++;
        void dispatch(data.request).then(result => port.postMessage({ type: 'reply', id: data.id, data: result }), error => port.postMessage({ type: 'reply', id: data.id, error: error instanceof Error ? error.message : 'UNAVAILABLE' })).finally(() => pending--);
    });
    port.postMessage({ type: 'ready', health });
}
catch {
    store?.close();
    port.postMessage({ type: 'failed', code: 'INDEX_START_FAILED' });
    process.exit(1);
}

import { mkdtemp, mkdir, writeFile, rm, rename, symlink, opendir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { IndexStore } from '../src/backend/index-store';
import { Scanner } from '../src/backend/scanner';
import { checkedPath, within } from '../src/backend/path-safety';
import { isCatalogRequest } from '../src/shared/contracts/catalog';
const fixtures: {
    path: string;
    store: IndexStore;
    scanner: Scanner;
}[] = [];
async function fixture() { await mkdir(resolve('.artifacts'), { recursive: true }); const path = await mkdtemp(resolve('.artifacts/catalog-test-')); await mkdir(join(path, 'source')); const store = new IndexStore(join(path, 'index.sqlite')), scanner = new Scanner(store); const item = { path, store, scanner }; fixtures.push(item); return { ...item, root: join(path, 'source') }; }
afterEach(async () => { for (const f of fixtures.splice(0)) {
    await f.scanner.stop();
    f.store.close();
    if (!within(resolve('.artifacts'), f.path) || !f.path.includes('catalog-test-'))
        throw Error('Unsafe fixture cleanup');
    await rm(f.path, { recursive: true, force: true });
} });
async function complete(scanner: Scanner, store: IndexStore, id: string) { await scanner.control(id, 'start'); for (let i = 0; i < 1000; i++) {
    const world = store.world(id);
    if (!['running', 'paused'].includes(world.state))
        return world;
    await delay(10);
} throw Error('scan timeout'); }
describe('real catalog integrity', () => {
    it('discloses application data exclusions and never indexes its own storage', async () => {
        const { root, store, scanner } = await fixture();
        await mkdir(join(root, 'app-data'));
        await writeFile(join(root, 'app-data', 'index.sqlite'), 'internal');
        await writeFile(join(root, 'visible.txt'), 'ok');
        const excluded = new Scanner(store, undefined, [join(root, 'app-data')]);
        const world = await excluded.create(root);
        expect(world.excludedPaths).toEqual(['app-data']);
        await complete(excluded, store, world.id);
        expect(store.entry(world.id, world.rootId)).toMatchObject({ bytes: '2', fileCount: 1 });
        await expect(excluded.create(join(root, 'app-data'))).rejects.toThrow('OUTSIDE_ROOT');
        await excluded.stop();
    });
    it('retains descendants when a directory enumeration fails with access denied', async () => {
        const { root, store, scanner } = await fixture();
        await mkdir(join(root, 'protected'));
        await writeFile(join(root, 'protected', 'keep.txt'), 'keep');
        const world = await scanner.create(root);
        await complete(scanner, store, world.id);
        const denied = new Scanner(store, async (path, options) => { if (String(path).endsWith('protected'))
            throw Object.assign(Error('denied'), { code: 'EACCES' }); return opendir(path, options); });
        const result = await complete(denied, store, world.id);
        expect(result.errors).toBeGreaterThan(0);
        expect(store.entry(world.id, world.rootId).bytes).toBe('4');
        expect(store.search(world.id, 'keep.txt', null).entries).toHaveLength(1);
        expect(store.search(world.id, 'keep.txt', null).complete).toBe(false);
        await denied.stop();
    });
    it('stores bytes above the safe integer limit and fills holes without moving neighbors', async () => {
        const { root, store, scanner } = await fixture();
        const world = await scanner.create(root);
        const add = (name: string, bytes: string) => store.upsert(world.id, world.rootId, { name, relativePath: name, kind: 'file', bytes, modifiedAt: new Date().toISOString(), fileType: 'document', link: false }, 1);
        add('a', '9007199254740993');
        add('b', '1');
        add('c', '2');
        expect(store.entry(world.id, world.rootId).bytes).toBe('9007199254740996');
        const a = store.search(world.id, 'a', null).entries.find(e => e.name === 'a')!, c = store.search(world.id, 'c', null).entries.find(e => e.name === 'c')!;
        store.removeEntry(world.id, a.id);
        add('d', '3');
        expect(store.search(world.id, 'd', null).entries.find(e => e.name === 'd')!.slot).toBe(a.slot);
        expect(store.entry(world.id, c.id).slot).toBe(c.slot);
        expect(store.entry(world.id, world.rootId).bytes).toBe('6');
    });
    it('scans metadata, aggregates exact bytes, searches Chinese and special paths, preserves IDs and layouts', async () => {
        const { root, store, scanner } = await fixture();
        await mkdir(join(root, '中文 空格 & $'));
        await writeFile(join(root, '中文 空格 & $', '单.txt'), 'hello');
        await writeFile(join(root, '零.txt'), '');
        const world = await scanner.create(root);
        expect((await complete(scanner, store, world.id)).state).toBe('complete');
        expect(store.entry(world.id, world.rootId)).toMatchObject({ bytes: '5', fileCount: 2, directoryCount: 1 });
        for (const query of ['单', '中', '空格', '& $', '单.txt'])
            expect(store.search(world.id, query, null).entries.length).toBeGreaterThan(0);
        const old = store.search(world.id, '单.txt', null).entries[0]!;
        const oldScene = store.scene(world.id, world.rootId, 1, null);
        await writeFile(join(root, '新.txt'), 'new');
        await complete(scanner, store, world.id);
        expect(store.search(world.id, '单.txt', null).entries[0]!.id).toBe(old.id);
        const next = store.scene(world.id, world.rootId, 1, null);
        for (const object of oldScene.objects)
            expect(next.objects.find(o => o.id === object.id)).toMatchObject({ x: object.x, z: object.z });
        expect(store.entry(world.id, world.rootId).bytes).toBe('8');
        await rm(join(root, '中文 空格 & $'), { recursive: true });
        await complete(scanner, store, world.id);
        expect(store.entry(world.id, world.rootId)).toMatchObject({ bytes: '3', fileCount: 2, directoryCount: 0 });
    });
    it('preserves cache through immediate cancellation, pause, offline roots and resumes', async () => {
        const { root, store, scanner } = await fixture();
        for (let i = 0; i < 80; i++)
            await writeFile(join(root, `文件${i}.txt`), 'x');
        const world = await scanner.create(root);
        await complete(scanner, store, world.id);
        await scanner.control(world.id, 'start');
        await scanner.control(world.id, 'pause');
        expect(store.world(world.id).state).toBe('paused');
        await scanner.control(world.id, 'cancel');
        expect(store.entry(world.id, world.rootId).fileCount).toBe(80);
        await rename(root, root + '-offline');
        expect((await complete(scanner, store, world.id)).state).toBe('unavailable');
        expect(store.entry(world.id, world.rootId).fileCount).toBe(80);
        await rename(root + '-offline', root);
        expect((await complete(scanner, store, world.id)).state).toBe('complete');
    });
    it('does not follow junctions and refuses sibling-prefix and cross-world paths', async () => {
        const { root, path, store, scanner } = await fixture();
        const outside = join(path, 'source-other');
        await mkdir(outside);
        await writeFile(join(outside, 'private.txt'), 'private');
        await symlink(outside, join(root, '链接'), 'junction');
        const world = await scanner.create(root);
        await complete(scanner, store, world.id);
        const link = store.search(world.id, '链接', null).entries[0]!;
        expect(link.link).toBe(true);
        expect(store.entry(world.id, world.rootId).bytes).toBe('0');
        expect(store.search(world.id, 'private', null).entries).toHaveLength(0);
        await expect(checkedPath(root, '链接')).rejects.toThrow('OUTSIDE_ROOT');
        expect((await checkedPath(root, '链接', true)).link).toBe(true);
        expect(within(root, outside)).toBe(false);
        expect(() => store.entry('other-world', link.id)).toThrow('NOT_FOUND');
    });
    it('bounds groups and search pages and persists views independently from demo storage', async () => {
        const { root, store, scanner } = await fixture();
        for (let i = 0; i < 130; i++)
            await writeFile(join(root, `图${i}.png`), 'a');
        const world = await scanner.create(root);
        await complete(scanner, store, world.id);
        const scene = store.scene(world.id, world.rootId, 0, null);
        expect(scene.objects.length).toBeLessThanOrEqual(30);
        expect(scene.objects.reduce((s, o) => s + o.count, 0)).toBe(130);
        expect(scene.objects.every(o => o.members.length === 0)).toBe(true);
        const first = store.search(world.id, '图', null), second = store.search(world.id, '图', first.next);
        expect(first.entries).toHaveLength(60);
        expect(second.entries).toHaveLength(60);
        expect(new Set([...first.entries, ...second.entries].map(e => e.id)).size).toBe(120);
        const target = first.entries[0]!, destination = store.resolve(world.id, target.id);
        expect(destination.page).toBe(0);
        expect(store.scene(world.id, world.rootId, 0, target.id).objects.some(o => o.members.includes(target.id))).toBe(true);
        store.saveView(world.id, { directoryId: world.rootId, selectedId: target.id, page: 0, theme: 'warm', mode: 'capacity' });
        expect(store.world(world.id).view?.selectedId).toBe(target.id);
    });
    it('rejects arbitrary actions, paths, oversized batches and invalid cameras', () => {
        expect(isCatalogRequest({ action: 'worlds', requestId: '1' })).toBe(true);
        for (const request of [{ action: 'createTrusted', requestId: '1', path: 'C:\\' }, { action: 'worlds', requestId: '1', extra: true }, { action: 'search', requestId: '1', worldId: 'w', query: 'x'.repeat(257), cursor: null }, { action: 'scene', requestId: '1', worldId: 'w', directoryId: 'd', page: -1, selectedId: null }])
            expect(isCatalogRequest(request)).toBe(false);
    });
});

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { it, expect } from 'vitest';
import { IndexStore } from '../src/backend/index-store';
import { Scanner } from '../src/backend/scanner';
import { within } from '../src/backend/path-safety';
it.skipIf(process.env.BYTEATLAS_LOAD !== '1')('measures real filesystem loads with bounded scene and queries', async () => {
    await mkdir(resolve('.artifacts'), { recursive: true });
    const evidence = await mkdtemp(resolve('.artifacts/catalog-load-'));
    const results = [];
    for (const [name, count, width] of [['project', 10000, 100], ['large-tree', 100000, 500], ['dense', 20000, 20000]] as const) {
        const base = join(evidence, name), source = join(base, 'source');
        await mkdir(source, { recursive: true });
        for (let start = 0; start < count; start += width) {
            const dir = join(source, `目录_${start}`);
            await mkdir(dir);
            for (let batch = start; batch < Math.min(count, start + width); batch += 128)
                await Promise.all(Array.from({ length: Math.min(128, count - batch, start + width - batch) }, (_, j) => writeFile(join(dir, `文件_${batch + j}.txt`), '')));
        }
        const store = new IndexStore(join(base, 'index.sqlite')), scanner = new Scanner(store);
        const world = await scanner.create(source);
        let peakRSS = 0;
        const samples: number[] = [];
        let firstPageMs: number | undefined;
        const timer = setInterval(() => { peakRSS = Math.max(peakRSS, process.memoryUsage().rss); }, 50);
        const started = performance.now();
        try {
            await scanner.control(world.id, 'start');
            for (let i = 0; i < 30000; i++) {
                const start = performance.now();
                store.search(world.id, '文件_9', null);
                samples.push(performance.now() - start);
                if (firstPageMs === undefined && store.scene(world.id, world.rootId, 1, null).objects.length)
                    firstPageMs = performance.now() - started;
                if (store.world(world.id).state === 'complete')
                    break;
                await delay(10);
            }
            const elapsedMs = performance.now() - started;
            expect(store.world(world.id).state).toBe('complete');
            expect(store.entry(world.id, world.rootId).fileCount).toBe(count);
            const sceneStart = performance.now();
            const scene = store.scene(world.id, world.rootId, 1, null);
            const sceneMs = performance.now() - sceneStart;
            await scanner.control(world.id, 'start');
            await delay(20);
            const cancelStart = performance.now();
            await scanner.control(world.id, 'cancel');
            const cancelMs = performance.now() - cancelStart;
            expect(store.entry(world.id, world.rootId).fileCount).toBe(count);
            samples.sort((a, b) => a - b);
            const result = { name, count, directories: Math.ceil(count / width) + 1, elapsedMs, firstPageMs, searchP95Ms: samples[Math.floor(samples.length * .95)], searchMaxMs: samples.at(-1), sceneMs, sceneObjects: scene.objects.length, cancelMs, peakRSS, samples: samples.length, cache: 'fresh DB; fixture just created; OS cache warm; two enumeration passes', process: 'Vitest plus backend in same process; RSS sampled every 50ms' };
            results.push(result);
            console.log(JSON.stringify(result));
            await writeFile(join(evidence, 'report.json'), JSON.stringify(results, null, 2));
            expect(firstPageMs).toBeLessThan(2000);
            expect(result.searchP95Ms).toBeLessThan(250);
            expect(cancelMs).toBeLessThan(500);
            expect(sceneMs).toBeLessThan(1000);
            expect(peakRSS).toBeLessThan(512 * 1024 * 1024);
            expect(elapsedMs).toBeLessThan(180000);
        }
        finally {
            clearInterval(timer);
            await scanner.stop();
            store.close();
            if (!within(evidence, source))
                throw Error('Unsafe cleanup');
            await rm(source, { recursive: true, force: true });
        }
    }
    console.log('LOAD_EVIDENCE', evidence);
}, 600000);

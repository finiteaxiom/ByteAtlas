import { lstat, opendir, realpath } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { FileType } from '../shared/world/model';
import { IndexStore } from './index-store';
import { checkedPath, within } from './path-safety';
export function fileType(name: string): FileType { const ext = extname(name).toLowerCase(); return /\.(ts|tsx|js|jsx|py|json|html|css|rs|cpp|cs|go)$/.test(ext) ? 'code' : /\.(png|jpg|jpeg|gif|svg|webp)$/.test(ext) ? 'image' : /\.(mp4|mov|mkv|webm|avi|mp3|wav|flac|m4a|ogg)$/.test(ext) ? 'media' : /\.(zip|7z|rar|gz|tar)$/.test(ext) ? 'archive' : /\.(txt|md|pdf|docx|xlsx|pptx|csv)$/.test(ext) ? 'document' : 'other'; }
export class Scanner {
    private active?: {
        worldId: string;
        paused: boolean;
        cancelled: boolean;
        done: Promise<void>;
    };
    constructor(private store: IndexStore, private openDirectory: typeof opendir = opendir, private excludedRoots: string[] = []) { }
    get busy(): boolean { return Boolean(this.active); }
    async reconcile(worldId: string, directories?: string[]): Promise<void> {
        if(this.active) throw Error('BUSY');
        const generation=directories?this.store.selective(worldId,directories):this.store.begin(worldId);
        const job={worldId,paused:false,cancelled:false,done:Promise.resolve()};this.active=job;
        this.store.observe(worldId,Boolean(this.store.world(worldId).verifiedAt));
        job.done=this.run(job,generation,false).catch(()=>this.store.setState(worldId,'interrupted')).finally(()=>{this.store.observe(worldId,false);this.active=undefined;});
        await job.done;
    }
    async create(path: string) { const root = await realpath(path); const stat=await lstat(root); if (!stat.isDirectory())
        throw Error('BAD_REQUEST'); if (this.excludedRoots.some(path => within(path, root)))
        throw Error('OUTSIDE_ROOT'); return this.store.createWorld(root, this.excludedRoots.filter(path => within(root, path)).map(path => relative(root, path)),stat.mtime.toISOString()); }
    async control(worldId: string, command: 'start' | 'pause' | 'resume' | 'cancel'): Promise<void> {
        this.store.world(worldId);
        if (this.active && this.active.worldId !== worldId)
            throw Error('BUSY');
        if (command === 'cancel') {
            if (this.active) {
                this.active.cancelled = true;
                await this.active.done;
            }
            this.store.setState(worldId, 'cancelled');
            return;
        }
        if (command === 'pause') {
            if (this.active) {
                this.active.paused = true;
                this.store.setState(worldId, 'paused');
            }
            return;
        }
        if (this.active) {
            if (command === 'resume') {
                this.active.paused = false;
                this.store.setState(worldId, 'running');
            }
            return;
        }
        const generation = this.store.begin(worldId);
        const job = { worldId, paused: false, cancelled: false, done: Promise.resolve() };
        this.active = job;
        // A completed world has an earlier verified snapshot. Differences found by a
        // later explicit refresh are observations, while the first enumeration is not.
        this.store.observe(worldId, Boolean(this.store.world(worldId).verifiedAt));
        job.done = this.run(job, generation).catch(() => { this.store.setState(worldId, 'interrupted'); }).finally(() => {
            this.store.observe(worldId, false);
            if (this.active === job)
                this.active = undefined;
        });
    }
    private async run(job: NonNullable<Scanner['active']>, generation: number, verify = true): Promise<void> {
        const world = this.store.world(job.worldId);
        try {
            await checkedPath(world.rootPath, '');
        }
        catch {
            this.store.setState(world.id, 'unavailable');
            return;
        }
        // Persistent directory queue; no in-memory array proportional to the tree.
        while (!job.cancelled) {
            while (job.paused && !job.cancelled)
                await delay(25);
            if (job.cancelled)
                return;
            const directory = this.store.nextDirectory(world.id, generation);
            if (!directory) {
                if (verify) {
                    await this.run(job, this.store.begin(world.id), false);
                }
                else
                    this.store.finish(world.id);
                return;
            }
            this.store.directoryState(directory.id, 'partial');
            let success = true;
            let count = 0;
            try {
                if (directory.relativePath.split(/[\\/]/).length > 128)
                    throw Error('DEPTH_LIMIT');
                const checked = await checkedPath(world.rootPath, directory.relativePath);
                this.store.directoryTime(directory.id,(await lstat(checked.path)).mtime.toISOString());
                const handle = await this.openDirectory(checked.path, { bufferSize: 64 });
                let batch: Parameters<IndexStore['upsert']>[2][] = [];
                const flush = (): void => { if (!batch.length)
                    return; this.store.transaction(() => { this.store.upsertBatch(world.id, directory.id, batch, generation); this.store.batch(world.id, batch.length); }); batch = []; };
                for await (const item of handle) {
                    while (job.paused && !job.cancelled)
                        await delay(25);
                    if (job.cancelled) {
                        flush();
                        return;
                    }
                    try {
                        // Revalidate the directory before reading each child: junction replacement cannot widen scope.
                        await checkedPath(world.rootPath, directory.relativePath);
                        const path = join(checked.path, item.name);
                        if (this.excludedRoots.some(excluded => within(excluded, path)))
                            continue;
                        const stat = await lstat(path, { bigint: true });
                        if (!stat.isDirectory() && !stat.isFile() && !stat.isSymbolicLink()) {
                            success = false;
                            continue;
                        }
                        const link = stat.isSymbolicLink();
                        batch.push({ name: item.name, relativePath: relative(world.rootPath, path), kind: stat.isDirectory() && !link ? 'directory' : 'file', bytes: link ? '0' : stat.size.toString(), modifiedAt: new Date(Number(stat.mtimeMs)).toISOString(), fileType: fileType(item.name), link });
                    }
                    catch {
                        success = false;
                    }
                    if (++count % 64 === 0) {
                        flush();
                        await delay(0);
                    }
                }
                flush();
            }
            catch {
                success = false;
            }
            if (job.cancelled)
                return;
            if (success) {
                while (this.store.pruneBatch(world.id, directory.id, generation)) {
                    await delay(0);
                    while (job.paused && !job.cancelled)
                        await delay(25);
                    if (job.cancelled)
                        return;
                }
            }
            this.store.finishDirectory(world.id, directory.id, generation, success);
            if (directory.id === world.rootId && !success) {
                this.store.setState(world.id, 'unavailable');
                return;
            }
            await delay(0);
        }
    }
    async stop(): Promise<void> { if (this.active) {
        this.active.cancelled = true;
        await this.active.done;
    } }
}


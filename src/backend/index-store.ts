import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { activityScore } from '../shared/world/activity';
import { hash, type FileType, type PlacedObject } from '../shared/world/model';
import type { CatalogEntry, World, SavedView, ScenePage, EntryPage, ScanState } from '../shared/contracts/catalog';
import { DatabaseSync } from 'node:sqlite';
import type { BackendHealth } from '../shared/contracts/desktop';
// SQLite is confined to this adapter and its owning utility process.
export class IndexStore {
    private readonly db: DatabaseSync;
    private statements = new Map<string, ReturnType<DatabaseSync['prepare']>>();
    private statement(sql: string): ReturnType<DatabaseSync['prepare']> {
        const cached = this.statements.get(sql);
        if (cached)
            return cached;
        const prepared = this.db.prepare(sql);
        if (this.statements.size < 128)
            this.statements.set(sql, prepared);
        return prepared;
    }
    constructor(path: string) {
        this.db = new DatabaseSync(path, { allowExtension: false });
        try {
            this.db.exec('PRAGMA busy_timeout = 3000; PRAGMA foreign_keys = ON;');
            const version = Number(this.statement('PRAGMA user_version').get()?.user_version);
            if (version > 3)
                throw new Error('INDEX_VERSION_UNSUPPORTED');
            if (version === 0) {
                this.db.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
          INSERT INTO app_meta VALUES ('boot_count', '0');
          PRAGMA user_version = 1;
          COMMIT;
        `);
            }
            this.migrateCatalog();
            this.db.exec('PRAGMA journal_mode = WAL;');
        }
        catch (error) {
            this.db.close();
            throw error;
        }
    }
    recordBoot(): BackendHealth {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const row = this.statement("SELECT value FROM app_meta WHERE key = 'boot_count'").get();
            const count = Number(row?.value);
            if (!Number.isSafeInteger(count) || count < 0 || count >= Number.MAX_SAFE_INTEGER) {
                throw new Error('INDEX_METADATA_INVALID');
            }
            this.statement("UPDATE app_meta SET value = ? WHERE key = 'boot_count'").run(String(count + 1));
            this.db.exec('COMMIT');
            const integrity = this.statement('PRAGMA quick_check').get()?.quick_check;
            if (integrity !== 'ok')
                throw new Error('INDEX_INTEGRITY_FAILED');
            return {
                schemaVersion: 3,
                sqliteVersion: String(this.statement('SELECT sqlite_version() AS version').get()?.version),
                bootCount: count + 1,
                integrity
            };
        }
        catch (error) {
            if (this.db.isTransaction)
                this.db.exec('ROLLBACK');
            throw error;
        }
    }
    private migrateCatalog(): void {
        if (Number(this.statement('PRAGMA user_version').get()?.user_version) < 2)
            this.db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE worlds(id TEXT PRIMARY KEY, rootId TEXT NOT NULL, rootPath TEXT NOT NULL UNIQUE, name TEXT NOT NULL, state TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, discovered INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, verifiedAt TEXT, view TEXT, generation INTEGER NOT NULL DEFAULT 0) STRICT;
      CREATE TABLE entries(id TEXT PRIMARY KEY, worldId TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE, parentId TEXT, relativePath TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, bytes TEXT NOT NULL, modifiedAt TEXT NOT NULL, fileType TEXT NOT NULL, link INTEGER NOT NULL, state TEXT NOT NULL, fileCount INTEGER NOT NULL, directoryCount INTEGER NOT NULL, slot INTEGER NOT NULL, groupKey TEXT NOT NULL, seen INTEGER NOT NULL, scanned INTEGER NOT NULL DEFAULT 0, live INTEGER NOT NULL DEFAULT 1) STRICT;
      CREATE UNIQUE INDEX entry_path ON entries(worldId,relativePath) WHERE live=1;
      CREATE INDEX entry_parent ON entries(worldId,parentId,live,slot);
      CREATE INDEX entry_queue ON entries(worldId,kind,live,scanned);
      CREATE INDEX entry_group ON entries(worldId,parentId,groupKey,live,id);
      CREATE TABLE layouts(directoryId TEXT PRIMARY KEY, grouped INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1) STRICT;
      PRAGMA user_version=2;
      COMMIT;
    `);
        this.db.exec("UPDATE worlds SET state='interrupted',revision=revision+1 WHERE state IN ('running','paused')");
        this.db.exec('CREATE TABLE IF NOT EXISTS slot_counters(parentId TEXT PRIMARY KEY,nextSlot INTEGER NOT NULL) STRICT; CREATE TABLE IF NOT EXISTS free_slots(parentId TEXT NOT NULL,slot INTEGER NOT NULL,PRIMARY KEY(parentId,slot)) STRICT;');
        this.db.exec('CREATE TABLE IF NOT EXISTS type_counts(directoryId TEXT NOT NULL,fileType TEXT NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(directoryId,fileType)) STRICT;');
        if (!this.statement('PRAGMA table_info(worlds)').all().some(r => r.name === 'excludedPaths'))
            this.db.exec("ALTER TABLE worlds ADD COLUMN excludedPaths TEXT NOT NULL DEFAULT '[]'");
        this.db.exec('CREATE INDEX IF NOT EXISTS entry_search ON entries(worldId,live,id);');
        this.db.exec('CREATE TABLE IF NOT EXISTS group_slots(directoryId TEXT NOT NULL,groupKey TEXT NOT NULL,slot INTEGER NOT NULL,PRIMARY KEY(directoryId,groupKey)) STRICT;');
        if (Number(this.statement('PRAGMA user_version').get()?.user_version) < 3) {
            this.db.exec(`BEGIN IMMEDIATE;
              ALTER TABLE entries ADD COLUMN observedAt TEXT;
              ALTER TABLE entries ADD COLUMN changeKind TEXT;
              ALTER TABLE entries ADD COLUMN repository INTEGER NOT NULL DEFAULT 0;
              ALTER TABLE worlds ADD COLUMN monitor TEXT NOT NULL DEFAULT 'stopped';
              PRAGMA user_version=3; COMMIT;`);
        }
        this.db.exec("UPDATE worlds SET monitor='stopped'; UPDATE entries SET observedAt=NULL,changeKind=NULL WHERE observedAt < datetime('now','-30 days')");
        this.db.aggregate('logical_sum', { start: '0', step: (sum, value) => (BigInt(String(sum)) + BigInt(String(value))).toString() });
    }
    private rowEntry(row: unknown): CatalogEntry { const e = row as CatalogEntry; return { ...e, link: Boolean(e.link), repository: Boolean(e.repository) }; }
    private rowWorld(row: unknown): World { const w = row as unknown as Omit<World, 'view' | 'excludedPaths'> & {
        view: string | null;
        excludedPaths: string;
    }; return { ...w, view: w.view ? JSON.parse(w.view) : null, excludedPaths: JSON.parse(w.excludedPaths) }; }
    worlds(): World[] { return this.statement('SELECT * FROM worlds ORDER BY rowid DESC LIMIT 100').all().map(r => this.rowWorld(r)); }
    world(id: string): World { const row = this.statement('SELECT * FROM worlds WHERE id=?').get(id); if (!row)
        throw Error('NOT_FOUND'); return this.rowWorld(row); }
    createWorld(rootPath: string, excludedPaths: string[] = [], modifiedAt = new Date().toISOString()): World {
        const old = this.statement('SELECT * FROM worlds WHERE rootPath=?').get(rootPath);
        if (old)
            return this.rowWorld(old);
        if (this.worlds().length >= 100)
            throw Error('BUSY');
        const id = randomUUID(), rootId = randomUUID();
        this.statement("INSERT INTO worlds(id,rootId,rootPath,name,state) VALUES(?,?,?,?,'idle')").run(id, rootId, rootPath, basename(rootPath) || rootPath);
        this.upsert(id, null, { name: basename(rootPath) || rootPath, relativePath: '', kind: 'directory', bytes: '0', modifiedAt, fileType: 'other', link: false }, 0, rootId);
        this.statement('UPDATE worlds SET excludedPaths=? WHERE id=?').run(JSON.stringify(excludedPaths), id);
        return this.world(id);
    }
    entry(worldId: string, id: string): CatalogEntry { const row = this.statement('SELECT * FROM entries WHERE worldId=? AND id=? AND live=1').get(worldId, id); if (!row)
        throw Error('NOT_FOUND'); return this.rowEntry(row); }
    private ancestorsDelta(worldId: string, parentId: string | null, bytes: bigint, files: number, dirs: number): void {
        let depth = 0;
        while (parentId) {
            if (++depth > 512)
                throw Error('DEPTH_LIMIT');
            const p = this.entry(worldId, parentId);
            this.statement('UPDATE entries SET bytes=?,fileCount=fileCount+?,directoryCount=directoryCount+? WHERE id=?').run((BigInt(p.bytes) + bytes).toString(), files, dirs, p.id);
            parentId = p.parentId;
        }
    }
    transaction<T>(fn: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try {
        const result = fn();
        this.db.exec('COMMIT');
        return result;
    }
    catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
    } }
    upsert(worldId: string, parentId: string | null, input: Pick<CatalogEntry, 'name' | 'relativePath' | 'kind' | 'bytes' | 'modifiedAt' | 'fileType' | 'link'>, generation: number, forcedId?: string): void {
        const row = this.statement('SELECT * FROM entries WHERE worldId=? AND relativePath=? AND live=1').get(worldId, input.relativePath);
        let old = row ? this.rowEntry(row) : undefined;
        if (old && (old.kind !== input.kind || old.link !== input.link)) {
            this.removeEntry(worldId, old.id);
            old = undefined;
        }
        const id = old?.id ?? forcedId ?? randomUUID();
        const slot = old?.slot ?? this.allocateSlot(worldId, parentId);
        const bytes = input.kind === 'directory' ? (old?.bytes ?? '0') : input.bytes;
        const fileCount = input.kind === 'file' ? 1 : old?.fileCount ?? 0, directoryCount = old?.directoryCount ?? 0;
        const groupKey = old?.groupKey ?? (input.kind === 'file' ? `${input.fileType}:${hash(input.relativePath) % 6}` : '');
        this.statement(`INSERT INTO entries(id,worldId,parentId,relativePath,name,kind,bytes,modifiedAt,fileType,link,state,fileCount,directoryCount,slot,groupKey,seen)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes,modifiedAt=excluded.modifiedAt,fileType=excluded.fileType,seen=excluded.seen,groupKey=excluded.groupKey`).run(id, worldId, parentId, input.relativePath, input.name, input.kind, bytes, input.modifiedAt, input.kind === 'directory' ? (old?.fileType ?? 'other') : input.fileType, Number(input.link), input.kind === 'directory' ? 'unknown' : 'complete', fileCount, directoryCount, slot, groupKey, generation);
        this.ancestorsDelta(worldId, parentId, BigInt(bytes) - BigInt(old?.bytes ?? '0'), fileCount - (old?.fileCount ?? 0), old ? 0 : input.kind === 'directory' ? 1 : 0);
        if (this.observing.has(worldId) && input.kind === 'file' && (!old || old.bytes!==bytes || old.modifiedAt!==input.modifiedAt)) {
            this.markObserved(worldId,id,old?'modified':'added');
        }
        if (input.kind === 'file' && (!old || old.fileType !== input.fileType)) {
            if (old)
                this.changeTypes(worldId, parentId, old.fileType, -1);
            this.changeTypes(worldId, parentId, input.fileType, 1);
        }
    }
    // Scanner batches always share a parent directory.  Keep their durable entry
    // writes per item, but coalesce ancestor and type aggregates so a large flat
    // directory does not repeatedly rewrite the same directory and root rows.
    upsertBatch(worldId: string, parentId: string | null, inputs: Pick<CatalogEntry, 'name' | 'relativePath' | 'kind' | 'bytes' | 'modifiedAt' | 'fileType' | 'link'>[], generation: number): void {
        const pending: Array<{
            input: Pick<CatalogEntry, 'name' | 'relativePath' | 'kind' | 'bytes' | 'modifiedAt' | 'fileType' | 'link'>;
            old?: CatalogEntry;
            id: string;
            slot?: number;
            bytes: string;
            fileCount: number;
            directoryCount: number;
            groupKey: string;
        }> = [];
        for (const input of inputs) {
            const row = this.statement('SELECT * FROM entries WHERE worldId=? AND relativePath=? AND live=1').get(worldId, input.relativePath);
            let old = row ? this.rowEntry(row) : undefined;
            if (old && (old.kind !== input.kind || old.link !== input.link)) {
                this.removeEntry(worldId, old.id);
                old = undefined;
            }
            pending.push({
                input,
                old,
                id: old?.id ?? randomUUID(),
                bytes: input.kind === 'directory' ? (old?.bytes ?? '0') : input.bytes,
                fileCount: input.kind === 'file' ? 1 : old?.fileCount ?? 0,
                directoryCount: old?.directoryCount ?? 0,
                groupKey: old?.groupKey ?? (input.kind === 'file' ? `${input.fileType}:${hash(input.relativePath) % 6}` : '')
            });
        }
        const fresh = pending.filter(entry => !entry.old);
        const slots = this.allocateSlots(worldId, parentId, fresh.length);
        for (const [index, entry] of fresh.entries())
            entry.slot = slots[index];
        let bytesDelta = 0n, fileDelta = 0, directoryDelta = 0;
        const typeDeltas = new Map<FileType, number>();
        const addType = (type: FileType, delta: number): void => {
            typeDeltas.set(type, (typeDeltas.get(type) ?? 0) + delta);
        };
        for (const entry of pending) {
            const { input, old } = entry;
            const slot = old?.slot ?? entry.slot!;
            this.statement(`INSERT INTO entries(id,worldId,parentId,relativePath,name,kind,bytes,modifiedAt,fileType,link,state,fileCount,directoryCount,slot,groupKey,seen)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes,modifiedAt=excluded.modifiedAt,fileType=excluded.fileType,seen=excluded.seen,groupKey=excluded.groupKey`).run(entry.id, worldId, parentId, input.relativePath, input.name, input.kind, entry.bytes, input.modifiedAt, input.kind === 'directory' ? (old?.fileType ?? 'other') : input.fileType, Number(input.link), input.kind === 'directory' ? 'unknown' : 'complete', entry.fileCount, entry.directoryCount, slot, entry.groupKey, generation);
            bytesDelta += BigInt(entry.bytes) - BigInt(old?.bytes ?? '0');
            fileDelta += entry.fileCount - (old?.fileCount ?? 0);
            directoryDelta += old ? 0 : input.kind === 'directory' ? 1 : 0;
            if (this.observing.has(worldId) && input.kind === 'file' && (!old || old.bytes !== entry.bytes || old.modifiedAt !== input.modifiedAt))
                this.markObserved(worldId, entry.id, old ? 'modified' : 'added');
            if (input.kind === 'file' && (!old || old.fileType !== input.fileType)) {
                if (old)
                    addType(old.fileType, -1);
                addType(input.fileType, 1);
            }
        }
        if (bytesDelta !== 0n || fileDelta !== 0 || directoryDelta !== 0)
            this.ancestorsDelta(worldId, parentId, bytesDelta, fileDelta, directoryDelta);
        for (const [type, delta] of typeDeltas)
            if (delta)
                this.changeTypes(worldId, parentId, type, delta);
    }
    removeEntry(worldId: string, id: string): void {
        const old = this.entry(worldId, id);
        if(this.observing.has(worldId)) this.markObserved(worldId,id,'removed');
        this.ancestorsDelta(worldId, old.parentId, -BigInt(old.bytes), -old.fileCount, -old.directoryCount - (old.kind === 'directory' ? 1 : 0));
        if (old.kind === 'file')
            this.changeTypes(worldId, old.parentId, old.fileType, -1);
        else
            for (const row of this.statement('SELECT fileType,n FROM type_counts WHERE directoryId=?').all(id))
                this.changeTypes(worldId, old.parentId, String(row.fileType), -Number(row.n));
        if (old.parentId)
            this.statement('INSERT OR IGNORE INTO free_slots VALUES(?,?)').run(old.parentId, old.slot);
        this.statement(`WITH RECURSIVE tree(id) AS (SELECT id FROM entries WHERE id=? AND worldId=? UNION ALL SELECT e.id FROM entries e JOIN tree t ON e.parentId=t.id WHERE e.live=1) UPDATE entries SET live=0 WHERE id IN (SELECT id FROM tree)`).run(id, worldId);
    }
    private allocateSlot(worldId: string, parentId: string | null): number {
        if (!parentId)
            return 0;
        const free = this.statement('SELECT slot FROM free_slots WHERE parentId=? ORDER BY slot LIMIT 1').get(parentId);
        if (free) {
            this.statement('DELETE FROM free_slots WHERE parentId=? AND slot=?').run(parentId, free.slot!);
            return Number(free.slot);
        }
        this.statement('INSERT OR IGNORE INTO slot_counters SELECT ?,COALESCE(MAX(slot),-1)+1 FROM entries WHERE worldId=? AND parentId=? AND live=1').run(parentId, worldId, parentId);
        return Number(this.statement('UPDATE slot_counters SET nextSlot=nextSlot+1 WHERE parentId=? RETURNING nextSlot-1 AS slot').get(parentId)?.slot);
    }
    private allocateSlots(worldId: string, parentId: string | null, count: number): number[] {
        if (!parentId)
            return Array(count).fill(0);
        const result: number[] = [];
        const free = this.statement('SELECT slot FROM free_slots WHERE parentId=? ORDER BY slot LIMIT ?').all(parentId, count);
        for (const row of free) {
            const slot = Number(row.slot);
            this.statement('DELETE FROM free_slots WHERE parentId=? AND slot=?').run(parentId, slot);
            result.push(slot);
        }
        const remaining = count - result.length;
        if (!remaining)
            return result;
        this.statement('INSERT OR IGNORE INTO slot_counters SELECT ?,COALESCE(MAX(slot),-1)+1 FROM entries WHERE worldId=? AND parentId=? AND live=1').run(parentId, worldId, parentId);
        const start = Number(this.statement('UPDATE slot_counters SET nextSlot=nextSlot+? WHERE parentId=? RETURNING nextSlot-? AS slot').get(remaining, parentId, remaining)?.slot);
        for (let offset = 0; offset < remaining; offset++)
            result.push(start + offset);
        return result;
    }
    private changeTypes(worldId: string, parentId: string | null, type: string, delta: number): void {
        let depth = 0;
        while (parentId && depth++ < 512) {
            const parent = this.entry(worldId, parentId);
            this.statement('INSERT INTO type_counts VALUES(?,?,?) ON CONFLICT(directoryId,fileType) DO UPDATE SET n=n+excluded.n').run(parentId, type, delta);
            const dominant = this.statement('SELECT fileType FROM type_counts WHERE directoryId=? AND n>0 ORDER BY n DESC,fileType LIMIT 1').get(parentId)?.fileType ?? 'other';
            this.statement('UPDATE entries SET fileType=? WHERE id=?').run(dominant, parentId);
            parentId = parent.parentId;
        }
    }
    private observing = new Set<string>();
    private markObserved(worldId: string,id: string,kind: string): void {
        const at=new Date().toISOString();
        this.statement('UPDATE entries SET observedAt=?,changeKind=? WHERE id=?').run(at,kind,id);
        for(const ancestor of this.ancestors(worldId,id).slice(0,-1))this.statement("UPDATE entries SET observedAt=?,changeKind='modified' WHERE id=?").run(at,ancestor.id);
    }
    observe(worldId: string, enabled: boolean): void { if (enabled) this.observing.add(worldId); else this.observing.delete(worldId); }
    monitorState(worldId: string, state: World['monitor']): void { this.statement('UPDATE worlds SET monitor=?,revision=revision+1 WHERE id=? AND monitor<>?').run(state, worldId, state); }
    watchDirectories(worldId: string): CatalogEntry[] { return this.statement("SELECT * FROM entries WHERE worldId=? AND live=1 AND kind='directory' AND link=0 ORDER BY length(relativePath),id LIMIT 256").all(worldId).map(r=>this.rowEntry(r)); }
    selective(worldId: string, ids: string[]): number {
        const generation=this.begin(worldId);
        this.statement("UPDATE entries SET scanned=? WHERE worldId=? AND kind='directory' AND live=1").run(generation,worldId);
        for(const id of ids) this.statement('UPDATE entries SET scanned=? WHERE worldId=? AND id=? AND live=1').run(generation-1,worldId,id);
        this.statement("UPDATE worlds SET errors=(SELECT COUNT(*) FROM entries WHERE worldId=? AND live=1 AND kind='directory' AND state='unavailable' AND scanned=?) WHERE id=?").run(worldId,generation,worldId);
        return generation;
    }
    setState(worldId: string, state: ScanState): void { this.statement('UPDATE worlds SET state=?,revision=revision+1 WHERE id=?').run(state, worldId); }
    begin(worldId: string): number {
        this.world(worldId);
        this.statement("UPDATE worlds SET generation=generation+1,state='running',discovered=0,errors=0,revision=revision+1 WHERE id=?").run(worldId);
        return Number(this.statement('SELECT generation FROM worlds WHERE id=?').get(worldId)?.generation);
    }
    generation(worldId: string): number { return Number(this.statement('SELECT generation FROM worlds WHERE id=?').get(worldId)?.generation); }
    nextDirectory(worldId: string, generation: number): CatalogEntry | undefined {
        const row = this.statement("SELECT * FROM entries WHERE worldId=? AND live=1 AND kind='directory' AND scanned<? ORDER BY length(relativePath),id LIMIT 1").get(worldId, generation);
        return row ? this.rowEntry(row) : undefined;
    }
    directoryState(id: string, state: string): void { this.statement('UPDATE entries SET state=? WHERE id=?').run(state, id); }
    directoryTime(id: string, modifiedAt: string): void { this.statement('UPDATE entries SET modifiedAt=? WHERE id=?').run(modifiedAt, id); }
    batch(worldId: string, count: number): void { this.statement('UPDATE worlds SET discovered=discovered+?,revision=revision+1 WHERE id=?').run(count, worldId); }
    finishDirectory(worldId: string, id: string, generation: number, success: boolean): void {
        this.transaction(() => {
            if(success) this.statement("UPDATE entries SET repository=EXISTS(SELECT 1 FROM entries marker WHERE marker.parentId=? AND marker.name='.git' AND marker.live=1 AND marker.link=0) WHERE id=?").run(id,id);
            if (!success)
                this.statement('UPDATE worlds SET errors=errors+1 WHERE id=?').run(worldId);
            this.statement('UPDATE entries SET state=?,scanned=? WHERE id=?').run(success ? 'complete' : 'unavailable', generation, id);
            this.batch(worldId, 0);
        });
    }
    pruneBatch(worldId: string, id: string, generation: number): boolean {
        const missing = this.statement('SELECT id FROM entries WHERE worldId=? AND parentId=? AND live=1 AND seen<>? LIMIT 64').all(worldId, id, generation);
        this.transaction(() => { for (const row of missing)
            this.removeEntry(worldId, String(row.id)); });
        return missing.length === 64;
    }
    finish(worldId: string): void { this.statement("UPDATE worlds SET state='complete',verifiedAt=?,revision=revision+1 WHERE id=?").run(new Date().toISOString(), worldId); }
    removeWorld(worldId: string): void {
        this.transaction(() => {
            for (const table of ['layouts', 'group_slots', 'type_counts'])
                this.statement(`DELETE FROM ${table} WHERE directoryId IN (SELECT id FROM entries WHERE worldId=?)`).run(worldId);
            for (const table of ['slot_counters', 'free_slots'])
                this.statement(`DELETE FROM ${table} WHERE parentId IN (SELECT id FROM entries WHERE worldId=?)`).run(worldId);
            this.statement('DELETE FROM worlds WHERE id=?').run(worldId);
        });
    }
    saveView(worldId: string, view: SavedView): void { this.entry(worldId, view.directoryId); if (view.selectedId && !view.selectedId.startsWith('group:'))
        this.entry(worldId, view.selectedId); this.statement('UPDATE worlds SET view=? WHERE id=?').run(JSON.stringify(view), worldId); }
    ancestors(worldId: string, id: string): CatalogEntry[] { const result: CatalogEntry[] = []; let current: string | null = id; while (current && result.length < 512) {
        const e = this.entry(worldId, current);
        result.unshift(e);
        current = e.parentId;
    } return result; }
    private grouped(directoryId: string): boolean {
        this.statement('INSERT OR IGNORE INTO layouts(directoryId) VALUES(?)').run(directoryId);
        this.statement("UPDATE layouts SET grouped=1 WHERE directoryId=? AND (SELECT COUNT(*) FROM entries WHERE parentId=? AND live=1 AND kind='file')>18").run(directoryId, directoryId);
        return Boolean(this.statement('SELECT grouped FROM layouts WHERE directoryId=?').get(directoryId)?.grouped);
    }
    scene(worldId: string, directoryId: string, page: number, selectedId: string | null): ScenePage {
        const world = this.world(worldId), directory = this.entry(worldId, directoryId);
        if (directory.kind !== 'directory')
            throw Error('BAD_REQUEST');
        const grouped = this.grouped(directoryId);
        const rows = this.statement(`SELECT * FROM entries WHERE worldId=? AND parentId=? AND live=1 ${grouped ? "AND kind='directory'" : ''} AND slot>=? AND slot<? ORDER BY slot LIMIT 60`).all(worldId, directoryId, (page - 1) * 60, page * 60);
        const count = Number(this.statement(`SELECT COALESCE(MAX(slot),-1)+1 AS n FROM entries WHERE worldId=? AND parentId=? AND live=1 ${grouped ? "AND kind='directory'" : ''}`).get(worldId, directoryId)?.n);
        const objects: PlacedObject[] = rows.map((r, i) => { const e = this.rowEntry(r); return { id: e.id, kind: e.kind, name: e.link ? e.name + ' ↗ 链接' : e.name, statusLabel: e.kind === 'directory' ? (e.state === 'unknown' ? '? 尚未扫描' : e.state === 'unavailable' ? '! 无法访问' : world.state !== 'complete' || world.errors ? '◐ 统计尚不完整' : undefined) : e.link ? '↗ 链接 · 不跟随' : undefined, fileType: e.fileType, members: [e.id], bytes: e.bytes, repository: Boolean(e.repository), activity: activityScore(e.observedAt??e.modifiedAt,e.relativePath), count: e.fileCount, x: (e.slot % 3 - 1) * 17, z: Math.floor(e.slot % 60 / 3) * 16 }; });
        // A fixed group page follows directory pages. Group members never cross hash buckets.
        const groupPage = 0;
        if (grouped && page === groupPage) {
            const groups = this.statement("SELECT groupKey,fileType,COUNT(*) AS n,logical_sum(bytes) AS bytes,MAX(COALESCE(observedAt,modifiedAt)) AS latest FROM entries WHERE worldId=? AND parentId=? AND live=1 AND kind='file' GROUP BY groupKey ORDER BY groupKey").all(worldId, directoryId);
            for (const g of groups) {
                const bucket = Number(String(g.groupKey).split(':')[1]);
                this.statement('INSERT OR IGNORE INTO group_slots SELECT ?,?,COALESCE(MAX(slot),-1)+1 FROM group_slots WHERE directoryId=?').run(directoryId, g.groupKey!, directoryId);
                const i = Number(this.statement('SELECT slot FROM group_slots WHERE directoryId=? AND groupKey=?').get(directoryId, g.groupKey!)?.slot);
                objects.push({ id: `group:${directoryId}:${g.groupKey}`, kind: 'group', name: `${({ code: '代码', document: '文档', image: '图像', media: '影音', archive: '归档', other: '其他' } as Record<string, string>)[String(g.fileType)]}建筑群 ${bucket + 1}`, fileType: g.fileType as FileType, members: [], bytes: String(g.bytes), repository: false, activity: activityScore(String(g.latest),directory.relativePath), count: Number(g.n), x: (i % 3 - 1) * 17, z: Math.floor(i / 3) * 16 });
            }
        }
        let selected: CatalogEntry | null = null;
        if (selectedId && !selectedId.startsWith('group:')) {
            try {
                selected = this.entry(worldId, selectedId);
            }
            catch { /* retain unavailable selection in UI */ }
        }
        if (selected?.parentId === directoryId) {
            const group = objects.find(o => o.id === `group:${directoryId}:${selected!.groupKey}`);
            if (group)
                group.members = [selected.id];
        }
        return { world, directory, ancestors: this.ancestors(worldId, directoryId), objects, page, pages: Math.max(2, Math.ceil(count / 60) + 1), selected, environment: { key: directoryId, slots: count } };
    }
    resolve(worldId: string, id: string): {
        directoryId: string;
        page: number;
        entryId: string;
    } {
        const e = this.entry(worldId, id), directoryId = e.parentId ?? e.id;
        const grouped = this.grouped(directoryId);
        return { directoryId, page: e.kind === 'file' && grouped ? 0 : Math.floor(e.slot / 60) + 1, entryId: id };
    }
    search(worldId: string, query: string, cursor: string | null, directoryId?: string, groupKey?: string): EntryPage {
        const w = this.world(worldId);
        const rows = this.statement(`SELECT * FROM entries WHERE worldId=? AND live=1 AND id>? AND instr(lower(relativePath),?)>0 ${directoryId ? 'AND parentId=? AND groupKey=?' : ''} ORDER BY id LIMIT 61`).all(worldId, cursor ?? '', query.trim().toLowerCase(), ...(directoryId ? [directoryId, groupKey!] : []));
        const entries = rows.slice(0, 60).map(r => this.rowEntry(r));
        return { entries, next: rows.length > 60 ? entries.at(-1)!.id : null, complete: w.state === 'complete' && w.errors === 0 };
    }
    close(): void { this.db.close(); }
}

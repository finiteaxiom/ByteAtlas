import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { IndexStore } from '../src/backend/index-store';

const temporaryDirectories: string[] = [];
function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'byteatlas-index-test-'));
  temporaryDirectories.push(directory);
  return join(directory, 'index.sqlite');
}
afterEach(() => {
  // Every path is the absolute result of this test's own mkdtemp call.
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('IndexStore migration and persistence', () => {
  it('creates version 2 and preserves committed state after reopening', () => {
    const path = databasePath();
    const first = new IndexStore(path);
    try { expect(first.recordBoot()).toMatchObject({ schemaVersion: 3, bootCount: 1, integrity: 'ok' }); }
    finally { first.close(); }
    const second = new IndexStore(path);
    try { expect(second.recordBoot().bootCount).toBe(2); }
    finally { second.close(); }
  });

  it('refuses newer schemas without resetting or deleting data', () => {
    const path = databasePath();
    const fixture = new DatabaseSync(path);
    fixture.exec("CREATE TABLE retained(value TEXT); INSERT INTO retained VALUES ('keep'); PRAGMA user_version=99;");
    fixture.close();
    expect(() => new IndexStore(path)).toThrow('INDEX_VERSION_UNSUPPORTED');
    const result = new DatabaseSync(path);
    try {
      expect(result.prepare('PRAGMA user_version').get()?.user_version).toBe(99);
      expect(result.prepare('SELECT value FROM retained').get()?.value).toBe('keep');
    } finally { result.close(); }
  });

  it('rejects damaged metadata without overwriting it', () => {
    const path = databasePath();
    new IndexStore(path).close();
    const fixture = new DatabaseSync(path);
    fixture.prepare("UPDATE app_meta SET value = ? WHERE key='boot_count'").run('broken');
    fixture.close();
    const result = new IndexStore(path);
    try { expect(() => result.recordBoot()).toThrow('INDEX_METADATA_INVALID'); }
    finally { result.close(); }
    const check = new DatabaseSync(path);
    try { expect(check.prepare("SELECT value FROM app_meta WHERE key='boot_count'").get()?.value).toBe('broken'); }
    finally { check.close(); }
  });

  it('coalesces a directory batch without changing aggregate statistics or stable slots', () => {
    const store = new IndexStore(databasePath());
    try {
      const world = store.createWorld('C:\\fixture');
      store.transaction(() => store.upsertBatch(world.id, world.rootId, [
        { name: 'a.txt', relativePath: 'a.txt', kind: 'file', bytes: '4', modifiedAt: '2026-01-01T00:00:00.000Z', fileType: 'document', link: false },
        { name: 'b.ts', relativePath: 'b.ts', kind: 'file', bytes: '6', modifiedAt: '2026-01-01T00:00:00.000Z', fileType: 'code', link: false },
        { name: 'folder', relativePath: 'folder', kind: 'directory', bytes: '0', modifiedAt: '2026-01-01T00:00:00.000Z', fileType: 'other', link: false }
      ], 1));
      const root = store.entry(world.id, world.rootId);
      expect(root).toMatchObject({ bytes: '10', fileCount: 2, directoryCount: 1, fileType: 'code' });
      const first = store.search(world.id, 'a.txt', null).entries[0];
      store.transaction(() => store.upsertBatch(world.id, world.rootId, [
        { name: 'a.txt', relativePath: 'a.txt', kind: 'file', bytes: '4', modifiedAt: '2026-01-02T00:00:00.000Z', fileType: 'document', link: false }
      ], 2));
      expect(store.search(world.id, 'a.txt', null).entries[0]?.slot).toBe(first?.slot);
      expect(store.entry(world.id, world.rootId)).toMatchObject({ bytes: '10', fileCount: 2, directoryCount: 1 });
    } finally { store.close(); }
  });
});

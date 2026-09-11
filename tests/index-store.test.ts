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
    try { expect(first.recordBoot()).toMatchObject({ schemaVersion: 2, bootCount: 1, integrity: 'ok' }); }
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
});

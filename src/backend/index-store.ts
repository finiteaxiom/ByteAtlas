import { DatabaseSync } from 'node:sqlite';
import type { BackendHealth } from '../shared/contracts/desktop';

// SQLite is confined to this adapter and its owning utility process.
export class IndexStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path, { allowExtension: false });
    try {
      this.db.exec('PRAGMA busy_timeout = 3000; PRAGMA foreign_keys = ON;');
      const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version);
      if (version > 1) throw new Error('INDEX_VERSION_UNSUPPORTED');
      if (version === 0) {
        this.db.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
          INSERT INTO app_meta VALUES ('boot_count', '0');
          PRAGMA user_version = 1;
          COMMIT;
        `);
      }
      this.db.exec('PRAGMA journal_mode = WAL;');
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  recordBoot(): BackendHealth {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare("SELECT value FROM app_meta WHERE key = 'boot_count'").get();
      const count = Number(row?.value);
      if (!Number.isSafeInteger(count) || count < 0 || count >= Number.MAX_SAFE_INTEGER) {
        throw new Error('INDEX_METADATA_INVALID');
      }
      this.db.prepare("UPDATE app_meta SET value = ? WHERE key = 'boot_count'").run(String(count + 1));
      this.db.exec('COMMIT');
      const integrity = this.db.prepare('PRAGMA quick_check').get()?.quick_check;
      if (integrity !== 'ok') throw new Error('INDEX_INTEGRITY_FAILED');
      return {
        schemaVersion: 1,
        sqliteVersion: String(this.db.prepare('SELECT sqlite_version() AS version').get()?.version),
        bootCount: count + 1,
        integrity
      };
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void { this.db.close(); }
}

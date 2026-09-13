import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

function digest(rows) {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export function snapshotCatalogDatabase(databasePath, worldId) {
  const database = new DatabaseSync(databasePath, { readOnly: true, allowExtension: false });
  try {
    const schemaVersion = Number(database.prepare('PRAGMA user_version').get().user_version);
    const world = database.prepare('SELECT id,rootId,name,state,view FROM worlds WHERE id=?').get(worldId);
    if (!world) throw new Error(`Missing baseline world ${worldId}`);
    const entries = database.prepare("SELECT id,worldId,parentId,relativePath,kind,bytes,slot,groupKey,live FROM entries WHERE worldId=? ORDER BY id").all(worldId);
    const ids = entries.map((entry) => entry.id);
    const layouts = ids.length
      ? database.prepare(`SELECT directoryId,grouped,version FROM layouts WHERE directoryId IN (${ids.map(() => '?').join(',')}) ORDER BY directoryId`).all(...ids)
      : [];
    const groupSlots = ids.length
      ? database.prepare(`SELECT directoryId,groupKey,slot FROM group_slots WHERE directoryId IN (${ids.map(() => '?').join(',')}) ORDER BY directoryId,groupKey`).all(...ids)
      : [];
    const exactBytes = entries.filter((entry) => entry.live && entry.kind === 'file').reduce((sum, entry) => sum + BigInt(entry.bytes), 0n).toString();
    return {
      schemaVersion,
      world: { id: world.id, rootId: world.rootId, name: world.name, state: world.state, view: world.view },
      entryCount: entries.filter((entry) => entry.live).length,
      exactBytes,
      entriesDigest: digest(entries),
      layoutDigest: digest({ layouts, groupSlots })
    };
  } finally {
    database.close();
  }
}

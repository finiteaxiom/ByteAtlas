export type FileType = 'code' | 'document' | 'image' | 'archive' | 'other';
export interface Entry {
  id: string;
  parentId: string | null;
  name: string;
  kind: 'directory' | 'file';
  bytes: string;
  modifiedAt: string;
  fileType: FileType;
  repository?: boolean;
}
export interface CityObject {
  id: string;
  kind: 'directory' | 'file' | 'group';
  name: string;
  fileType: FileType;
  members: string[];
  bytes: string;
  repository: boolean;
  count: number;
}
export interface Layout {
  version: 1;
  slots: Record<string, number>;
  grouped: boolean;
}
export interface PlacedObject extends CityObject { x: number; z: number }
export interface CameraState { position: [number, number, number]; target: [number, number, number]; zoom: number }
export interface Visit { directoryId: string; selectedId: string | null; camera?: CameraState }

export function children(entries: Entry[], id: string): Entry[] { return entries.filter(e => e.parentId === id); }
export function descendants(entries: Entry[], id: string): Entry[] {
  const result: Entry[] = [];
  const queue = [id];
  const visited = new Set<string>();
  while (queue.length) {
    const parent = queue.pop()!;
    if (visited.has(parent)) continue;
    visited.add(parent);
    for (const child of children(entries, parent)) {
      result.push(child);
      if (child.kind === 'directory') queue.push(child.id);
    }
  }
  return result;
}
export function totalBytes(entries: Entry[]): string {
  return entries.filter(e => e.kind === 'file').reduce((sum, e) => sum + BigInt(e.bytes), 0n).toString();
}
export function fileHeight(bytes: string): number {
  const value = BigInt(bytes);
  if (value < 0n) throw new Error('NEGATIVE_BYTES');
  return Math.min(14, 1.4 + Math.log2(1 + Number(value > 2n ** 60n ? 2n ** 60n : value) / 1024) * 0.43);
}
export function formatBytes(bytes: string): string {
  const value = BigInt(bytes);
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let unit = 0; let divisor = 1n;
  while (value >= divisor * 1024n && unit < units.length - 1) { divisor *= 1024n; unit++; }
  return `${unit === 0 ? value : Number(value * 10n / divisor) / 10} ${units[unit]}`;
}
export function entryPath(entries: Entry[], id: string): Entry[] {
  const path: Entry[] = []; const seen = new Set<string>();
  let item = entries.find(e => e.id === id);
  while (item && !seen.has(item.id)) {
    path.unshift(item); seen.add(item.id);
    item = entries.find(e => e.id === item?.parentId);
  }
  return path;
}
export function hash(text: string): number {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

// Fixed buckets retain membership when files are inserted or renamed.
export function createObjects(entries: Entry[], directoryId: string, previous?: Layout): { objects: CityObject[]; grouped: boolean } {
  const direct = children(entries, directoryId);
  const files = direct.filter(e => e.kind === 'file');
  const grouped = Boolean(previous?.grouped) || files.length > 18;
  const objects: CityObject[] = direct.filter(e => e.kind === 'directory' || !grouped).map(e => {
    const contents = e.kind === 'directory' ? descendants(entries, e.id) : [e];
    const counts = new Map<FileType, number>();
    for (const item of contents.filter(c => c.kind === 'file')) counts.set(item.fileType, (counts.get(item.fileType) ?? 0) + 1);
    const dominant = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'other';
    return { id: e.id, kind: e.kind, name: e.name, fileType: e.kind === 'file' ? e.fileType : dominant, members: [e.id],
      bytes: totalBytes(contents), repository: Boolean(e.repository), count: contents.filter(f => f.kind === 'file').length };
  });
  if (grouped) {
    const groups = new Map<string, Entry[]>();
    for (const file of files) {
      const key = `group:${directoryId}:${file.fileType}:${hash(file.id) % 6}`;
      groups.set(key, [...(groups.get(key) ?? []), file]);
    }
    for (const [id, members] of groups) objects.push({ id, kind: 'group', name: `${typeNames[members[0]!.fileType]}建筑群 ${Number(id.split(':').at(-1)) + 1}`,
      fileType: members[0]!.fileType, members: members.map(e => e.id).sort(), bytes: totalBytes(members), repository: false, count: members.length });
  }
  return { objects, grouped };
}
export function reconcileLayout(objects: CityObject[], grouped: boolean, previous?: Layout): Layout {
  const slots: Record<string, number> = {};
  const used = new Set<number>();
  for (const object of objects) {
    const slot = previous?.slots[object.id];
    if (slot !== undefined && Number.isSafeInteger(slot) && slot >= 0 && !used.has(slot)) { slots[object.id] = slot; used.add(slot); }
  }
  for (const object of [...objects].sort((a, b) => (a.kind === 'directory' ? 0 : 1) - (b.kind === 'directory' ? 0 : 1) || a.id.localeCompare(b.id, 'en'))) {
    if (slots[object.id] !== undefined) continue;
    let slot = 0; while (used.has(slot)) slot++;
    slots[object.id] = slot; used.add(slot);
  }
  return { version: 1, slots, grouped };
}
export function placeObjects(objects: CityObject[], layout: Layout): PlacedObject[] {
  return objects.map(object => { const slot = layout.slots[object.id]!; return { ...object, x: (slot % 3 - 1) * 17, z: Math.floor(slot / 3) * 16 }; });
}
export const typeNames: Record<FileType, string> = { code: '代码', document: '文档', image: '图像', archive: '归档', other: '其他' };

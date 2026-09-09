import { describe, expect, it } from 'vitest';
import { createObjects, descendants, fileHeight, reconcileLayout, totalBytes } from '../src/shared/world/model';
import { fixture, ROOT } from '../src/renderer/demo/fixture';

describe('Stable city semantics', () => {
  it('is deterministic regardless of input order', () => {
    const a = createObjects(fixture, ROOT), b = createObjects([...fixture].reverse(), ROOT);
    expect(reconcileLayout(a.objects, a.grouped)).toEqual(reconcileLayout(b.objects, b.grouped));
  });
  it('retains surviving placements when adding and deleting objects', () => {
    const { objects, grouped } = createObjects(fixture, ROOT);
    const first = reconcileLayout(objects, grouped);
    const nextObjects = [...objects.slice(1), { ...objects[0]!, id: 'new' }];
    const next = reconcileLayout(nextObjects, grouped, first);
    for (const object of objects.slice(1)) expect(next.slots[object.id]).toBe(first.slots[object.id]);
    expect(new Set(Object.values(next.slots)).size).toBe(nextObjects.length);
  });
  it('groups each dense file once and does not move members when inserting a filename', () => {
    const first = createObjects(fixture, '05-assets');
    expect(first.objects.length).toBe(6);
    expect(first.objects.flatMap(o => o.members).length).toBe(96);
    const next = createObjects([...fixture, { ...fixture.at(-1)!, id: 'new-asset', name: 'AAA.png' }], '05-assets', reconcileLayout(first.objects, true));
    for (const group of first.objects) for (const member of group.members) expect(next.objects.find(o => o.members.includes(member))?.id).toBe(group.id);
  });
  it('preserves aggregation once enabled even when count drops', () => {
    const first = createObjects(fixture, '05-assets');
    const reduced = fixture.filter(e => e.parentId !== '05-assets' || e.id === 'asset-000');
    expect(createObjects(reduced, '05-assets', reconcileLayout(first.objects, true)).objects[0]?.kind).toBe('group');
  });
  it('represents empty directories and zero byte files without inventing bytes', () => {
    expect(createObjects(fixture, '06-empty').objects).toEqual([]);
    expect(totalBytes(descendants(fixture, '06-empty'))).toBe('0');
    expect(fileHeight('0')).toBeGreaterThan(0);
    expect(totalBytes([{ ...fixture.at(-1)!, bytes: '9007199254740993' }, { ...fixture.at(-1)!, bytes: '1' }])).toBe('9007199254740994');
  });
  it('uses one monotonic bounded height scale with no theme or directory inputs', () => {
    const heights = ['0', '1024', '1048576', '2147483648', '68719476736', '99999999999999999999999'].map(fileHeight);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(heights.at(-1)).toBeLessThanOrEqual(14);
    expect(() => fileHeight('-1')).toThrow();
  });
  it('uses actual dominant file types for directory summaries', () => {
    const { objects } = createObjects(fixture, ROOT);
    expect(objects.find(o => o.id === '02-gallery')?.fileType).toBe('image');
    expect(objects.find(o => o.id === '03-library')?.fileType).toBe('document');
    expect(objects.find(o => o.id === '04-archive')?.fileType).toBe('archive');
    expect(objects.find(o => o.id === '06-empty')?.fileType).toBe('other');
  });
});

import { describe, expect, it } from 'vitest';
import { isBackendHealth, isBackendRequest, isEmptyRequest } from '../src/shared/contracts/desktop';
import { isCatalogRequest } from '../src/shared/contracts/catalog';

describe('IPC runtime boundaries', () => {
  it('saves the renderer zoom limits while rejecting invalid camera scales', () => {
    const request = (zoom: number) => ({ action: 'saveView', requestId: 'camera', worldId: 'world', view: {
      directoryId: 'directory', selectedId: null, page: 1, mode: 'capacity', theme: 'warm',
      camera: { position: [57, 65, 66], target: [0, 0, 0], zoom }
    } });
    for (const zoom of [.32, .45, 1, 3.8, 4.1]) expect(isCatalogRequest(request(zoom))).toBe(true);
    for (const zoom of [.319, 4.101, NaN, Infinity, -1]) expect(isCatalogRequest(request(zoom))).toBe(false);
  });
  it('rejects payloads on the argument-free health endpoint', () => {
    expect(isEmptyRequest([])).toBe(true);
    expect(isEmptyRequest([{ path: 'C:\\private' }])).toBe(false);
  });
  it('accepts only a bounded shutdown command', () => {
    expect(isBackendRequest({ type: 'shutdown' })).toBe(true);
    for (const invalid of [null, [], 'shutdown', { type: 'exec' }, { type: 'shutdown', command: 'unexpected' }]) {
      expect(isBackendRequest(invalid)).toBe(false);
    }
  });
  it('does not promote malformed backend messages to ready', () => {
    const valid = { schemaVersion: 3, sqliteVersion: '3.50.0', bootCount: 1, integrity: 'ok' };
    expect(isBackendHealth(valid)).toBe(true);
    for (const invalid of [null, { ...valid, bootCount: NaN }, { ...valid, bootCount: -1 }, { ...valid, schemaVersion: 99 }, { ...valid, integrity: 'bad' }]) {
      expect(isBackendHealth(invalid)).toBe(false);
    }
  });
});

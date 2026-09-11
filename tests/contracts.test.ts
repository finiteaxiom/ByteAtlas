import { describe, expect, it } from 'vitest';
import { isBackendHealth, isBackendRequest, isEmptyRequest } from '../src/shared/contracts/desktop';

describe('IPC runtime boundaries', () => {
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
    const valid = { schemaVersion: 2, sqliteVersion: '3.50.0', bootCount: 1, integrity: 'ok' };
    expect(isBackendHealth(valid)).toBe(true);
    for (const invalid of [null, { ...valid, bootCount: NaN }, { ...valid, bootCount: -1 }, { ...valid, schemaVersion: 99 }, { ...valid, integrity: 'bad' }]) {
      expect(isBackendHealth(invalid)).toBe(false);
    }
  });
});

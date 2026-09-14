import { describe, expect, it } from 'vitest';
import { acceptsSceneAsset, chooseGroundCandidate, rect } from '../src/renderer/city/vegetation-placement';

describe('vegetation ground placement', () => {
  it('skips a candidate whose crown envelope overlaps a building', () => {
    const result = chooseGroundCandidate([rect(0, 0, 14, 14)], [rect(0, 0, 6, 6)], [[0, 0], [4.7, 4.7]], 1.5);
    expect(result).toEqual([4.7, 4.7]);
  });
  it('does not force a tree into an undersized green area', () => {
    expect(chooseGroundCandidate([rect(0, 0, 2, 2)], [], [[0, 0]], 1.5)).toBeUndefined();
  });
  it('rejects a completed model load from a replaced or disposed scene', () => {
    expect(acceptsSceneAsset(7, 8, false)).toBe(false);
    expect(acceptsSceneAsset(7, 7, true)).toBe(false);
    expect(acceptsSceneAsset(7, 7, false)).toBe(true);
  });
});

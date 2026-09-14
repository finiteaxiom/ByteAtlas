import { describe, expect, it } from 'vitest';
import { createIslandEnvironment, isSimplePolygon, polygonContains } from '../src/renderer/city/island-environment';

describe('island environment', () => {
  const city = { minX: -24, maxX: 31, minZ: -10, maxZ: 48 };
  it('is deterministic, valid, and contains the allocated city envelope', () => {
    const first = createIslandEnvironment(city, 'directory:stable'), second = createIslandEnvironment(city, 'directory:stable');
    expect(first).toEqual(second); expect(isSimplePolygon(first.outer)).toBe(true);
    const corners: Array<[number, number]> = [[city.minX, city.minZ], [city.minX, city.maxZ], [city.maxX, city.minZ], [city.maxX, city.maxZ]];
    for (const [x, z] of corners) expect(polygonContains(first.outer, x, z)).toBe(true);
  });
  it('uses its stable key rather than a visible page to vary the environment identity', () => {
    expect(createIslandEnvironment(city, 'directory:a').outer).not.toEqual(createIslandEnvironment(city, 'directory:b').outer);
  });
  it('rejects a self-crossing shoreline', () => {
    expect(isSimplePolygon([[0, 0], [3, 3], [0, 3], [3, 0]])).toBe(false);
  });
});

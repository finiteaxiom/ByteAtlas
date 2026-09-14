export type IslandPoint = readonly [number, number];
export type IslandBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type IslandEnvironment = { key: string; outer: IslandPoint[]; inner: IslandPoint[]; bounds: IslandBounds; waterBounds: IslandBounds; plantingAreas: IslandBounds[] };

const hash = (value: string): number => {
  let state = 2166136261;
  for (let index = 0; index < value.length; index++) state = Math.imul(state ^ value.charCodeAt(index), 16777619);
  return state >>> 0;
};
const noise = (seed: number, index: number): number => {
  const value = Math.sin((seed + index * 92821) * 0.000137) * 43758.5453123;
  return value - Math.floor(value);
};
const boundsOf = (points: IslandPoint[]): IslandBounds => points.reduce((result, [x, z]) => ({ minX: Math.min(result.minX, x), maxX: Math.max(result.maxX, x), minZ: Math.min(result.minZ, z), maxZ: Math.max(result.maxZ, z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

/** Stable, non-self-intersecting superellipse shoreline around an already allocated city range. */
export const createIslandEnvironment = (city: IslandBounds, key: string): IslandEnvironment => {
  const seed = hash(key), centerX = (city.minX + city.maxX) / 2, centerZ = (city.minZ + city.maxZ) / 2;
  const halfX = Math.max(15, (city.maxX - city.minX) / 2), halfZ = Math.max(15, (city.maxZ - city.minZ) / 2);
  const segments = 40, exponent = 4.2, outer: IslandPoint[] = [], inner: IslandPoint[] = [];
  // A superellipse keeps all city corners inside while its deterministic low-frequency variation avoids a circular or rectangular cut-out.
  const radiusX = (halfX + 12) / .79, radiusZ = (halfZ + 12) / .79;
  for (let index = 0; index < segments; index++) {
    const angle = index / segments * Math.PI * 2, cosine = Math.cos(angle), sine = Math.sin(angle);
    const baseX = Math.sign(cosine) * Math.abs(cosine) ** (2 / exponent) * radiusX;
    const baseZ = Math.sign(sine) * Math.abs(sine) ** (2 / exponent) * radiusZ;
    // Smooth, low-frequency deformation makes a naturally rounded shore. The key only changes its phase,
    // so pagination and transient scene changes can never turn it into a new random island.
    const variation = .974 + Math.sin(angle * 3 + noise(seed, 1) * Math.PI * 2) * .031 + Math.sin(angle * 5 + noise(seed, 2) * Math.PI * 2) * .017;
    outer.push([centerX + baseX * variation, centerZ + baseZ * variation]);
    inner.push([centerX + baseX * (variation - .078), centerZ + baseZ * (variation - .078)]);
  }
  const bounds = boundsOf(outer), waterPadding = Math.max(90, Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 1.25);
  const strip = 5.5;
  const plantingAreas: IslandBounds[] = [
    { minX: city.minX - 8, maxX: city.minX - 2.2, minZ: centerZ - Math.min(halfZ * .55, 16), maxZ: centerZ + Math.min(halfZ * .55, 16) },
    { minX: city.maxX + 2.2, maxX: city.maxX + 8, minZ: centerZ - Math.min(halfZ * .48, 15), maxZ: centerZ + Math.min(halfZ * .48, 15) },
    { minX: centerX - Math.min(halfX * .34, 15), maxX: centerX + Math.min(halfX * .34, 15), minZ: city.minZ - 8, maxZ: city.minZ - 2.2 },
    { minX: centerX - Math.min(halfX * .28, 13), maxX: centerX + Math.min(halfX * .28, 13), minZ: city.maxZ + 2.2, maxZ: city.maxZ + 8 }
  ].filter(area => area.maxX - area.minX >= strip && area.maxZ - area.minZ >= strip);
  return { key, outer, inner, bounds, waterBounds: { minX: bounds.minX - waterPadding, maxX: bounds.maxX + waterPadding, minZ: bounds.minZ - waterPadding, maxZ: bounds.maxZ + waterPadding }, plantingAreas };
};

export const polygonContains = (points: IslandPoint[], x: number, z: number): boolean => {
  let inside = false;
  for (let index = 0, prior = points.length - 1; index < points.length; prior = index++) {
    const [xi, zi] = points[index]!, [xj, zj] = points[prior]!;
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

const orientation = (a: IslandPoint, b: IslandPoint, c: IslandPoint): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segmentsCross = (a: IslandPoint, b: IslandPoint, c: IslandPoint, d: IslandPoint): boolean => {
  const abC = orientation(a, b, c), abD = orientation(a, b, d), cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  return Math.sign(abC) !== Math.sign(abD) && Math.sign(cdA) !== Math.sign(cdB) && abC !== 0 && abD !== 0 && cdA !== 0 && cdB !== 0;
};

export const isSimplePolygon = (points: IslandPoint[]): boolean => {
  if (points.length < 3 || !points.every(([x, z], index) => Number.isFinite(x) && Number.isFinite(z) && (index === 0 || x !== points[index - 1]![0] || z !== points[index - 1]![1]))) return false;
  for (let first = 0; first < points.length; first++) for (let second = first + 1; second < points.length; second++) {
    if (second === first + 1 || (first === 0 && second === points.length - 1)) continue;
    if (segmentsCross(points[first]!, points[(first + 1) % points.length]!, points[second]!, points[(second + 1) % points.length]!)) return false;
  }
  return true;
};

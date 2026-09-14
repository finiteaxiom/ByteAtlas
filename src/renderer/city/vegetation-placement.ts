export type GroundRect = { minX: number; maxX: number; minZ: number; maxZ: number };

export const rect = (x: number, z: number, width: number, depth: number): GroundRect => ({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
export const overlaps = (left: GroundRect, right: GroundRect, margin = 0): boolean => !(left.maxX + margin <= right.minX || left.minX - margin >= right.maxX || left.maxZ + margin <= right.minZ || left.minZ - margin >= right.maxZ);
export const contains = (area: GroundRect, target: GroundRect): boolean => target.minX >= area.minX && target.maxX <= area.maxX && target.minZ >= area.minZ && target.maxZ <= area.maxZ;

/** Deterministic first-fit placement. No candidate is accepted outside an explicit green area or inside a registered building envelope. */
export const chooseGroundCandidate = (areas: GroundRect[], blocked: GroundRect[], candidates: readonly [number, number][], radius: number): [number, number] | undefined => candidates.find(([x, z]) => {
  const footprint = rect(x, z, radius * 2, radius * 2);
  return areas.some(area => contains(area, footprint)) && blocked.every(obstacle => !overlaps(footprint, obstacle));
});

export const acceptsSceneAsset = (requestedRevision: number, activeRevision: number, disposed: boolean): boolean => !disposed && requestedRevision === activeRevision;

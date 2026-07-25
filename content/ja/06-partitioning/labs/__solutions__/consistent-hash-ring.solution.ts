export function hashToAngle(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return (unsigned / 4294967296) * 360;
}

export interface RingPoint {
  nodeId: string;
  angle: number;
}

export function buildRing(nodeIds: string[], vnodesPerNode: number): RingPoint[] {
  const points: RingPoint[] = [];
  for (const nodeId of nodeIds) {
    for (let i = 0; i < vnodesPerNode; i++) {
      points.push({ nodeId, angle: hashToAngle(`${nodeId}#${i}`) });
    }
  }
  points.sort((a, b) => a.angle - b.angle);
  return points;
}

export function assignKey(nodeIds: string[], key: string, vnodesPerNode: number): string | null {
  const ring = buildRing(nodeIds, vnodesPerNode);
  if (ring.length === 0) return null;
  const keyAngle = hashToAngle(key);
  for (const point of ring) {
    if (point.angle >= keyAngle) return point.nodeId;
  }
  return ring[0].nodeId;
}

export function countMovedKeys(
  oldNodeIds: string[],
  newNodeIds: string[],
  keys: string[],
  vnodesPerNode: number,
): number {
  let moved = 0;
  for (const key of keys) {
    const before = assignKey(oldNodeIds, key, vnodesPerNode);
    const after = assignKey(newNodeIds, key, vnodesPerNode);
    if (before !== after) moved++;
  }
  return moved;
}

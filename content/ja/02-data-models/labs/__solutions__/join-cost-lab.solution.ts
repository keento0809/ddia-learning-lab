export function countLookups(shape: "normalized" | "denormalized", rootCount: number): number {
  if (shape === "normalized") {
    return 1 + rootCount;
  }
  return 1;
}

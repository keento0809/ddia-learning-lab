export function chooseReadTarget(
  followers: { id: string; replicatedAt: number }[],
  clientLastWriteAt: number | null,
): string {
  if (clientLastWriteAt === null || clientLastWriteAt === undefined) {
    return followers.length > 0 ? followers[0].id : "leader";
  }
  const candidate = followers.find((f) => f.replicatedAt >= clientLastWriteAt);
  return candidate ? candidate.id : "leader";
}

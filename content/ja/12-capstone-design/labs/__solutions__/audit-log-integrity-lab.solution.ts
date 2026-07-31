export function checkAuditLogIntegrity(
  events: Array<{ seq: number }>,
): { missing: number[]; duplicates: number[] } {
  const seqCounts = new Map<number, number>();
  for (const event of events) {
    seqCounts.set(event.seq, (seqCounts.get(event.seq) ?? 0) + 1);
  }

  const seqs = [...seqCounts.keys()];
  const min = Math.min(...seqs);
  const max = Math.max(...seqs);

  const missing: number[] = [];
  for (let seq = min; seq <= max; seq++) {
    if (!seqCounts.has(seq)) missing.push(seq);
  }

  const duplicates = [...seqCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([seq]) => seq)
    .sort((a, b) => a - b);

  return { missing, duplicates };
}

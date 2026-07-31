export function mapPhase(document: string): [string, number][] {
  const words = document.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return words.map((word) => [word, 1]);
}

export function shufflePhase(pairs: [string, number][]): [string, number[]][] {
  const groups = new Map<string, number[]>();
  for (const [key, value] of pairs) {
    const existing = groups.get(key);
    if (existing) {
      existing.push(value);
    } else {
      groups.set(key, [value]);
    }
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function reducePhase(groups: [string, number[]][]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, values] of groups) {
    result[key] = values.reduce((sum, value) => sum + value, 0);
  }
  return result;
}

export function wordCount(documents: string[]): Record<string, number> {
  const allPairs = documents.flatMap((document) => mapPhase(document));
  const groups = shufflePhase(allPairs);
  return reducePhase(groups);
}

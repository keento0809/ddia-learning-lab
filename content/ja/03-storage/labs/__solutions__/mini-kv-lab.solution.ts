interface KvLogEntry {
  key: string;
  value: string;
}

interface KvStore {
  log: KvLogEntry[];
  index: Record<string, number>;
}

export function put(store: KvStore, key: string, value: string): KvStore {
  const log = [...store.log, { key, value }];
  const index = { ...store.index, [key]: log.length - 1 };
  return { log, index };
}

export function get(store: KvStore, key: string): string | null {
  const offset = store.index[key];
  if (offset === undefined) return null;
  return store.log[offset].value;
}

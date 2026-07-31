type FieldType = "uint32" | "bool" | "string";

interface SchemaField {
  tag: number;
  key: string;
  type: FieldType;
}

function typeCode(type: FieldType): number {
  if (type === "uint32") return 0;
  if (type === "bool") return 1;
  return 2;
}

export function encodeCompact(record: Record<string, unknown>, schema: SchemaField[]): number[] {
  const bytes: number[] = [];
  for (const field of schema) {
    const value = record[field.key];
    if (!(field.key in record) || value === undefined) continue;

    bytes.push(field.tag, typeCode(field.type));

    if (field.type === "uint32") {
      const n = value as number;
      bytes.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
    } else if (field.type === "bool") {
      bytes.push(value ? 1 : 0);
    } else {
      const payload = Array.from(new TextEncoder().encode(value as string));
      const len = payload.length;
      bytes.push((len >>> 8) & 0xff, len & 0xff, ...payload);
    }
  }
  return bytes;
}

export function decodeCompact(bytes: number[], schema: SchemaField[]): Record<string, unknown> {
  const byTag = new Map(schema.map((field) => [field.tag, field]));
  const result: Record<string, unknown> = {};
  let i = 0;

  while (i < bytes.length) {
    const tag = bytes[i++];
    const type = bytes[i++];
    let value: unknown;

    if (type === 0) {
      value = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
      i += 4;
    } else if (type === 1) {
      value = bytes[i] === 1;
      i += 1;
    } else {
      const len = (bytes[i] << 8) | bytes[i + 1];
      i += 2;
      const payload = bytes.slice(i, i + len);
      value = new TextDecoder().decode(Uint8Array.from(payload));
      i += len;
    }

    const field = byTag.get(tag);
    if (field) {
      result[field.key] = value;
    }
  }

  return result;
}

export function jsonByteSize(record: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(record)).length;
}

export function compactByteSize(record: Record<string, unknown>, schema: SchemaField[]): number {
  return encodeCompact(record, schema).length;
}

export function isCompactSmaller(record: Record<string, unknown>, schema: SchemaField[]): boolean {
  return compactByteSize(record, schema) < jsonByteSize(record);
}

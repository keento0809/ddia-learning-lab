import { describe, expect, it } from "vitest";
import { draftStorageKey, readDraft, writeDraft, type StorageLike } from "@/lib/lab/draftStorage";

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

// T-108受入基準(6)「ドラフトのlocalStorage自動保存(key: draft:{exerciseSlug}:{lang})」
describe("draftStorage", () => {
  it("builds the key exactly as draft:{slug}:{lang} (02§4.2)", () => {
    expect(draftStorageKey("01-reliability/percentile-lab", "ja")).toBe(
      "draft:01-reliability/percentile-lab:ja",
    );
  });

  it("returns null when nothing has been saved yet", () => {
    const storage = createMemoryStorage();
    expect(readDraft("slug", "ja", storage)).toBeNull();
  });

  it("round-trips a saved draft", () => {
    const storage = createMemoryStorage();
    writeDraft("slug", "ja", "export function f() {}", storage);
    expect(readDraft("slug", "ja", storage)).toBe("export function f() {}");
  });

  it("keeps ja/en drafts of the same exercise independent", () => {
    const storage = createMemoryStorage();
    writeDraft("slug", "ja", "ja-code", storage);
    writeDraft("slug", "en", "en-code", storage);
    expect(readDraft("slug", "ja", storage)).toBe("ja-code");
    expect(readDraft("slug", "en", storage)).toBe("en-code");
  });

  it("does nothing (no throw) when storage is unavailable", () => {
    expect(() => writeDraft("slug", "ja", "code", null)).not.toThrow();
    expect(readDraft("slug", "ja", null)).toBeNull();
  });
});

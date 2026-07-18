import { describe, expect, it } from "vitest";
import {
  GetDashboardResponseSchema,
  PostGuestProgressImportRequestSchema,
  PostSubmissionRequestSchema,
  PutNoteRequestSchema,
  PutProgressRequestSchema,
  PutProgressResponseSchema,
} from "@/lib/contracts/api";

describe("PutProgressRequestSchema", () => {
  it("parses a valid exercise completion payload", () => {
    const result = PutProgressRequestSchema.safeParse({
      itemType: "exercise",
      itemSlug: "06-partitioning/consistent-hash",
      status: "done",
      score: 100,
      clientTz: "Asia/Tokyo",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a score outside 0-100", () => {
    const result = PutProgressRequestSchema.safeParse({
      itemType: "exercise",
      itemSlug: "06-partitioning/consistent-hash",
      status: "done",
      score: 150,
      clientTz: "Asia/Tokyo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown itemType", () => {
    const result = PutProgressRequestSchema.safeParse({
      itemType: "chapter",
      itemSlug: "06-partitioning/consistent-hash",
      status: "done",
      clientTz: "Asia/Tokyo",
    });
    expect(result.success).toBe(false);
  });
});

describe("PutProgressResponseSchema", () => {
  it("parses a response including streak and newBadges", () => {
    const result = PutProgressResponseSchema.safeParse({
      progress: {
        id: "p1",
        itemType: "exercise",
        itemSlug: "06-partitioning/consistent-hash",
        status: "done",
        score: 100,
        completedAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
      streak: { currentDays: 4 },
      newBadges: [{ slug: "part2-complete" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects when newBadges is missing", () => {
    const result = PutProgressResponseSchema.safeParse({
      progress: {
        id: "p1",
        itemType: "exercise",
        itemSlug: "06-partitioning/consistent-hash",
        status: "done",
        score: 100,
        completedAt: null,
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
      streak: { currentDays: 4 },
    });
    expect(result.success).toBe(false);
  });
});

describe("PostSubmissionRequestSchema", () => {
  it("parses a passing submission", () => {
    const result = PostSubmissionRequestSchema.safeParse({
      exerciseSlug: "03-storage/kv-store",
      language: "js",
      code: "export function put() {}",
      result: "pass",
      passedTests: 8,
      totalTests: 8,
      durationMs: 412,
      graderVersion: "1.3.0",
    });
    expect(result.success).toBe(true);
  });

  it("rejects code larger than 64KB", () => {
    const result = PostSubmissionRequestSchema.safeParse({
      exerciseSlug: "03-storage/kv-store",
      language: "js",
      code: "a".repeat(64 * 1024 + 1),
      result: "pass",
      passedTests: 8,
      totalTests: 8,
      graderVersion: "1.3.0",
    });
    expect(result.success).toBe(false);
  });
});

describe("PutNoteRequestSchema", () => {
  it("parses a note within the 32KB limit", () => {
    expect(PutNoteRequestSchema.safeParse({ bodyMd: "# memo" }).success).toBe(true);
  });

  it("rejects a note larger than 32KB", () => {
    const result = PutNoteRequestSchema.safeParse({
      bodyMd: "a".repeat(32 * 1024 + 1),
    });
    expect(result.success).toBe(false);
  });
});

describe("GetDashboardResponseSchema", () => {
  it("parses a full dashboard summary", () => {
    const result = GetDashboardResponseSchema.safeParse({
      overall: { lessonsDone: 21, lessonsTotal: 46, exercisesPassed: 7 },
      modules: [{ slug: "01-reliability", percent: 100 }],
      resume: {
        itemType: "lesson",
        itemSlug: "05-replication/02-lag",
        titleKey: "auto-resolved-per-locale",
      },
      streak: { currentDays: 4, longestDays: 11 },
      badges: [{ slug: "part1-complete", grantedAt: "2026-07-01T00:00:00.000Z" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a module percent outside 0-100", () => {
    const result = GetDashboardResponseSchema.safeParse({
      overall: { lessonsDone: 21, lessonsTotal: 46, exercisesPassed: 7 },
      modules: [{ slug: "01-reliability", percent: 120 }],
      resume: null,
      streak: { currentDays: 4 },
      badges: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("PostGuestProgressImportRequestSchema", () => {
  it("parses a batch of guest progress entries", () => {
    const result = PostGuestProgressImportRequestSchema.safeParse({
      entries: [
        { itemType: "lesson", itemSlug: "01-reliability/01-intro", status: "done" },
      ],
      clientTz: "Asia/Tokyo",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an entry with an empty itemSlug", () => {
    const result = PostGuestProgressImportRequestSchema.safeParse({
      entries: [{ itemType: "lesson", itemSlug: "", status: "done" }],
      clientTz: "Asia/Tokyo",
    });
    expect(result.success).toBe(false);
  });
});

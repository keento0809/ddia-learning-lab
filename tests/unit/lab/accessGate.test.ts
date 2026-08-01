import { describe, expect, it, vi, type Mock } from "vitest";

/**
 * T-604(ADR-009 §5層1・§6)。「未認証でゲート対象の演習/クイズのデータ取得を
 * 試みた際に本体が返らないこと」の証明(演習YAML側)。
 *
 * `tests/unit/lesson/accessGate.test.ts`(T-602)と同じ手法: LabPage
 * (Server Component)を直接呼び出し、返されたReact要素ツリーを構造的に検査する。
 * 加えて`lib/labContent.ts`の`getExercise`(演習YAMLのtemplate/testsを含む全体、
 * `buildLabPageData`が内部で呼ぶ唯一のデータ取得口)自体が呼ばれていないことも
 * 確認し、「データが読み込まれてすらいない」ことを二重に証明する。
 */
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/lib/labContent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/labContent")>();
  return { ...actual, getExercise: vi.fn(actual.getExercise) };
});

const { auth } = await import("@/lib/auth/config");
const { getExercise } = await import("@/lib/labContent");
const { default: LabPage, generateMetadata } = await import(
  "@/app/[locale]/learn/[module]/lab/[exercise]/page"
);
const { LabWorkspace } = await import("@/components/lab/LabWorkspace");
const { LabAccessNotice } = await import("@/components/lab/LabAccessNotice");

type SessionLike = { user: { id: string }; expires: string } | null;
const mockedAuth = auth as unknown as Mock<(...args: unknown[]) => Promise<SessionLike>>;
const mockedGetExercise = getExercise as unknown as Mock<typeof getExercise>;

function makeParams(locale: "ja" | "en", moduleSlug: string, exerciseSlug: string) {
  return { params: Promise.resolve({ locale, module: moduleSlug, exercise: exerciseSlug }) };
}

const AUTHENTICATED_SESSION: SessionLike = {
  user: { id: "user-1" },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

interface LabElement {
  type: unknown;
  props: Record<string, unknown>;
}

describe("LabPage server-side access gating (T-604)", () => {
  it("未認証・Gated(モジュール1以外)は演習YAMLを読み込まずLabAccessNoticeを返す", async () => {
    mockedAuth.mockResolvedValue(null);
    mockedGetExercise.mockClear();

    const element = (await LabPage(
      makeParams("ja", "02-data-models", "denormalize-users-lab"),
    )) as unknown as LabElement;

    expect(element.type).toBe(LabAccessNotice);
    expect(element.type).not.toBe(LabWorkspace);
    expect(mockedGetExercise).not.toHaveBeenCalled();
  });

  it("未認証・Free Tier(モジュール1)は従来どおり演習YAMLを読み込みLabWorkspaceへ渡す", async () => {
    mockedAuth.mockResolvedValue(null);
    mockedGetExercise.mockClear();

    const element = (await LabPage(
      makeParams("ja", "01-reliability", "percentile-lab"),
    )) as unknown as LabElement;

    expect(element.type).toBe(LabWorkspace);
    expect(mockedGetExercise).toHaveBeenCalled();
    expect((element.props.exercise as { slug: string }).slug).toBe("01-reliability/percentile-lab");
    expect((element.props.exercise as { tests: unknown[] }).tests.length).toBeGreaterThan(0);
  });

  it("認証済みユーザーはGatedモジュールでも演習YAMLを読み込みLabWorkspaceへ渡す", async () => {
    mockedAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    mockedGetExercise.mockClear();

    const element = (await LabPage(
      makeParams("ja", "02-data-models", "denormalize-users-lab"),
    )) as unknown as LabElement;

    expect(element.type).toBe(LabWorkspace);
    expect(mockedGetExercise).toHaveBeenCalled();
  });

  it("英語ロケールでも同様にGatedはLabAccessNotice、Free Tierは読み込まれる", async () => {
    mockedAuth.mockResolvedValue(null);
    mockedGetExercise.mockClear();

    const gated = (await LabPage(
      makeParams("en", "02-data-models", "denormalize-users-lab"),
    )) as unknown as LabElement;
    expect(gated.type).toBe(LabAccessNotice);

    const free = (await LabPage(
      makeParams("en", "01-reliability", "percentile-lab"),
    )) as unknown as LabElement;
    expect(free.type).toBe(LabWorkspace);
  });

  it("存在しない演習slugは未認証Gatedチェックより先に404になる", async () => {
    mockedAuth.mockResolvedValue(null);
    await expect(
      LabPage(makeParams("ja", "02-data-models", "does-not-exist-xyz")),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("test-integrity-reviewer指摘の恒久対策: generateMetadataはGated演習でも演習YAML(template/tests)を読み込まない", async () => {
    mockedGetExercise.mockClear();

    const metadata = await generateMetadata(makeParams("ja", "02-data-models", "denormalize-users-lab"));

    expect(mockedGetExercise).not.toHaveBeenCalled();
    expect(metadata.title).toContain("データモデルとクエリ言語");
  });

  it("generateMetadataはFree Tier演習でも演習YAMLを読み込まない(タイトル生成に本体は不要)", async () => {
    mockedGetExercise.mockClear();

    const metadata = await generateMetadata(makeParams("ja", "01-reliability", "percentile-lab"));

    expect(mockedGetExercise).not.toHaveBeenCalled();
    expect(metadata.title).toContain("信頼性・スケーラビリティ・保守性");
  });
});

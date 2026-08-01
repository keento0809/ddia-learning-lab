import { describe, expect, it, vi, type Mock } from "vitest";

/**
 * T-604(ADR-009 §5層1・§6)。「未認証でゲート対象の演習/クイズのデータ取得を
 * 試みた際に本体が返らないこと」の証明(quiz.yaml側)。
 *
 * `tests/unit/lesson/accessGate.test.ts`(T-602)と同じ手法: QuizPage
 * (Server Component)を直接呼び出し、返されたReact要素ツリーを構造的に検査する。
 * 加えて`lib/quiz.ts`の`getQuiz`(quiz.yamlの正解id・解説を含む全体)自体が
 * 呼ばれていないことも確認し、「データが読み込まれてすらいない」ことを二重に証明する。
 */
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/lib/quiz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz")>();
  return { ...actual, getQuiz: vi.fn(actual.getQuiz) };
});

const { auth } = await import("@/lib/auth/config");
const { getQuiz } = await import("@/lib/quiz");
const { default: QuizPage, generateMetadata } = await import("@/app/[locale]/learn/[module]/quiz/page");
const { QuizRunner } = await import("@/components/quiz/QuizRunner");
const { QuizAccessNotice } = await import("@/components/quiz/QuizAccessNotice");

type SessionLike = { user: { id: string }; expires: string } | null;
const mockedAuth = auth as unknown as Mock<(...args: unknown[]) => Promise<SessionLike>>;
const mockedGetQuiz = getQuiz as unknown as Mock<typeof getQuiz>;

function makeParams(locale: "ja" | "en", moduleSlug: string) {
  return { params: Promise.resolve({ locale, module: moduleSlug }) };
}

const AUTHENTICATED_SESSION: SessionLike = {
  user: { id: "user-1" },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

interface QuizElement {
  type: unknown;
  props: Record<string, unknown>;
}

describe("QuizPage server-side access gating (T-604)", () => {
  it("未認証・Gated(モジュール1以外)はquiz.yamlを読み込まずQuizAccessNoticeを返す", async () => {
    mockedAuth.mockResolvedValue(null);
    mockedGetQuiz.mockClear();

    const element = (await QuizPage(makeParams("ja", "02-data-models"))) as unknown as QuizElement;

    expect(element.type).toBe(QuizAccessNotice);
    expect(element.type).not.toBe(QuizRunner);
    expect(mockedGetQuiz).not.toHaveBeenCalled();
  });

  it("未認証・Free Tier(モジュール1)は従来どおりquiz.yamlを読み込みQuizRunnerへ渡す", async () => {
    mockedAuth.mockResolvedValue(null);
    mockedGetQuiz.mockClear();

    const element = (await QuizPage(makeParams("ja", "01-reliability"))) as unknown as QuizElement;

    expect(element.type).toBe(QuizRunner);
    expect(mockedGetQuiz).toHaveBeenCalledWith("ja", "01-reliability");
    expect((element.props.quiz as { questions: unknown[] }).questions.length).toBeGreaterThan(0);
  });

  it("認証済みユーザーはGatedモジュールでもquiz.yamlを読み込みQuizRunnerへ渡す", async () => {
    mockedAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    mockedGetQuiz.mockClear();

    const element = (await QuizPage(makeParams("ja", "02-data-models"))) as unknown as QuizElement;

    expect(element.type).toBe(QuizRunner);
    expect(mockedGetQuiz).toHaveBeenCalledWith("ja", "02-data-models");
  });

  it("英語ロケールでも同様にGatedはQuizAccessNotice、Free Tierは読み込まれる", async () => {
    mockedAuth.mockResolvedValue(null);
    mockedGetQuiz.mockClear();

    const gated = (await QuizPage(makeParams("en", "02-data-models"))) as unknown as QuizElement;
    expect(gated.type).toBe(QuizAccessNotice);

    const free = (await QuizPage(makeParams("en", "01-reliability"))) as unknown as QuizElement;
    expect(free.type).toBe(QuizRunner);
  });

  it("test-integrity-reviewer指摘の恒久対策: generateMetadataはGatedモジュールでもquiz.yamlを読み込まない", async () => {
    mockedGetQuiz.mockClear();

    const metadata = await generateMetadata(makeParams("ja", "02-data-models"));

    expect(mockedGetQuiz).not.toHaveBeenCalled();
    expect(metadata.title).toBe("データモデルとクエリ言語");
  });
});

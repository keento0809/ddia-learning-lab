import { describe, expect, it, vi, type Mock } from "vitest";

/**
 * T-703 AU-9(docs/design/11_ADR-011 §3.2)。ADR-009のゲーティング: 未認証で
 * 本文・演習定義・クイズ解答がレスポンスに含まれないか。
 *
 * tests/unit/lesson/accessGate.test.ts・tests/unit/quiz/accessGate.test.ts・
 * tests/unit/lab/accessGate.test.ts(T-602/T-604)は「本文コンポーネントが
 * ページのReact要素ツリーに含まれない」ことを既に検証済み。本テストはT-703の
 * 独立検証として、まだ専用テストがない経路である`generateMetadata`(<title>/
 * <meta description>に本文が漏れないか)を、レッスン・クイズ・演習の3ページ
 * すべてで横断的に確認する。metadataはRSCペイロードとは別に生成され、HTMLの
 * <head>に直接出力される(検索エンジン・SNSカードにも渡る)ため、本文コンポーネント
 * が読み込まれないことの確認だけではカバーされない独立した漏洩経路である。
 *
 * なおOGP画像生成(opengraph-image/ImageResponse)はこのリポジトリに実装が
 * 存在しない(全文grep済み)ため、その経路は「検証不能(理由: 実装が存在しない)」
 * として扱う。
 */
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/lib/lessonContentLoader", () => ({
  loadLessonContent: vi.fn(async () => (() => null)),
}));
vi.mock("@/lib/quiz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz")>();
  return { ...actual, getQuiz: vi.fn(actual.getQuiz) };
});
vi.mock("@/lib/labContent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/labContent")>();
  return { ...actual, getExercise: vi.fn(actual.getExercise) };
});

const { auth } = await import("@/lib/auth/config");
const { generateMetadata: lessonMetadata } = await import("@/app/[locale]/learn/[module]/[lesson]/page");
const { generateMetadata: quizMetadata, default: QuizPage } = await import(
  "@/app/[locale]/learn/[module]/quiz/page"
);
const { generateMetadata: labMetadata } = await import("@/app/[locale]/learn/[module]/lab/[exercise]/page");
const { getQuiz } = await import("@/lib/quiz");

type SessionLike = { user: { id: string }; expires: string } | null;
const mockedAuth = auth as unknown as Mock<(...args: unknown[]) => Promise<SessionLike>>;
const mockedGetQuiz = getQuiz as unknown as Mock<typeof getQuiz>;

// Gated階層レッスン(02-data-models/02-document-schema-flexibility)本文にのみ
// 現れる文字列(content/ja/02-data-models/02-document-schema-flexibility.mdx)。
const GATED_LESSON_BODY_MARKER = "スキーマオンライトの世界では既存の全行に対するマイグレーションが必要になりがちだが";

describe("AU-9: generateMetadataがゲート対象の本文・解答を含まないことの横断検証", () => {
  it("未認証・Gatedレッスンのgenerate MetadataはtitleのみでレッスンMDX本文を含まない", async () => {
    mockedAuth.mockResolvedValue(null);
    const metadata = await lessonMetadata({
      params: Promise.resolve({ locale: "ja", module: "02-data-models", lesson: "02-document-schema-flexibility" }),
    });
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain(GATED_LESSON_BODY_MARKER);
    expect(typeof metadata.title).toBe("string");
  });

  it("未認証・Gatedクイズのgenerate MetadataはgetQuiz(正解id・解説を含む)を呼ばない", async () => {
    mockedAuth.mockResolvedValue(null);
    mockedGetQuiz.mockClear();
    await quizMetadata({ params: Promise.resolve({ locale: "ja", module: "02-data-models" }) });
    expect(mockedGetQuiz).not.toHaveBeenCalled();
  });

  it("未認証・Gated演習のgenerateMetadataは演習YAML(template/tests/正解)を含まない", async () => {
    mockedAuth.mockResolvedValue(null);
    const metadata = await labMetadata({
      params: Promise.resolve({
        locale: "ja",
        module: "02-data-models",
        exercise: "denormalize-users-lab",
      }),
    });
    const serialized = JSON.stringify(metadata);
    // 演習の正解・テストコードに現れがちなJS/SQLキーワードが混入していないことを
    // 確認する(タイトル文字列のみが含まれるべき)。
    expect(serialized).not.toMatch(/function|SELECT|assert|expect\(/i);
  });

  it("認証済みならQuizPage本体はgetQuizを呼ぶ(比較対照: 未認証時との差分確認)", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "user-1" }, expires: new Date(Date.now() + 60_000).toISOString() });
    mockedGetQuiz.mockClear();
    await QuizPage({ params: Promise.resolve({ locale: "ja", module: "02-data-models" }) });
    expect(mockedGetQuiz).toHaveBeenCalled();
  });
});

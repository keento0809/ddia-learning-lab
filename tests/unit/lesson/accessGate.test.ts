import { describe, expect, it, vi, type Mock } from "vitest";

/**
 * T-602(ADR-009 §3.1・§5層1)。「未認証時にゲート対象URLへ直接アクセスした際の
 * レスポンスbody/RSCペイロードに本文が含まれないこと」の証明。
 *
 * tests/integration/配下(docker-compose.test.ymlのDBが必要、npm run test:integration)
 * ではなくここに置く: (1) DBに一切依存しない(prismaを使わない)テストのため、
 * (2) tests/integration/**は`pretest:integration`によりtests/fixtures/content/validの
 * 縮小フィクスチャ(モジュール"01-reliability"のみ、Preview/Gated階層を検証できない)
 * に対して実行される制約があり、本テストは実コンテンツ(content/ja, content/en)の
 * 複数モジュールを対象にする必要があるため。dashboard.flow.integration.test.ts等と
 * 同じ`vi.mock("@/lib/auth/config")`パターンはそのまま踏襲する。
 *
 * curl相当のHTTPレスポンス検査ではなく、LessonPage(Server Component)が返す
 * React要素ツリーを直接構造的に検査する(tests/unit/lesson/page404.test.tsと同じ、
 * 「サーバコンポーネント関数を直接呼び出す」既存パターンの延長)。本文コンポーネント
 * (`loadLessonContent`の戻り値)への参照がツリーに一切含まれないことを確認できれば、
 * そのコンポーネントの出力はRSCシリアライズ結果にもHTMLレスポンスにも現れ得ない
 * (Reactは描画対象の要素ツリーに含まれないコンポーネントの出力を一切生成しない)。
 *
 * `lib/lessonContentLoader.ts`(T-602で切り出し、同ファイルのコメント参照)をモックし、
 * 実MDXの動的import(`.mdx`、Vitest環境ではMDX用loader未登録のため解決不能)を経由せず
 * 「本文コンポーネントがツリーに含まれるかどうか」だけを検証する。
 */
const FULL_CONTENT_MARKER = () => null;

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/lib/lessonContentLoader", () => ({
  loadLessonContent: vi.fn(async () => FULL_CONTENT_MARKER),
}));

const { auth } = await import("@/lib/auth/config");
const { default: LessonPage } = await import("@/app/[locale]/learn/[module]/[lesson]/page");
const { LessonAccessNotice } = await import("@/components/lesson/LessonAccessNotice");

type SessionLike = { user: { id: string }; expires: string } | null;
const mockedAuth = auth as unknown as Mock<(...args: unknown[]) => Promise<SessionLike>>;

function makeParams(locale: "ja" | "en", moduleSlug: string, lessonId: string) {
  return { params: Promise.resolve({ locale, module: moduleSlug, lesson: lessonId }) };
}

const AUTHENTICATED_SESSION: SessionLike = {
  user: { id: "user-1" },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

interface LessonLayoutElement {
  props: { children: { type: unknown; props: Record<string, unknown> } };
}

describe("LessonPage server-side access gating (T-602)", () => {
  it("未認証・Gated階層(モジュール2〜12の第1レッスン以外)は本文コンポーネントをツリーに含めない", async () => {
    mockedAuth.mockResolvedValue(null);
    const element = (await LessonPage(
      makeParams("ja", "02-data-models", "02-document-schema-flexibility"),
    )) as unknown as LessonLayoutElement;
    const body = element.props.children;

    expect(body.type).toBe(LessonAccessNotice);
    expect(body.type).not.toBe(FULL_CONTENT_MARKER);
    expect(body.props.previewHtml).toBeUndefined();
  });

  it("未認証・Preview階層(各モジュール第1レッスン)は冒頭HTMLのみを含み、本文コンポーネントは含まない", async () => {
    mockedAuth.mockResolvedValue(null);
    const element = (await LessonPage(
      makeParams("ja", "02-data-models", "01-relational-vs-document"),
    )) as unknown as LessonLayoutElement;
    const body = element.props.children;

    expect(body.type).toBe(LessonAccessNotice);
    expect(body.type).not.toBe(FULL_CONTENT_MARKER);
    const previewHtml = body.props.previewHtml as string;
    expect(previewHtml).toBeDefined();
    // SEO要件(ADR-009 §3.1): 冒頭2見出し分はHTMLに含まれる
    expect(previewHtml).toContain("リレーショナルモデルの考え方");
    expect(previewHtml).toContain("ドキュメントモデルの考え方");
    // ゲート対象(3見出し目以降)の本文は含まれない
    expect(previewHtml).not.toContain("インピーダンスミスマッチという問題");
    expect(previewHtml).not.toContain("1対多の関係はどちらが得意か");
  });

  it("未認証・Free Tier(モジュール1)は本文コンポーネントをそのまま含む(従来どおり全文取得可)", async () => {
    mockedAuth.mockResolvedValue(null);
    const element = (await LessonPage(
      makeParams("ja", "01-reliability", "01-reliability-and-faults"),
    )) as unknown as LessonLayoutElement;
    const body = element.props.children;

    expect(body.type).toBe(FULL_CONTENT_MARKER);
  });

  it("認証済みユーザーはGated階層のレッスンでも本文コンポーネントを含む(全文取得可)", async () => {
    mockedAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    const element = (await LessonPage(
      makeParams("ja", "02-data-models", "02-document-schema-flexibility"),
    )) as unknown as LessonLayoutElement;
    const body = element.props.children;

    expect(body.type).toBe(FULL_CONTENT_MARKER);
  });

  it("認証済みユーザーはPreview階層の第1レッスンでも本文コンポーネントを含む(全文取得可)", async () => {
    mockedAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    const element = (await LessonPage(
      makeParams("ja", "02-data-models", "01-relational-vs-document"),
    )) as unknown as LessonLayoutElement;
    const body = element.props.children;

    expect(body.type).toBe(FULL_CONTENT_MARKER);
  });

  it("英語ロケールでも同様にGatedはLessonAccessNotice、Free Tierは本文コンポーネント", async () => {
    mockedAuth.mockResolvedValue(null);

    const gated = (await LessonPage(
      makeParams("en", "02-data-models", "02-document-schema-flexibility"),
    )) as unknown as LessonLayoutElement;
    expect(gated.props.children.type).toBe(LessonAccessNotice);

    const free = (await LessonPage(
      makeParams("en", "01-reliability", "01-reliability-and-faults"),
    )) as unknown as LessonLayoutElement;
    expect(free.props.children.type).toBe(FULL_CONTENT_MARKER);
  });
});

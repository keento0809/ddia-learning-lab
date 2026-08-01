import type { Locale } from "@/lib/i18n/messages";
import { ContentWall } from "./ContentWall";

/**
 * T-602(ADR-009 §5 層1「サーバ(正)」)。未認証時にレッスン本文の代わりに
 * 表示するコンポーネント。呼び出し側(app/[locale]/learn/[module]/[lesson]/page.tsx、
 * tests/unit/lesson/accessGate.test.ts)はこのコンポーネント自体への参照と
 * `previewHtml` propの有無だけを見て「本文がツリーに含まれないこと」を検証する
 * ため、シグネチャは変更しない。実際の表示(フェードアウト演出・鍵アイコン・
 * 価値訴求・CTA群、ADR-009 §3.2)は`<ContentWall>`(T-603)に委譲する。
 */
export function LessonAccessNotice({
  locale,
  previewHtml,
}: {
  locale: Locale;
  previewHtml?: string;
}) {
  return <ContentWall locale={locale} previewHtml={previewHtml} />;
}

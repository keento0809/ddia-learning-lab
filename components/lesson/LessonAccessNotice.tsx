import { Link } from "@/lib/i18n/navigation";
import { getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * T-602(ADR-009 §5 層1「サーバ(正)」)。未認証時にレッスン本文の代わりに
 * 表示する最小限のプレースホルダ。`previewHtml`が渡された場合(Preview階層、
 * ビルド時生成: scripts/generate-curriculum.ts)は冒頭のみ表示し、続きは
 * ロックされている旨を示す。`previewHtml`がない場合(Gated階層)は本文を
 * 一切出力しない。
 *
 * フェードアウト演出・CTAボタン群・鍵アイコン等の本格的なソフトウォールUI
 * (ADR-009 §3.2)は`<ContentWall>`(T-603)のスコープ。本コンポーネントは
 * それまでの最小限のプレースホルダで、サーバ側ガード(本タスクの受入基準:
 * 未認証時にゲート対象本文をレスポンスに含めない)を満たすためだけに存在する。
 */
export function LessonAccessNotice({
  locale,
  previewHtml,
}: {
  locale: Locale;
  previewHtml?: string;
}) {
  const t = getMessages(locale).lesson;

  return (
    <div data-testid="lesson-access-notice">
      {previewHtml ? (
        <>
          {/* ビルド時に生成した安全なHTML(ユーザー入力ではなく自チームの
              レッスンMDXから派生、lib/lessonPreview.ts参照) */}
          <div
            data-testid="lesson-preview-html"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
          <p
            data-testid="lesson-access-preview-notice"
            className="mt-4 text-sm text-neutral-600 dark:text-neutral-400"
          >
            {t.accessPreviewNotice}{" "}
            <Link href="/auth/signin" className="underline underline-offset-2 hover:no-underline">
              {t.accessSignInLinkLabel}
            </Link>
          </p>
        </>
      ) : (
        <p data-testid="lesson-access-locked" className="text-sm text-neutral-600 dark:text-neutral-400">
          <strong className="block text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {t.accessLockedTitle}
          </strong>
          {t.accessLockedBody}{" "}
          <Link href="/auth/signin" className="underline underline-offset-2 hover:no-underline">
            {t.accessSignInLinkLabel}
          </Link>
        </p>
      )}
    </div>
  );
}

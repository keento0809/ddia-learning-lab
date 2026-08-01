import { Link } from "@/lib/i18n/navigation";
import { getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * T-604(ADR-009 §5層1・§6)。未認証・Gated階層のモジュールでは
 * `app/[locale]/learn/[module]/quiz/page.tsx`が`getQuiz`(quiz.yaml、
 * 正解id・解説を含む)を呼ばずこのコンポーネントを返す。`components/lesson/
 * LessonAccessNotice.tsx`(T-602)と同じ「サーバ側ガードを満たすための
 * 最小限プレースホルダ」で、本格的なソフトウォールUI(T-603の`<ContentWall>`)
 * には置き換えない。
 */
export function QuizAccessNotice({ locale }: { locale: Locale }) {
  const t = getMessages(locale).quiz;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p data-testid="quiz-access-locked" className="text-sm text-neutral-600 dark:text-neutral-400">
        <strong className="block text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {t.accessLockedTitle}
        </strong>
        {t.accessLockedBody}{" "}
        <Link href="/auth/signin" className="underline underline-offset-2 hover:no-underline">
          {t.accessSignInLinkLabel}
        </Link>
      </p>
    </main>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * メール送信基盤が未導入(lib/auth/resetToken.ts参照)のため、発行された
 * リセットトークンをリンクとして画面上に直接表示する。「メールを送信した」旨の
 * 文言は出さない(CLAUDE.md規則3)。
 */
export function ResetRequestForm({ locale }: { locale: Locale }) {
  const messages = getMessages(locale).auth;
  const t = messages.reset;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState(messages.rateLimited);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");

    const response = await fetch("/api/auth/reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (response.status === 429) {
      setErrorMessage(messages.rateLimited);
      setStatus("error");
      return;
    }
    if (!response.ok) {
      // qa-evaluator検出: worker-api連携が失敗した場合(500系)もresponse.json()の
      // 例外を`.catch(() => ({}))`で握り潰し「発行完了」として処理していたため、
      // 実際にはリセットリンクが発行されていないのに成功したかのような画面が
      // 表示されていた。ok以外は明示的にエラー状態として扱う。
      setErrorMessage(t.requestError);
      setStatus("error");
      return;
    }

    const data = (await response.json().catch(() => ({}))) as { resetToken?: string | null };
    setResetLink(
      data.resetToken
        ? `${window.location.origin}/${locale}/auth/reset/confirm?token=${encodeURIComponent(data.resetToken)}`
        : null,
    );
    setStatus("done");
  }

  return (
    <form onSubmit={handleSubmit} data-testid="auth-reset-request-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="reset-email" className="text-sm font-medium">
          {t.emailLabel}
        </label>
        <input
          id="reset-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="auth-reset-email"
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        />
      </div>
      <button
        type="submit"
        disabled={status === "submitting"}
        data-testid="auth-reset-request-submit"
        className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {status === "submitting" ? t.requestSubmitting : t.requestSubmit}
      </button>
      {status === "error" && (
        <p role="alert" data-testid="auth-reset-request-error" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
      {status === "done" && (
        <div
          data-testid="auth-reset-request-result"
          className="flex flex-col gap-2 rounded border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t.requestNotice}</p>
          {resetLink && (
            <div className="flex flex-col gap-1">
              <label htmlFor="reset-link-output" className="text-sm font-medium">
                {t.linkGeneratedLabel}
              </label>
              <input
                id="reset-link-output"
                readOnly
                value={resetLink}
                data-testid="auth-reset-link"
                className="w-full rounded border border-neutral-300 bg-neutral-100 px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-50"
              />
            </div>
          )}
        </div>
      )}
    </form>
  );
}

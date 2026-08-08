"use client";

import { useState, type FormEvent } from "react";
import { getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * T-705(docs/security/findings.md Critical #1)修正済み: メール送信基盤が
 * 未導入のため、以前はworker-apiが発行したリセットトークンをこの画面へ直接
 * 表示していたが、これはメールボックスの所有証明なしに第三者がトークンを
 * 入手できる認証バイパスだった。worker-api側(workers/api/src/routes/
 * internalAuth.ts)がトークンを一切返さなくなったため、この画面もリンクは
 * 表示せず、「メールを送信した」という偽の成功文言も出さない(CLAUDE.md規則3)。
 */
export function ResetRequestForm({ locale }: { locale: Locale }) {
  const messages = getMessages(locale).auth;
  const t = messages.reset;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
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
        </div>
      )}
    </form>
  );
}

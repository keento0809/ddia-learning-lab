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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");

    const response = await fetch("/api/auth/reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (response.status === 429) {
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
    <form onSubmit={handleSubmit} data-testid="auth-reset-request-form">
      <div>
        <label htmlFor="reset-email">{t.emailLabel}</label>
        <input
          id="reset-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="auth-reset-email"
        />
      </div>
      <button type="submit" disabled={status === "submitting"} data-testid="auth-reset-request-submit">
        {status === "submitting" ? t.requestSubmitting : t.requestSubmit}
      </button>
      {status === "error" && (
        <p role="alert" data-testid="auth-reset-request-error">
          {messages.rateLimited}
        </p>
      )}
      {status === "done" && (
        <div data-testid="auth-reset-request-result">
          <p>{t.requestNotice}</p>
          {resetLink && (
            <div>
              <label htmlFor="reset-link-output">{t.linkGeneratedLabel}</label>
              <input id="reset-link-output" readOnly value={resetLink} data-testid="auth-reset-link" />
            </div>
          )}
        </div>
      )}
    </form>
  );
}

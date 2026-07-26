"use client";

import { useState, type FormEvent } from "react";
import { getMessages, type Locale } from "@/lib/i18n/messages";

export function ResetConfirmForm({ locale, token }: { locale: Locale; token: string | null }) {
  const messages = getMessages(locale).auth;
  const t = messages.reset;
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState(t.confirmError);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setStatus("error");
      return;
    }
    setStatus("submitting");

    const response = await fetch("/api/auth/reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    if (response.ok) {
      setStatus("success");
      return;
    }
    setErrorMessage(response.status === 429 ? messages.rateLimited : t.confirmError);
    setStatus("error");
  }

  if (!token) {
    return (
      <p
        role="alert"
        data-testid="auth-reset-confirm-missing-token"
        className="text-sm text-red-600 dark:text-red-400"
      >
        {t.missingToken}
      </p>
    );
  }

  if (status === "success") {
    return (
      <p data-testid="auth-reset-confirm-success" className="text-sm text-emerald-700 dark:text-emerald-400">
        {t.confirmSuccess}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} data-testid="auth-reset-confirm-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="reset-confirm-password" className="text-sm font-medium">
          {t.newPasswordLabel}
        </label>
        <input
          id="reset-confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-testid="auth-reset-confirm-password"
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        />
      </div>
      {status === "error" && (
        <p role="alert" data-testid="auth-reset-confirm-error" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "submitting"}
        data-testid="auth-reset-confirm-submit"
        className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {status === "submitting" ? t.confirmSubmitting : t.confirmSubmit}
      </button>
    </form>
  );
}

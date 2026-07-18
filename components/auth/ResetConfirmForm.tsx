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
      <p role="alert" data-testid="auth-reset-confirm-missing-token">
        {t.missingToken}
      </p>
    );
  }

  if (status === "success") {
    return <p data-testid="auth-reset-confirm-success">{t.confirmSuccess}</p>;
  }

  return (
    <form onSubmit={handleSubmit} data-testid="auth-reset-confirm-form">
      <div>
        <label htmlFor="reset-confirm-password">{t.newPasswordLabel}</label>
        <input
          id="reset-confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-testid="auth-reset-confirm-password"
        />
      </div>
      {status === "error" && (
        <p role="alert" data-testid="auth-reset-confirm-error">
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "submitting"}
        data-testid="auth-reset-confirm-submit"
      >
        {status === "submitting" ? t.confirmSubmitting : t.confirmSubmit}
      </button>
    </form>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { getMessages, type Locale } from "@/lib/i18n/messages";

export function SignUpForm({ locale }: { locale: Locale }) {
  const messages = getMessages(locale).auth;
  const t = messages.signup;
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, email, password }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        setErrorMessage(messages.rateLimited);
      } else {
        const problem = (await response.json().catch(() => null)) as { title?: string } | null;
        setErrorMessage(problem?.title === "email_taken" ? t.errorEmailTaken : t.errorValidation);
      }
      setStatus("error");
      return;
    }

    let result: Awaited<ReturnType<typeof signIn>> | undefined;
    try {
      result = await signIn("credentials", { email, password, redirect: false });
    } catch {
      setErrorMessage(messages.rateLimited);
      setStatus("error");
      return;
    }
    if (!result || result.error) {
      setErrorMessage(t.errorGeneric);
      setStatus("error");
      return;
    }
    // SignInForm同様、T-007/T-101/T-112未実装のためサインアップ後の
    // ホーム画面がまだ存在しない。成功状態をこの画面上に表示する。
    setStatus("success");
  }

  if (status === "success") {
    return <p data-testid="auth-signup-success">{t.success}</p>;
  }

  return (
    <form onSubmit={handleSubmit} data-testid="auth-signup-form">
      <div>
        <label htmlFor="signup-display-name">{t.displayNameLabel}</label>
        <input
          id="signup-display-name"
          type="text"
          required
          maxLength={50}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          data-testid="auth-signup-display-name"
        />
      </div>
      <div>
        <label htmlFor="signup-email">{t.emailLabel}</label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="auth-signup-email"
        />
      </div>
      <div>
        <label htmlFor="signup-password">{t.passwordLabel}</label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-testid="auth-signup-password"
        />
      </div>
      {status === "error" && (
        <p role="alert" data-testid="auth-signup-error">
          {errorMessage}
        </p>
      )}
      <button type="submit" disabled={status === "submitting"} data-testid="auth-signup-submit">
        {status === "submitting" ? t.submitting : t.submit}
      </button>
    </form>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import { useRouter } from "@/lib/i18n/navigation";

export function SignUpForm({ locale }: { locale: Locale }) {
  const messages = getMessages(locale).auth;
  const t = messages.signup;
  const router = useRouter();
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
      } else if (response.status >= 500) {
        // qa-evaluator検出: worker-api連携(service binding)が失敗した場合も
        // ここに到達するが、従来は「入力内容を確認してください」という誤った
        // (利用者の入力ミスを示唆する)文言を表示していた。サーバ起因の失敗は
        // 既存のerrorGeneric(元は後段のsignIn()専用だった)を使い区別する。
        setErrorMessage(t.errorGeneric);
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
    // S-11→S-07(01§7.1/7.2)。redirect: falseで結果を先に検証しているため、
    // 成功確定後にここで明示的にダッシュボードへ遷移させる。router.pushが
    // 例外を投げた場合にstatus:"success"のまま(ボタン無効化・エラー非表示)で
    // 固着するのを防ぐため、失敗時はerror状態へフォールバックする。
    setStatus("success");
    try {
      router.push("/dashboard");
    } catch {
      setErrorMessage(t.errorGeneric);
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="auth-signup-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="signup-display-name" className="text-sm font-medium">
          {t.displayNameLabel}
        </label>
        <input
          id="signup-display-name"
          type="text"
          required
          maxLength={50}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          data-testid="auth-signup-display-name"
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="signup-email" className="text-sm font-medium">
          {t.emailLabel}
        </label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="auth-signup-email"
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="signup-password" className="text-sm font-medium">
          {t.passwordLabel}
        </label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-testid="auth-signup-password"
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        />
      </div>
      {status === "error" && (
        <p role="alert" data-testid="auth-signup-error" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "submitting" || status === "success"}
        data-testid="auth-signup-submit"
        className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {status === "submitting" ? t.submitting : t.submit}
      </button>
    </form>
  );
}

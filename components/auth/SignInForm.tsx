"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import { useRouter } from "@/lib/i18n/navigation";

export function SignInForm({ locale }: { locale: Locale }) {
  const t = getMessages(locale).auth.signin;
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState(t.errorInvalidCredentials);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    // signIn()は、レート制限時の429応答など想定外のレスポンス形状を受け取ると
    // 例外を投げることがある(qa-evaluatorで検出: 未捕捉のままだと「サインイン中…」
    // 表示のまま無反応になる)。resultがエラーを含む正常系と、例外による異常系の
    // 両方を同じ「サインインエラー」状態に正規化する。
    let result: Awaited<ReturnType<typeof signIn>> | undefined;
    try {
      result = await signIn("credentials", { email, password, redirect: false });
    } catch {
      setErrorMessage(t.errorGeneric);
      setStatus("error");
      return;
    }
    if (!result || result.error) {
      // qa-evaluator検出: authorize()内でworker-api連携が失敗した場合もAuth.jsは
      // result.errorを返すが、従来は値を区別せず常に「メールアドレスまたは
      // パスワードが正しくありません」と表示していた(実際は資格情報の誤りではなく
      // サーバ障害のケースを含む)。実際に資格情報が誤っている場合のみ
      // next-authが返す"CredentialsSignin"であり、それ以外(Configuration等)は
      // サーバ起因の失敗として区別する。
      setErrorMessage(
        !result || result.error === "CredentialsSignin" ? t.errorInvalidCredentials : t.errorGeneric,
      );
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
    <form onSubmit={handleSubmit} data-testid="auth-signin-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="signin-email" className="text-sm font-medium">
          {t.emailLabel}
        </label>
        <input
          id="signin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="auth-signin-email"
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="signin-password" className="text-sm font-medium">
          {t.passwordLabel}
        </label>
        <input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-testid="auth-signin-password"
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        />
      </div>
      {status === "error" && (
        <p role="alert" data-testid="auth-signin-error" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "submitting" || status === "success"}
        data-testid="auth-signin-submit"
        className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {status === "submitting" ? t.submitting : t.submit}
      </button>
    </form>
  );
}

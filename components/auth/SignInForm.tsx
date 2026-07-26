"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { getMessages, type Locale } from "@/lib/i18n/messages";

export function SignInForm({ locale }: { locale: Locale }) {
  const t = getMessages(locale).auth.signin;
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
    // T-007(共通レイアウト)/T-101(カリキュラム一覧)/T-112(ダッシュボード)が
    // 未実装のため、サインイン後に遷移すべきホーム画面がまだ存在しない
    // (存在しないパスへ遷移させると404になる)。現時点ではこの画面上に
    // 成功状態を表示するのみとする。
    setStatus("success");
  }

  if (status === "success") {
    return <p data-testid="auth-signin-success">{t.success}</p>;
  }

  return (
    <form onSubmit={handleSubmit} data-testid="auth-signin-form">
      <div>
        <label htmlFor="signin-email">{t.emailLabel}</label>
        <input
          id="signin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="auth-signin-email"
        />
      </div>
      <div>
        <label htmlFor="signin-password">{t.passwordLabel}</label>
        <input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-testid="auth-signin-password"
        />
      </div>
      {status === "error" && (
        <p role="alert" data-testid="auth-signin-error">
          {errorMessage}
        </p>
      )}
      <button type="submit" disabled={status === "submitting"} data-testid="auth-signin-submit">
        {status === "submitting" ? t.submitting : t.submit}
      </button>
    </form>
  );
}

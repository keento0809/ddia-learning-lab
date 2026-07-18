export type OAuthProviderId = "github" | "google";

/**
 * 環境変数(GITHUB_ID/GITHUB_SECRET, GOOGLE_ID/GOOGLE_SECRET)が両方揃っている
 * プロバイダのみ有効とみなす。03文書T-005「OAuthは環境変数未設定時にUI非表示」
 * を、Auth.js設定(lib/auth/config.ts)とUI(components/auth)の両方で共有する
 * ための単一の判定源。
 */
export function getEnabledOAuthProviders(): OAuthProviderId[] {
  const enabled: OAuthProviderId[] = [];
  if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
    enabled.push("github");
  }
  if (process.env.GOOGLE_ID && process.env.GOOGLE_SECRET) {
    enabled.push("google");
  }
  return enabled;
}

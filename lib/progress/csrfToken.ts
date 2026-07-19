import { CSRF_COOKIE_NAME } from "@/lib/api/csrfConstants";

/** ダブルサブミットcookie(lib/api/csrf.ts)の値をブラウザから読み取る(非HttpOnly)。 */
export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

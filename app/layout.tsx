import type { ReactNode } from "react";

/**
 * app/[locale]/layout.tsxが<html lang={locale}>を提供する実質的なルート
 * レイアウトのため、ここでは<html>/<body>を持たないパススルーとする。
 * Next.jsのapp router規約上、ルート直下のnot-found.tsx/global-error.tsx
 * (ロケール確定前の最終フォールバック、いずれも自前で<html>/<body>を持つ)
 * には app/layout.tsx の存在自体が要求されるため設置する。
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}

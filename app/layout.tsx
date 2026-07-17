import type { ReactNode } from "react";

// タイトルはロケール別に app/{ja,en}/demo/page.tsx の generateMetadata で
// messages/{ja,en}.json から解決する(CLAUDE.md規則5)。ルートlayoutはロケール
// に依存しないため既定値を持たない。

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}

import type { ComponentType } from "react";
import { Lab } from "@/components/Lab";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import JaDemoContent from "@/content/ja/demo.mdx";
import EnDemoContent from "@/content/en/demo.mdx";

// 02§1のとおりMDXは実行時fsではなくビルド時ロードとする(@next/mdxのwebpackローダで
// import時にコンパイル)。next-mdx-remote + fs.readFileでの実装はCloudflare Workers
// (wrangler preview)で `[unenv] fs.readFile is not implemented yet!` により失敗することを
// T-000で確認したための変更(docs/skeleton-notes.md参照)。
const CONTENT: Record<Locale, ComponentType> = {
  ja: JaDemoContent,
  en: EnDemoContent,
};

export function DemoPage({ locale }: { locale: Locale }) {
  const t = getMessages(locale);
  const Content = CONTENT[locale];

  return (
    <main style={{ maxWidth: "720px", margin: "0 auto", padding: "1rem" }}>
      <article>
        <Content />
      </article>
      <h2>{t.demo.labHeading}</h2>
      <Lab locale={locale} />
    </main>
  );
}

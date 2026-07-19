import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import remarkFrontmatter from "remark-frontmatter";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
};

/**
 * 失敗→恒久対策(T-103): frontmatter(title/order/minutes)を持つレッスンMDXを
 * 実ブラウザで確認したところ、`---`ブロックが本文としてそのまま描画されて
 * しまうことを発見した(remarkの既定パーサはfrontmatterを認識せず、
 * `---`直後の行が先行段落とのSetext見出し記法や区切り線として誤解釈される)。
 * `remark-frontmatter`(新規依存、@mdx-js/@next-mdxと同じunified/remark
 * エコシステムの、まさにこの問題を解決する単機能パッケージ)を導入し、
 * frontmatterブロックをmdastの`yaml`ノードとして切り出す(対応するhast変換が
 * 無いため本文には一切出力されない)。frontmatterの値自体は
 * lib/content.ts(node:fs経由のビルド時パース)から別途取得しており、
 * MDXコンポーネント側でこの値を使う必要はないため`remark-mdx-frontmatter`
 * (値のexport)までは導入しない。
 */
const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkFrontmatter],
  },
});
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(withMDX(nextConfig));

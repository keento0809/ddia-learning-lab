import type { MDXComponents } from "mdx/types";
import { Callout } from "@/components/mdx/Callout";
import { Figure } from "@/components/mdx/Figure";
import { Term } from "@/components/mdx/Term";
import { Viz } from "@/components/mdx/Viz";
import { CodeBlock } from "@/components/mdx/CodeBlock";
import { QuizInline } from "@/components/mdx/QuizInline";
import { BookRef } from "@/components/mdx/BookRef";

/**
 * @next/mdxの規約による共通MDXコンポーネント登録ポイント。
 * T-103(レッスンページ S-04, 02§4.1)のMDXカスタムコンポーネント7種を、
 * content/{ja,en}/配下の全MDXへ横断的に登録する。
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    Callout,
    Figure,
    Term,
    Viz,
    CodeBlock,
    QuizInline,
    BookRef,
    ...components,
  };
}

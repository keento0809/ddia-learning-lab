"use client";

import { getMessages } from "@/lib/i18n/messages";
import { useLessonLocale } from "@/lib/lesson/localeContext";

/**
 * MDXカスタムコンポーネント<Figure>(T-103, 02§4.1)。図+キャプション。
 * captionKeyはmessages/{ja,en}.jsonのlesson.figureCaptionsを介して解決する
 * (キャプション文言もCLAUDE.md規則5のハードコード禁止に従うための間接参照)。
 * 該当キーが未登録の場合(執筆済み教材が存在しない現時点を含む)はキャプション
 * なしで描画する。
 *
 * next/imageはCloudflare Workers(OpenNextアダプタ、ADR-007)で既定の画像最適化
 * サーバが使えないため、素の<img>タグを用いる(素のimgはESLintのnext/core-web-vitals
 * `@next/next/no-img-element`に抵触するため理由コメント付きで無効化)。
 */
export function Figure({
  src,
  alt,
  captionKey,
}: {
  src: string;
  alt: string;
  captionKey?: string;
}) {
  const locale = useLessonLocale();
  const captions = getMessages(locale).lesson.figureCaptions as Record<string, string>;
  const caption = captionKey ? captions[captionKey] : undefined;

  return (
    <figure className="my-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- Cloudflare Workers上ではnext/imageの最適化サーバが既定で使えないため(ADR-007) */}
      <img
        src={src}
        alt={alt}
        className="w-full rounded border border-neutral-200 dark:border-neutral-800"
      />
      {caption ? (
        <figcaption className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-400">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

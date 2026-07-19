"use client";

import dynamic from "next/dynamic";
import { useThemeStore } from "@/lib/store/themeStore";
import { getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * Monaco Editor統合(T-108受入基準(2)「SSR回避の動的import」)。
 * `@monaco-editor/react`自体もマウント前はプレースホルダを描画するが、
 * `next/dynamic({ssr:false})`で明示的にサーバサイドレンダリング自体から除外する
 * (MonacoはCloudflare Workers(workerd)のSSR実行環境には存在しないブラウザ専用
 * API(Web Worker等)に依存するため)。
 *
 * `@monaco-editor/react`はデフォルトでmonaco本体をjsDelivr CDNから遅延取得する
 * (`monaco-editor`をnpm依存に追加していない)。ADR-007のバンドルサイズゲート
 * (Cloudflare Workersサーババンドル gzip 3MiB上限)はサーバ側Workerバンドルの
 * サイズを見るものであり、ブラウザ実行時にCDNから取得されるMonaco本体は
 * サーババンドルに含まれないため、このゲートに影響しない。
 */
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export function CodeEditor({
  value,
  onChange,
  onRunShortcut,
  locale,
}: {
  value: string;
  onChange: (value: string) => void;
  onRunShortcut: () => void;
  locale: Locale;
}) {
  const theme = useThemeStore((state) => state.theme);
  const t = getMessages(locale).labWorkspace;

  return (
    <div data-testid="lab-code-editor" className="h-full min-h-[280px]">
      <MonacoEditor
        height="100%"
        language="javascript"
        value={value}
        theme={theme === "dark" ? "vs-dark" : "light"}
        loading={t.editorLoading}
        onChange={(next) => onChange(next ?? "")}
        onMount={(editor, monaco) => {
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRunShortcut);
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          automaticLayout: true,
          tabSize: 2,
        }}
      />
    </div>
  );
}

/**
 * モジュール間の推奨順を示す矢印(02§4.3「ロック概念は設けない。ただし推奨順を
 * 矢印で示す」)。装飾のみのためaria-hidden(スクリーンリーダーの一覧項目数を
 * 乱さないよう、liごと読み上げ対象から除外する)。
 */
export function OrderConnector() {
  return (
    <li
      aria-hidden="true"
      className="flex items-center justify-center py-0.5 text-neutral-400 dark:text-neutral-600"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 4 L8 12 L14 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </li>
  );
}

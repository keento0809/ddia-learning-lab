"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SvgStage } from "@/components/viz/core/SvgStage";
import { A11yNarrator } from "@/components/viz/core/A11yNarrator";
import { useLessonLocale } from "@/lib/lesson/localeContext";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { createLsmTreeEngine } from "./engine";
import { describeState, lsmTreeNarratable } from "./describeState";
import { LSM_MAX_LEVELS, type LsmEntry, type LsmTreeState } from "./types";

interface TreeNode {
  entry: LsmEntry;
  x: number;
  y: number;
}
interface TreeEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const TREE_VIEW_WIDTH = 480;
const TREE_TOP = 28;
const TREE_LEVEL_HEIGHT = 44;
const TREE_NODE_RADIUS = 18;

/**
 * 02§8.2 LsmTreeViz「memtableは木」の表現。key昇順配列の中央値を根に取る
 * 再帰分割で、ソート済み配列から平衡二分木の座標を機械的に導出する
 * (実装をBSTそのものにするわけではなく、あくまでkey順序の可視化)。
 */
function buildMemtableTree(entries: LsmEntry[]): { nodes: TreeNode[]; edges: TreeEdge[] } {
  const nodes: TreeNode[] = [];
  const edges: TreeEdge[] = [];

  function place(
    slice: LsmEntry[],
    xMin: number,
    xMax: number,
    depth: number,
    parent?: { x: number; y: number },
  ) {
    if (slice.length === 0) return;
    const mid = Math.floor((slice.length - 1) / 2);
    const x = (xMin + xMax) / 2;
    const y = TREE_TOP + depth * TREE_LEVEL_HEIGHT;
    nodes.push({ entry: slice[mid], x, y });
    if (parent) edges.push({ x1: parent.x, y1: parent.y, x2: x, y2: y });
    place(slice.slice(0, mid), xMin, x, depth + 1, { x, y });
    place(slice.slice(mid + 1), x, xMax, depth + 1, { x, y });
  }

  place(entries, 12, TREE_VIEW_WIDTH - 12, 0);
  return { nodes, edges };
}

function treeStageHeight(nodes: TreeNode[]): number {
  if (nodes.length === 0) return TREE_TOP + TREE_NODE_RADIUS * 2;
  return Math.max(...nodes.map((node) => node.y)) + TREE_NODE_RADIUS + 12;
}

/**
 * ネイティブの `disabled` は、フォーカス中の要素に付与された瞬間ブラウザが
 * フォーカスを強制的に<body>へ落とす(=キーボード操作者がTabをページ先頭から
 * やり直す羽目になる)。dispatch直後に自分自身の有効条件を失うボタン
 * (put後の空key等)がこれに該当するため、`aria-disabled`(タブ順序に残り、
 * フォーカスも奪わない)+ ハンドラ側のガード節で代替する
 * (qa-evaluator実機検証で検出、恒久対策としてここに集約)。
 */
function inertButtonProps(inert: boolean) {
  return {
    "aria-disabled": inert,
    className: inert ? "pointer-events-none opacity-50" : undefined,
  } as const;
}

/** 遅延ロード(<Viz name="lsm-tree">経由、02§8.2)されるLSM-Tree可視化本体。 */
export default function LsmTreeViz() {
  const locale = useLessonLocale();
  const t = getMessages(locale).vizLsmTree;
  const [engine] = useState(() => createLsmTreeEngine());
  const [state, setState] = useState<LsmTreeState>(() => engine.getState());
  useEffect(() => engine.subscribe(setState), [engine]);

  const [keyInput, setKeyInput] = useState("");
  const [valueInput, setValueInput] = useState("");
  const [deleteKeyInput, setDeleteKeyInput] = useState("");

  const { nodes, edges } = useMemo(() => buildMemtableTree(state.memtable), [state.memtable]);
  const stageHeight = treeStageHeight(nodes);
  const eventText = useMemo(() => describeState(state, locale), [state, locale]);

  function submitPut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = keyInput.trim();
    if (!key) return;
    engine.dispatch({ type: "put", key, value: valueInput });
    setKeyInput("");
    setValueInput("");
  }

  function submitDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = deleteKeyInput.trim();
    if (!key) return;
    engine.dispatch({ type: "delete", key });
    setDeleteKeyInput("");
  }

  return (
    // break-words(overflow-wrap: break-word)はCSSの継承プロパティのため、ルートで
    // 一度指定するだけで配下の全テキスト(イベントログ等、任意長のkey/valueを
    // そのまま埋め込む箇所)に及ぶ。チップ類のtruncateだけでは、可視のイベントログ
    // 段落(自由長の文章にkeyが埋め込まれ幅制約が効かない)で長いkeyがページを
    // 横オーバーフローさせる問題が残ることをqa-evaluator実機検証で検出したための
    // 恒久対策。
    <div data-testid="lsm-tree-viz" className="break-words">
      <h3>{t.title}</h3>

      <section aria-label={t.memtableLabel} data-testid="lsm-memtable">
        <p>{t.memtableLabel}</p>
        {/* ノード本体はSvgStage(枝線のみを描く静的なSVG)ではなく重ね合わせたHTML
            div(motion.div)で描画する。jsdomがSVG要素の幾何API(getBBox等)を実装
            しておらずframer-motionのSVG要素に対するlayoutId投影計測が完了しない
            (=AnimatePresenceの退出が永久に終わらずDOMに残り続ける)ことを
            LsmTreeViz.test.tsxの実DOM検証で発見した。なお、memtableノードの
            layoutIdはmemtable内限定の名前空間("lsm-memtable-node-"、下記)にし、
            SSTableエントリ側のlayoutId("lsm-node-"、02§8.2「コンパクション時の
            同一key優先」対象)とは共有しない。両者を共有させるとflush時にも
            memtable→SSTableの越境シェアードレイアウト遷移が発生し、退出処理が
            (jsdomに限らず)不安定になることを確認したため、アニメーション対象を
            設計上必須のコンパクション(レベル間の同一SSTableエントリ表現同士)に
            限定するスコープ判断とした。 */}
        <div
          className="relative"
          style={{ width: TREE_VIEW_WIDTH, height: stageHeight }}
          data-testid="lsm-memtable-stage"
        >
          <SvgStage
            viewBox={{ minX: 0, minY: 0, width: TREE_VIEW_WIDTH, height: stageHeight }}
            ariaLabel={t.memtableLabel}
            className="absolute inset-0 h-full w-full"
          >
            {edges.map((edge, index) => (
              <line
                key={index}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke="currentColor"
                strokeOpacity={0.35}
              />
            ))}
          </SvgStage>
          <AnimatePresence>
            {nodes.map(({ entry, x, y }) => (
              <motion.div
                key={entry.key}
                layout
                layoutId={`lsm-memtable-node-${entry.key}`}
                data-testid={`lsm-memtable-node-${entry.key}`}
                className="absolute flex items-center justify-center overflow-hidden rounded-full bg-neutral-700 text-[10px] text-white dark:bg-neutral-200 dark:text-neutral-900"
                style={{
                  left: x - TREE_NODE_RADIUS,
                  top: y - TREE_NODE_RADIUS,
                  width: TREE_NODE_RADIUS * 2,
                  height: TREE_NODE_RADIUS * 2,
                  opacity: entry.value === null ? 0.35 : 0.85,
                }}
              >
                <span className="max-w-full truncate px-1">{entry.key}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {nodes.length === 0 ? <p>{t.emptyLabel}</p> : null}
      </section>

      <section aria-label={t.walLabel} data-testid="lsm-wal">
        <p>{t.walLabel}</p>
        <div className="flex flex-wrap gap-1">
          <AnimatePresence>
            {state.wal.map((entry) => (
              <motion.span
                key={entry.seq}
                layout
                layoutId={`lsm-wal-${entry.seq}`}
                data-testid={`lsm-wal-entry-${entry.seq}`}
                className="inline-block max-w-[6rem] truncate rounded border border-current px-1 align-bottom text-xs"
              >
                {entry.key}
              </motion.span>
            ))}
          </AnimatePresence>
          {state.wal.length === 0 ? <span>{t.emptyLabel}</span> : null}
        </div>
      </section>

      {state.levels.map((tables, level) => (
        <section
          key={level}
          aria-label={formatMessage(t.levelLabel, { level })}
          data-testid={`lsm-level-${level}`}
        >
          <p>{formatMessage(t.levelLabel, { level })}</p>
          <div className="flex flex-wrap gap-2">
            <AnimatePresence>
              {tables.map((table) => (
                <motion.div
                  key={table.id}
                  layout
                  data-testid={`lsm-sstable-${table.id}`}
                  className="rounded border border-current p-1"
                >
                  <div className="flex flex-wrap gap-1">
                    <AnimatePresence>
                      {table.entries.map((entry) => (
                        <motion.div
                          key={entry.key}
                          layout
                          layoutId={`lsm-node-${entry.key}`}
                          data-testid={`lsm-entry-${level}-${entry.key}`}
                          className="flex max-w-[12rem] gap-1 rounded border border-current px-1 text-xs"
                        >
                          <span className="min-w-0 max-w-[5rem] truncate">{entry.key}</span>
                          <span className="min-w-0 max-w-[5rem] truncate">
                            {entry.value === null ? t.tombstoneValueLabel : entry.value}
                          </span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {tables.length === 0 ? <span>{t.emptyLabel}</span> : null}
          </div>
          {level < LSM_MAX_LEVELS - 1 ? (
            <button
              type="button"
              data-testid={`lsm-compact-${level}`}
              {...inertButtonProps(tables.length === 0)}
              onClick={() => {
                if (tables.length === 0) return;
                engine.dispatch({ type: "compact", level });
              }}
            >
              {formatMessage(t.form.compactButton, { from: level, to: level + 1 })}
            </button>
          ) : null}
        </section>
      ))}

      <form onSubmit={submitPut} data-testid="lsm-put-form">
        <label>
          {t.form.keyInputLabel}
          <input
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            data-testid="lsm-put-key"
          />
        </label>
        <label>
          {t.form.valueInputLabel}
          <input
            value={valueInput}
            onChange={(event) => setValueInput(event.target.value)}
            data-testid="lsm-put-value"
          />
        </label>
        <button type="submit" {...inertButtonProps(!keyInput.trim())} data-testid="lsm-put-submit">
          {t.form.putButton}
        </button>
      </form>

      <form onSubmit={submitDelete} data-testid="lsm-delete-form">
        <label>
          {t.form.deleteKeyInputLabel}
          <input
            value={deleteKeyInput}
            onChange={(event) => setDeleteKeyInput(event.target.value)}
            data-testid="lsm-delete-key"
          />
        </label>
        <button
          type="submit"
          {...inertButtonProps(!deleteKeyInput.trim())}
          data-testid="lsm-delete-submit"
        >
          {t.form.deleteButton}
        </button>
      </form>

      <button
        type="button"
        data-testid="lsm-flush"
        {...inertButtonProps(state.memtable.length === 0)}
        onClick={() => {
          if (state.memtable.length === 0) return;
          engine.dispatch({ type: "flush" });
        }}
      >
        {t.form.flushButton}
      </button>

      <button type="button" data-testid="lsm-reset" onClick={() => engine.reset()}>
        {t.form.resetButton}
      </button>

      <p data-testid="lsm-event-log">
        <strong>{t.eventLogLabel}</strong>
        <span>{eventText}</span>
      </p>

      <A11yNarrator state={state} locale={locale} narratable={lsmTreeNarratable} />
    </div>
  );
}

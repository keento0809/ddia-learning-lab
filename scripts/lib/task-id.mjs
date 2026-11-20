// タスクID予約の判定ロジック(T-726)。GitHubやgitへのアクセスは呼び出し側が渡すclientに
// 閉じ込め、このファイルは外部に触れない。
//
// 失敗→恒久対策: 「未使用を確認してから使う」手順は、並列セッションが同時に確認すると
// 双方が空きと判断する(T-708/T-709でPR #178が破棄)。GitHubのタグ作成は同名の参照が
// あると拒否されるため、タグ`task-id/T-xxx`の作成成功をもって予約成立とする。

export const TAG_PREFIX = "task-id/";

// T-725以前は予約の仕組みがなかったため、CIでの予約必須はT-726以降に限る。
export const FIRST_RESERVED_NUMBER = 726;

const DEFAULT_SERIES = 7;
const MAX_RESERVE_ATTEMPTS = 10;

const ID_PATTERN = /(?<![A-Za-z0-9])T-(\d{3})(?:[a-z])?(?![A-Za-z0-9])/gi;
// 「T-715〜T-723」のような範囲予約は途中の番号が本文に現れないため展開する。
const RANGE_PATTERN =
  /(?<![A-Za-z0-9])T-(\d{3})\s*[〜~]\s*T-(\d{3})(?![A-Za-z0-9])/gi;

export function formatTaskId(number) {
  return `T-${String(number).padStart(3, "0")}`;
}

export function parseTaskId(text) {
  const match = /^T-(\d{3})$/i.exec(text.trim());
  return match ? `T-${match[1]}` : null;
}

function taskNumber(id) {
  return Number(id.slice(2));
}

// 枝番(T-705a等)は親IDと同じ予約に属するものとして親IDへ正規化する。
export function extractTaskIds(text) {
  const ids = new Set();
  for (const match of text.matchAll(ID_PATTERN)) {
    ids.add(`T-${match[1]}`);
  }
  for (const match of text.matchAll(RANGE_PATTERN)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    for (let number = start; number <= end; number += 1) {
      ids.add(formatTaskId(number));
    }
  }
  return ids;
}

export function nextTaskId(usedIds, series = DEFAULT_SERIES) {
  const floor = series * 100;
  const ceiling = floor + 99;
  let highest = floor;
  for (const id of usedIds) {
    const number = taskNumber(id);
    if (number >= floor && number <= ceiling && number > highest) {
      highest = number;
    }
  }
  if (highest >= ceiling) {
    throw new Error(
      `T-${series}xx の番号を使い切りました。--id で明示してください。`,
    );
  }
  return formatTaskId(highest + 1);
}

export function collectUsedIds(sources) {
  const used = new Set();
  for (const source of sources) {
    for (const id of extractTaskIds(source.text)) {
      used.add(id);
    }
  }
  return used;
}

export function findUsages(id, sources) {
  return sources
    .filter((source) => extractTaskIds(source.text).has(id))
    .map((source) => source.label);
}

export function reservationTagName(id) {
  return `${TAG_PREFIX}${id}`;
}

export function reservedIdsFromTagNames(tagNames) {
  const ids = new Set();
  for (const name of tagNames) {
    if (name.startsWith(TAG_PREFIX)) {
      const id = parseTaskId(name.slice(TAG_PREFIX.length));
      if (id) ids.add(id);
    }
  }
  return ids;
}

// client: { listSources(), listReservedIds(), createReservation(id, summary) }
// createReservationは同名タグが既にあるとき false を返し、それ以外の失敗は例外を投げる。
/**
 * @param {{
 *   listReservedIds: () => Promise<Set<string>>,
 *   listSources: () => Promise<{ label: string, text: string }[]>,
 *   createReservation: (id: string, summary: string) => Promise<boolean>,
 * }} client
 * @param {{ summary: string, id?: string, allowExisting?: boolean }} options
 */
export async function reserveTaskId(
  client,
  { summary, id, allowExisting = false },
) {
  if (!summary || summary.trim() === "") {
    throw new Error("作業概要が空です。タグに残す作業概要を指定してください。");
  }

  const reserved = await client.listReservedIds();
  const sources = await client.listSources();

  if (id) {
    if (reserved.has(id)) {
      throw new Error(`${id} は既に予約済みです。別のIDを使ってください。`);
    }
    const usages = findUsages(id, sources);
    if (usages.length > 0 && !allowExisting) {
      throw new Error(
        `${id} は既に使われています: ${usages.join(", ")}。` +
          "設計書で定義済みのタスクなど重複でないとユーザーが判断した場合のみ --existing を付けてください。",
      );
    }
    if (!(await client.createReservation(id, summary))) {
      throw new Error(
        `${id} は別のセッションが先に予約しました。別のIDを使ってください。`,
      );
    }
    return id;
  }

  const used = new Set([...reserved, ...collectUsedIds(sources)]);
  for (let attempt = 0; attempt < MAX_RESERVE_ATTEMPTS; attempt += 1) {
    const candidate = nextTaskId(used);
    if (await client.createReservation(candidate, summary)) {
      return candidate;
    }
    used.add(candidate);
  }
  throw new Error(`${MAX_RESERVE_ATTEMPTS}回試しても予約できませんでした。`);
}

export function evaluatePullRequest({ title, branch, reservedIds }) {
  const isManaged = (id) => taskNumber(id) >= FIRST_RESERVED_NUMBER;
  const titleIds = [...extractTaskIds(title)].filter(isManaged);
  const branchIds = [...extractTaskIds(branch)].filter(isManaged);
  const problems = [];

  for (const id of titleIds) {
    if (!branchIds.includes(id)) {
      problems.push(`PRタイトルの ${id} がブランチ名 ${branch} にありません。`);
    }
  }
  for (const id of branchIds) {
    if (!titleIds.includes(id)) {
      problems.push(`ブランチ名の ${id} がPRタイトルにありません。`);
    }
  }
  for (const id of new Set([...titleIds, ...branchIds])) {
    if (!reservedIds.has(id)) {
      problems.push(
        `${id} は未予約です(タグ ${reservationTagName(id)} がありません)。`,
      );
    }
  }
  return problems;
}

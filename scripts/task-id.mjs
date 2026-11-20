#!/usr/bin/env node
// タスクIDの予約と確認を行うCLI(T-726)。判定ロジックはscripts/lib/task-id.mjsを参照。
//
//   npm run task:reserve -- "作業概要"                 次の空き番号を予約
//   npm run task:reserve -- --id T-730 "作業概要"      指定IDを予約
//   npm run task:check -- T-730                        予約状況と使用箇所を表示
//   npm run check:task-id                              PRのタイトルとブランチを検査(CI用)
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

import {
  TAG_PREFIX,
  evaluatePullRequest,
  findUsages,
  parseTaskId,
  reservationTagName,
  reserveTaskId,
  reservedIdsFromTagNames,
} from "./lib/task-id.mjs";

const REPO = "repos/{owner}/{repo}";

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function gh(...args) {
  return run("gh", args);
}

function git(...args) {
  return run("git", args);
}

function lines(text) {
  return text.split("\n").filter((line) => line !== "");
}

async function listReservedIds() {
  const refs = gh(
    "api",
    "--paginate",
    `${REPO}/git/matching-refs/tags/${TAG_PREFIX}`,
    "--jq",
    ".[].ref",
  );
  return reservedIdsFromTagNames(
    lines(refs).map((ref) => ref.replace("refs/tags/", "")),
  );
}

// 予約タグがない時期のIDも重複扱いするため、IDが現れる場所を横断して集める。
// ローカルブランチはworktreeと参照を共有するので、未pushの作業もここに含まれる。
async function listSources() {
  git("fetch", "--quiet", "origin", "main");

  const pullRequests = JSON.parse(
    gh(
      "pr",
      "list",
      "--state",
      "all",
      "--limit",
      "1000",
      "--json",
      "number,title,headRefName",
    ),
  );
  const remoteBranches = lines(git("ls-remote", "--heads", "origin")).map(
    (line) => line.split("\t")[1].replace("refs/heads/", ""),
  );
  const localBranches = lines(
    git("for-each-ref", "refs/heads", "--format=%(refname:short)"),
  );

  return [
    {
      label: "docs/tasks/STATUS.md",
      text: git("show", "origin/main:docs/tasks/STATUS.md"),
    },
    // 設計書は日本語ファイル名のため、-zなしだとgitがパスをエスケープして読めなくなる。
    ...git("ls-tree", "-r", "-z", "--name-only", "origin/main", "docs/design")
      .split("\0")
      .filter((path) => path !== "")
      .map((path) => ({
        label: path,
        text: git("show", `origin/main:${path}`),
      })),
    ...pullRequests.map((pr) => ({
      label: `PR #${pr.number}`,
      text: `${pr.title}\n${pr.headRefName}`,
    })),
    ...remoteBranches.map((name) => ({ label: `origin/${name}`, text: name })),
    ...localBranches.map((name) => ({
      label: `ローカルブランチ ${name}`,
      text: name,
    })),
  ];
}

function isAlreadyExists(error) {
  return String(error.stderr ?? "").includes("Reference already exists");
}

async function createReservation(id, summary) {
  const name = reservationTagName(id);
  const mainSha = gh(
    "api",
    `${REPO}/git/ref/heads/main`,
    "--jq",
    ".object.sha",
  );
  const tagSha = gh(
    "api",
    `${REPO}/git/tags`,
    "-f",
    `tag=${name}`,
    "-f",
    `message=${summary}`,
    "-f",
    `object=${mainSha}`,
    "-f",
    "type=commit",
    "--jq",
    ".sha",
  );
  try {
    gh(
      "api",
      `${REPO}/git/refs`,
      "-f",
      `ref=refs/tags/${name}`,
      "-f",
      `sha=${tagSha}`,
      "--silent",
    );
    return true;
  } catch (error) {
    if (isAlreadyExists(error)) return false;
    throw error;
  }
}

function readReservationSummary(id) {
  const ref = JSON.parse(
    gh("api", `${REPO}/git/ref/tags/${reservationTagName(id)}`),
  );
  return gh("api", `${REPO}/git/tags/${ref.object.sha}`, "--jq", ".message");
}

const client = { listReservedIds, listSources, createReservation };

function requireTaskId(text) {
  const id = text ? parseTaskId(text) : null;
  if (!id) {
    throw new Error(
      `タスクIDの形式が不正です: ${text ?? "(未指定)"}(例: T-730)`,
    );
  }
  return id;
}

async function reserveCommand(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      id: { type: "string" },
      existing: { type: "boolean", default: false },
    },
  });
  const reserved = await reserveTaskId(client, {
    summary: positionals.join(" "),
    id: values.id === undefined ? undefined : requireTaskId(values.id),
    allowExisting: values.existing,
  });
  console.log(
    `[task-id] ${reserved} を予約しました(タグ ${reservationTagName(reserved)})。`,
  );
}

async function checkCommand(args) {
  const id = requireTaskId(args[0]);
  const reserved = (await listReservedIds()).has(id);
  const usages = findUsages(id, await listSources());

  console.log(
    `[task-id] ${id}: ${reserved ? `予約済み「${readReservationSummary(id)}」` : "未予約"}`,
  );
  console.log(
    `[task-id] 使用箇所: ${usages.length > 0 ? usages.join(", ") : "なし"}`,
  );
  if (!reserved) {
    throw new Error(
      `${id} は未予約です。npm run task:reserve で予約してから着手してください。`,
    );
  }
}

async function checkPullRequestCommand() {
  const title = process.env.PR_TITLE;
  const branch = process.env.PR_BRANCH;
  if (title === undefined || branch === undefined) {
    throw new Error("環境変数 PR_TITLE と PR_BRANCH が必要です。");
  }
  const problems = evaluatePullRequest({
    title,
    branch,
    reservedIds: await listReservedIds(),
  });
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  console.log(`[task-id] OK: ${title} (${branch})`);
}

const commands = {
  reserve: reserveCommand,
  check: checkCommand,
  "check-pr": checkPullRequestCommand,
};

const [commandName, ...commandArgs] = process.argv.slice(2);
const command = commands[commandName];

try {
  if (!command) {
    throw new Error(
      `サブコマンドを指定してください: ${Object.keys(commands).join(" / ")}`,
    );
  }
  await command(commandArgs);
} catch (error) {
  console.error(`[task-id] 失敗: ${error.message}`);
  if (error.stderr) console.error(String(error.stderr).trim());
  process.exitCode = 1;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import { useLessonLocale } from "@/lib/lesson/localeContext";
import type { A11yNarratable } from "@/lib/contracts";
import { A11yNarrator } from "./core/A11yNarrator";
import { SvgStage } from "./core/SvgStage";
import { Timeline } from "./core/Timeline";
import { createSimEngine, type SimEngineDefinition } from "./core/simEngine";
import type { VizComponentProps } from "./registry";

/**
 * ReplicationLagViz(02§8.2)。リーダー1+フォロワー2の非同期レプリケーションを
 * 「ティック単位で進む状態機械」として表現する。書込み/読取りは即座に処理される
 * のではなく、ネットワーク遅延スライダーの値だけ`inFlight`メッセージとして
 * 転送中になり、ユーザーはそれをドロップしたりTimelineでステップ再生できる。
 * 「自分の書込みが読めない」シナリオは、書込みをリーダーへ即時コミットしつつ
 * 読み取りリクエストの到達を短い固定ティック(SCENARIO_READ_TRAVEL_TICKS)に
 * 固定することで、レプリケーション伝搬(ネットワーク遅延ぶん)より先に読み取りが
 * 解決される状況を決定的に作り出す(乱数を使わないため毎回同じ結果になる)。
 */

export type ReplicationNodeId = "leader" | "follower-1" | "follower-2";
export type MitigationMode = "none" | "read-from-leader" | "wait-for-version";

const CLIENT_ID = "you";
export const MIN_NETWORK_DELAY_TICKS = 0;
export const MAX_NETWORK_DELAY_TICKS = 6;
const DEFAULT_NETWORK_DELAY_TICKS = 2;
const SCENARIO_MIN_DELAY_TICKS = 2;
const SCENARIO_READ_TRAVEL_TICKS = 1;

interface WriteRequestMessage {
  id: string;
  kind: "write-request";
  clientId: string;
  remainingTicks: number;
  totalTicks: number;
}

interface ReplicationMessage {
  id: string;
  kind: "replication";
  target: "follower-1" | "follower-2";
  version: number;
  remainingTicks: number;
  totalTicks: number;
}

interface ReadRequestMessage {
  id: string;
  kind: "read-request";
  clientId: string;
  requestedTarget: ReplicationNodeId;
  target: ReplicationNodeId;
  requiredVersion: number;
  remainingTicks: number;
  totalTicks: number;
  waiting: boolean;
  held: boolean;
}

export type ReplicationInFlightMessage =
  | WriteRequestMessage
  | ReplicationMessage
  | ReadRequestMessage;

export interface ReadLogEntry {
  id: string;
  clientId: string;
  requestedTarget: ReplicationNodeId;
  servedTarget: ReplicationNodeId;
  requiredVersion: number;
  resultVersion: number;
  violation: boolean;
  tick: number;
}

export interface ReplicationLagState {
  tick: number;
  networkDelayTicks: number;
  mitigation: MitigationMode;
  leaderVersion: number;
  followerVersions: Record<"follower-1" | "follower-2", number>;
  inFlight: ReplicationInFlightMessage[];
  clientLastWriteVersion: Record<string, number>;
  readLog: ReadLogEntry[];
  violations: number;
  droppedCount: number;
  nextMessageId: number;
}

export type ReplicationLagAction =
  | { type: "SET_NETWORK_DELAY"; ticks: number }
  | { type: "SET_MITIGATION"; mode: MitigationMode }
  | { type: "WRITE"; clientId: string }
  | { type: "READ"; clientId: string; target: ReplicationNodeId }
  | { type: "DROP_MESSAGE"; messageId: string }
  | { type: "RUN_READ_YOUR_WRITES_SCENARIO" };

function clampNetworkDelay(ticks: number): number {
  return Math.min(MAX_NETWORK_DELAY_TICKS, Math.max(MIN_NETWORK_DELAY_TICKS, Math.round(ticks)));
}

function resolveReadTarget(
  requestedTarget: ReplicationNodeId,
  mitigation: MitigationMode,
): ReplicationNodeId {
  return mitigation === "read-from-leader" ? "leader" : requestedTarget;
}

function versionOf(
  state: Pick<ReplicationLagState, "leaderVersion" | "followerVersions">,
  node: ReplicationNodeId,
): number {
  return node === "leader" ? state.leaderVersion : state.followerVersions[node];
}

function createInitialState(): ReplicationLagState {
  return {
    tick: 0,
    networkDelayTicks: DEFAULT_NETWORK_DELAY_TICKS,
    mitigation: "none",
    leaderVersion: 0,
    followerVersions: { "follower-1": 0, "follower-2": 0 },
    inFlight: [],
    clientLastWriteVersion: {},
    readLog: [],
    violations: 0,
    droppedCount: 0,
    nextMessageId: 1,
  };
}

function applyAction(state: ReplicationLagState, action: ReplicationLagAction): ReplicationLagState {
  switch (action.type) {
    case "SET_NETWORK_DELAY":
      return { ...state, networkDelayTicks: clampNetworkDelay(action.ticks) };

    case "SET_MITIGATION":
      return { ...state, mitigation: action.mode };

    case "WRITE": {
      const message: WriteRequestMessage = {
        id: `msg-${state.nextMessageId}`,
        kind: "write-request",
        clientId: action.clientId,
        remainingTicks: state.networkDelayTicks,
        totalTicks: state.networkDelayTicks,
      };
      return {
        ...state,
        inFlight: [...state.inFlight, message],
        nextMessageId: state.nextMessageId + 1,
      };
    }

    case "READ": {
      const requiredVersion = state.clientLastWriteVersion[action.clientId] ?? 0;
      const servedTarget = resolveReadTarget(action.target, state.mitigation);
      const message: ReadRequestMessage = {
        id: `msg-${state.nextMessageId}`,
        kind: "read-request",
        clientId: action.clientId,
        requestedTarget: action.target,
        target: servedTarget,
        requiredVersion,
        remainingTicks: state.networkDelayTicks,
        totalTicks: state.networkDelayTicks,
        waiting: state.mitigation === "wait-for-version" && servedTarget !== "leader",
        held: false,
      };
      return {
        ...state,
        inFlight: [...state.inFlight, message],
        nextMessageId: state.nextMessageId + 1,
      };
    }

    case "DROP_MESSAGE": {
      const wasPresent = state.inFlight.some((message) => message.id === action.messageId);
      if (!wasPresent) {
        return state;
      }
      return {
        ...state,
        inFlight: state.inFlight.filter((message) => message.id !== action.messageId),
        droppedCount: state.droppedCount + 1,
      };
    }

    case "RUN_READ_YOUR_WRITES_SCENARIO": {
      const scenarioDelay = Math.max(state.networkDelayTicks, SCENARIO_MIN_DELAY_TICKS);
      const writtenVersion = 1;
      const servedTarget = resolveReadTarget("follower-1", state.mitigation);
      const replicationMessages: ReplicationMessage[] = (["follower-1", "follower-2"] as const).map(
        (target, index) => ({
          id: `msg-${state.nextMessageId + index}`,
          kind: "replication",
          target,
          version: writtenVersion,
          remainingTicks: scenarioDelay,
          totalTicks: scenarioDelay,
        }),
      );
      const readMessage: ReadRequestMessage = {
        id: `msg-${state.nextMessageId + replicationMessages.length}`,
        kind: "read-request",
        clientId: CLIENT_ID,
        requestedTarget: "follower-1",
        target: servedTarget,
        requiredVersion: writtenVersion,
        remainingTicks: SCENARIO_READ_TRAVEL_TICKS,
        totalTicks: SCENARIO_READ_TRAVEL_TICKS,
        waiting: state.mitigation === "wait-for-version" && servedTarget !== "leader",
        held: false,
      };
      return {
        ...state,
        tick: 0,
        networkDelayTicks: scenarioDelay,
        leaderVersion: writtenVersion,
        followerVersions: { "follower-1": 0, "follower-2": 0 },
        inFlight: [...replicationMessages, readMessage],
        clientLastWriteVersion: { ...state.clientLastWriteVersion, [CLIENT_ID]: writtenVersion },
        readLog: [],
        violations: 0,
        droppedCount: 0,
        nextMessageId: state.nextMessageId + replicationMessages.length + 1,
      };
    }

    default:
      return state;
  }
}

function advance(state: ReplicationLagState): ReplicationLagState {
  const nextTick = state.tick + 1;
  let leaderVersion = state.leaderVersion;
  const followerVersions = { ...state.followerVersions };
  const clientLastWriteVersion = { ...state.clientLastWriteVersion };
  const readLog = [...state.readLog];
  let violations = state.violations;
  let nextMessageId = state.nextMessageId;
  const spawned: ReplicationInFlightMessage[] = [];
  const carried: ReplicationInFlightMessage[] = [];

  // フェーズ1: 書込みリクエストとレプリケーションを先に到達させ、このtickでの
  // 最新バージョンを確定する(読み取りリクエストがそれを参照できるように)。
  for (const message of state.inFlight) {
    if (message.kind === "write-request") {
      const remaining = message.remainingTicks - 1;
      if (remaining <= 0) {
        leaderVersion += 1;
        clientLastWriteVersion[message.clientId] = leaderVersion;
        for (const target of ["follower-1", "follower-2"] as const) {
          spawned.push({
            id: `msg-${nextMessageId}`,
            kind: "replication",
            target,
            version: leaderVersion,
            remainingTicks: state.networkDelayTicks,
            totalTicks: state.networkDelayTicks,
          });
          nextMessageId += 1;
        }
      } else {
        carried.push({ ...message, remainingTicks: remaining });
      }
    } else if (message.kind === "replication") {
      const remaining = message.remainingTicks - 1;
      if (remaining <= 0) {
        followerVersions[message.target] = Math.max(followerVersions[message.target], message.version);
      } else {
        carried.push({ ...message, remainingTicks: remaining });
      }
    }
  }

  // フェーズ2: 読み取りリクエスト。フェーズ1で確定した最新バージョンを参照する。
  for (const message of state.inFlight) {
    if (message.kind !== "read-request") continue;
    const currentVersion = versionOf({ leaderVersion, followerVersions }, message.target);

    if (message.waiting) {
      const remaining = Math.max(message.remainingTicks - 1, 0);
      if (remaining <= 0 && currentVersion >= message.requiredVersion) {
        readLog.push({
          id: message.id,
          clientId: message.clientId,
          requestedTarget: message.requestedTarget,
          servedTarget: message.target,
          requiredVersion: message.requiredVersion,
          resultVersion: currentVersion,
          violation: false,
          tick: nextTick,
        });
      } else {
        carried.push({ ...message, remainingTicks: remaining, held: remaining <= 0 });
      }
      continue;
    }

    const remaining = message.remainingTicks - 1;
    if (remaining <= 0) {
      const violation = currentVersion < message.requiredVersion;
      if (violation) violations += 1;
      readLog.push({
        id: message.id,
        clientId: message.clientId,
        requestedTarget: message.requestedTarget,
        servedTarget: message.target,
        requiredVersion: message.requiredVersion,
        resultVersion: currentVersion,
        violation,
        tick: nextTick,
      });
    } else {
      carried.push({ ...message, remainingTicks: remaining });
    }
  }

  return {
    ...state,
    tick: nextTick,
    leaderVersion,
    followerVersions,
    clientLastWriteVersion,
    inFlight: [...carried, ...spawned],
    readLog,
    violations,
    nextMessageId,
  };
}

export const replicationLagDefinition: SimEngineDefinition<ReplicationLagState, ReplicationLagAction> = {
  createInitialState,
  applyAction: (state, action) => applyAction(state, action),
  advance,
};

function mitigationLabelOf(
  mode: MitigationMode,
  t: ReturnType<typeof getMessages>["replicationLagViz"],
): string {
  return t.mitigationOption[mode];
}

export function describeReplicationLagState(state: ReplicationLagState, locale: Locale): string {
  const t = getMessages(locale).replicationLagViz;
  return formatMessage(t.narratorSummary, {
    tick: state.tick,
    leaderVersion: state.leaderVersion,
    follower1: state.followerVersions["follower-1"],
    follower2: state.followerVersions["follower-2"],
    mitigation: mitigationLabelOf(state.mitigation, t),
    inFlight: state.inFlight.length,
    violations: state.violations,
  });
}

export const replicationLagNarratable: A11yNarratable<ReplicationLagState> = {
  describeState: describeReplicationLagState,
};

type Messages = ReturnType<typeof getMessages>["replicationLagViz"];

function nodeLabelOf(node: ReplicationNodeId, t: Messages): string {
  return t.nodeLabel[node];
}

function describeMessage(message: ReplicationInFlightMessage, t: Messages): string {
  if (message.kind === "write-request") {
    const route = formatMessage(t.messageRouteLabel, {
      from: t.clientLabel,
      to: t.nodeLabel.leader,
    });
    const ticks = formatMessage(t.messageTicksLabel, { ticks: message.remainingTicks });
    return `${t.messageKindLabel["write-request"]} ${route} ${ticks}`;
  }
  if (message.kind === "replication") {
    const route = formatMessage(t.messageRouteLabel, {
      from: t.nodeLabel.leader,
      to: nodeLabelOf(message.target, t),
    });
    const ticks = formatMessage(t.messageTicksLabel, { ticks: message.remainingTicks });
    const version = formatMessage(t.versionLabel, { version: message.version });
    return `${t.messageKindLabel.replication} ${route} ${version} ${ticks}`;
  }
  const route = formatMessage(t.messageRouteLabel, {
    from: t.clientLabel,
    to: nodeLabelOf(message.target, t),
  });
  const version = formatMessage(t.versionLabel, { version: message.requiredVersion });
  const suffix = message.held ? ` ${t.messageHeldLabel}` : ` ${formatMessage(t.messageTicksLabel, { ticks: message.remainingTicks })}`;
  return `${t.messageKindLabel["read-request"]} ${route} ${version}${suffix}`;
}

function describeReadLogEntry(entry: ReadLogEntry, t: Messages): string {
  const base = formatMessage(t.readLogEntry, {
    tick: entry.tick,
    clientId: t.clientLabel,
    target: nodeLabelOf(entry.servedTarget, t),
    resultVersion: entry.resultVersion,
    requiredVersion: entry.requiredVersion,
  });
  return `${base} — ${entry.violation ? t.readLogViolation : t.readLogOk}`;
}

const NODE_POSITION: Record<ReplicationNodeId, { x: number; y: number }> = {
  leader: { x: 200, y: 40 },
  "follower-1": { x: 80, y: 200 },
  "follower-2": { x: 320, y: 200 },
};
const CLIENT_POSITION = { x: 200, y: 220 };

function sourcePositionOf(message: ReplicationInFlightMessage): { x: number; y: number } {
  if (message.kind === "replication") return NODE_POSITION.leader;
  return CLIENT_POSITION;
}

function targetPositionOf(message: ReplicationInFlightMessage): { x: number; y: number } {
  if (message.kind === "write-request") return NODE_POSITION.leader;
  if (message.kind === "replication") return NODE_POSITION[message.target];
  return NODE_POSITION[message.target];
}

function lerp(a: number, b: number, progress: number): number {
  return a + (b - a) * progress;
}

function progressOf(message: ReplicationInFlightMessage): number {
  if (message.totalTicks <= 0) return 1;
  return 1 - message.remainingTicks / message.totalTicks;
}

export default function ReplicationLagViz({}: VizComponentProps) {
  const locale = useLessonLocale();
  const t = getMessages(locale).replicationLagViz;
  const engine = useMemo(() => createSimEngine(replicationLagDefinition, { seed: 1 }), []);
  const [state, setState] = useState(engine.getState());
  const [readTarget, setReadTarget] = useState<ReplicationNodeId>("follower-1");

  useEffect(() => engine.subscribe(setState), [engine]);

  return (
    <div data-testid="replication-lag-viz">
      <h3>{t.heading}</h3>

      <SvgStage viewBox={{ minX: 0, minY: 0, width: 400, height: 240 }} ariaLabel={t.heading}>
        <circle cx={NODE_POSITION.leader.x} cy={NODE_POSITION.leader.y} r={20} data-testid="replication-lag-node-leader" />
        <text x={NODE_POSITION.leader.x} y={NODE_POSITION.leader.y - 26} textAnchor="middle">
          {`${nodeLabelOf("leader", t)} ${formatMessage(t.versionLabel, { version: state.leaderVersion })}`}
        </text>

        <circle cx={NODE_POSITION["follower-1"].x} cy={NODE_POSITION["follower-1"].y} r={20} data-testid="replication-lag-node-follower-1" />
        <text x={NODE_POSITION["follower-1"].x} y={NODE_POSITION["follower-1"].y + 36} textAnchor="middle">
          {`${nodeLabelOf("follower-1", t)} ${formatMessage(t.versionLabel, { version: state.followerVersions["follower-1"] })}`}
        </text>

        <circle cx={NODE_POSITION["follower-2"].x} cy={NODE_POSITION["follower-2"].y} r={20} data-testid="replication-lag-node-follower-2" />
        <text x={NODE_POSITION["follower-2"].x} y={NODE_POSITION["follower-2"].y + 36} textAnchor="middle">
          {`${nodeLabelOf("follower-2", t)} ${formatMessage(t.versionLabel, { version: state.followerVersions["follower-2"] })}`}
        </text>

        <circle cx={CLIENT_POSITION.x} cy={CLIENT_POSITION.y} r={12} data-testid="replication-lag-node-client" />
        <text x={CLIENT_POSITION.x} y={CLIENT_POSITION.y + 24} textAnchor="middle">
          {t.clientLabel}
        </text>

        {state.inFlight.map((message) => {
          const from = sourcePositionOf(message);
          const to = targetPositionOf(message);
          const progress = progressOf(message);
          const cx = lerp(from.x, to.x, progress);
          const cy = lerp(from.y, to.y, progress);
          const isHeld = message.kind === "read-request" && message.held;
          return (
            <circle
              key={message.id}
              cx={cx}
              cy={cy}
              r={6}
              data-testid={`replication-lag-message-${message.id}`}
              opacity={isHeld ? 0.5 : 1}
            />
          );
        })}
      </SvgStage>

      <A11yNarrator state={state} locale={locale} narratable={replicationLagNarratable} />

      <Timeline locale={locale} onStep={() => engine.step()} onReset={() => engine.reset()} />

      <label data-testid="replication-lag-network-delay-label">
        {formatMessage(t.networkDelayLabel, { ticks: state.networkDelayTicks })}
        <input
          type="range"
          aria-label={t.networkDelayInputAriaLabel}
          data-testid="replication-lag-network-delay"
          min={MIN_NETWORK_DELAY_TICKS}
          max={MAX_NETWORK_DELAY_TICKS}
          step={1}
          value={state.networkDelayTicks}
          onChange={(event) =>
            engine.dispatch({ type: "SET_NETWORK_DELAY", ticks: Number(event.target.value) })
          }
        />
      </label>

      <fieldset data-testid="replication-lag-mitigation">
        <legend>{t.mitigationGroupLabel}</legend>
        {(["none", "read-from-leader", "wait-for-version"] as const).map((mode) => (
          <label key={mode} data-testid={`replication-lag-mitigation-${mode}-label`}>
            <input
              type="radio"
              name="replication-lag-mitigation"
              checked={state.mitigation === mode}
              data-testid={`replication-lag-mitigation-${mode}`}
              onChange={() => engine.dispatch({ type: "SET_MITIGATION", mode })}
            />
            {mitigationLabelOf(mode, t)}
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        data-testid="replication-lag-write"
        onClick={() => engine.dispatch({ type: "WRITE", clientId: CLIENT_ID })}
      >
        {t.writeButtonLabel}
      </button>

      <label data-testid="replication-lag-read-target-label">
        {t.readTargetSelectLabel}
        <select
          value={readTarget}
          data-testid="replication-lag-read-target"
          onChange={(event) => setReadTarget(event.target.value as ReplicationNodeId)}
        >
          <option value="leader">{nodeLabelOf("leader", t)}</option>
          <option value="follower-1">{nodeLabelOf("follower-1", t)}</option>
          <option value="follower-2">{nodeLabelOf("follower-2", t)}</option>
        </select>
      </label>
      <button
        type="button"
        data-testid="replication-lag-read"
        onClick={() => engine.dispatch({ type: "READ", clientId: CLIENT_ID, target: readTarget })}
      >
        {t.readButtonLabel}
      </button>

      <button
        type="button"
        data-testid="replication-lag-scenario"
        onClick={() => engine.dispatch({ type: "RUN_READ_YOUR_WRITES_SCENARIO" })}
      >
        {t.scenarioButtonLabel}
      </button>

      <p data-testid="replication-lag-violations">
        {formatMessage(t.violationsLabel, { count: state.violations })}
      </p>
      <p data-testid="replication-lag-dropped">
        {formatMessage(t.droppedLabel, { count: state.droppedCount })}
      </p>

      <section aria-label={t.inFlightHeading}>
        <h4>{t.inFlightHeading}</h4>
        {state.inFlight.length === 0 ? (
          <p data-testid="replication-lag-inflight-empty">{t.inFlightEmpty}</p>
        ) : (
          <ul data-testid="replication-lag-inflight-list">
            {state.inFlight.map((message) => (
              <li key={message.id}>
                <span>{describeMessage(message, t)}</span>{" "}
                <button
                  type="button"
                  data-testid={`replication-lag-drop-${message.id}`}
                  onClick={() => engine.dispatch({ type: "DROP_MESSAGE", messageId: message.id })}
                >
                  {formatMessage(t.dropButtonLabel, { description: describeMessage(message, t) })}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t.readLogHeading}>
        <h4>{t.readLogHeading}</h4>
        {state.readLog.length === 0 ? (
          <p data-testid="replication-lag-readlog-empty">{t.readLogEmpty}</p>
        ) : (
          <ul data-testid="replication-lag-readlog-list">
            {state.readLog.map((entry) => (
              <li key={entry.id} data-testid={`replication-lag-readlog-${entry.id}`}>
                {describeReadLogEntry(entry, t)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

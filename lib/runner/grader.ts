import type {
  ExerciseAssert,
  ExercisePropertyTestCase,
  ExerciseTestCase,
} from "@/lib/contracts/exercise";

/**
 * 採点器(T-107b)。02§7.2 の4種assert(equals/deepEquals/oneOf・matches/property)、
 * 部分点計算、失敗時diff生成、演習別ヘルパ登録機構(`moveRatioNear`等)を実装する。
 *
 * このモジュールは値の比較・採点ロジックのみを担い、ユーザーコードのロード・実行
 * サンドボックス化は`harness.worker.ts`(T-107a)の責務、両者の配線は`jsRunner.ts`
 * 経路への統合(T-107c)で行う。そのため`resolveFn`(export名→関数)を外部から
 * 注入させることで、Worker/Node双方から同一ロジックを利用できるようにしてある。
 */

/** 02§7.4「graderVersionをsemverで管理」。テスト定義変更時はminor+1する運用。 */
export const graderVersion = "1.0.0";

export class CircularReferenceError extends Error {}
export class CheckExpressionError extends Error {}

const CIRCULAR_REFERENCE_MESSAGE = "循環参照を含む値は採点できません";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * `matches`(正規表現)の対象文字列化。プリミティブは`String()`を用いる
 * (`JSON.stringify(NaN)`が`"null"`になる等、JSONの丸めで意味が変わる値を
 * 正しく文字列化するため)。オブジェクト/配列のみJSON表現にフォールバックする。
 */
function stringifyForMatch(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return String(value);
  return safeStringify(value);
}

/**
 * 値に循環参照が含まれるかどうかを判定する(祖先パス追跡によるDFS)。
 * 同一オブジェクトへの複数箇所からの参照(DAG)は循環ではないため誤検知しない。
 * 深いネスト(演習データで数千階層になりうる)でもスタックオーバーフローしないよう、
 * 再帰ではなく明示スタックによる反復実装にしている。
 */
export function hasCircularReference(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;

  const onPath = new Set<object>();
  const stack: { node: object; children: unknown[]; index: number }[] = [];

  const enter = (node: object): boolean => {
    if (onPath.has(node)) return true;
    onPath.add(node);
    const children = Array.isArray(node) ? node : Object.values(node as Record<string, unknown>);
    stack.push({ node, children, index: 0 });
    return false;
  };

  if (enter(value)) return true;

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.children.length) {
      onPath.delete(frame.node);
      stack.pop();
      continue;
    }
    const child = frame.children[frame.index];
    frame.index++;
    if (typeof child === "object" && child !== null && enter(child)) {
      return true;
    }
  }
  return false;
}

/**
 * 構造比較(NaN/-0対応)。`Object.is`をリーフで用いるため、`NaN`同士は等価、
 * `0`と`-0`は非等価として扱う(`===`の既知の落とし穴を回避)。
 * 循環参照は事前に`hasCircularReference`で検出済みである前提(呼び出し側で保証)。
 * 深いネストでもスタックオーバーフローしないよう、再帰ではなく明示スタック
 * (比較待ちペアのワークリスト)による反復実装にしている。
 */
function structuralEqualsInternal(expected: unknown, actual: unknown): boolean {
  const worklist: [unknown, unknown][] = [[expected, actual]];

  while (worklist.length > 0) {
    const [e, a] = worklist.pop() as [unknown, unknown];
    if (Object.is(e, a)) continue;
    if (typeof e !== typeof a) return false;
    if (e === null || a === null) return false;
    if (typeof e !== "object") return false;

    const eIsArray = Array.isArray(e);
    const aIsArray = Array.isArray(a);
    if (eIsArray !== aIsArray) return false;

    if (eIsArray && aIsArray) {
      if (e.length !== a.length) return false;
      for (let i = 0; i < e.length; i++) worklist.push([e[i], a[i]]);
      continue;
    }

    const eObj = e as Record<string, unknown>;
    const aObj = a as Record<string, unknown>;
    const eKeys = Object.keys(eObj);
    const aKeys = Object.keys(aObj);
    if (eKeys.length !== aKeys.length) return false;
    for (const k of eKeys) {
      if (!Object.prototype.hasOwnProperty.call(aObj, k)) return false;
      worklist.push([eObj[k], aObj[k]]);
    }
  }
  return true;
}

/** `equals`/`deepEquals`共通の比較関数。循環参照を検出した場合は投げる。 */
export function structuralEquals(expected: unknown, actual: unknown): boolean {
  if (hasCircularReference(expected) || hasCircularReference(actual)) {
    throw new CircularReferenceError(CIRCULAR_REFERENCE_MESSAGE);
  }
  return structuralEqualsInternal(expected, actual);
}

/** diff生成の再帰上限(パスの深さ)。これを超えた部分木はJSONのフラット表示にフォールバックする。 */
export const MAX_DIFF_DEPTH = 5;

function isDiffableObject(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

/** 失敗時の簡易diff生成(02§7.2「失敗時は簡易diffを生成」)。 */
export function diffValues(expected: unknown, actual: unknown): string {
  return formatDiff(expected, actual, "value", 0);
}

function formatDiff(expected: unknown, actual: unknown, path: string, depth: number): string {
  if (structuralEqualsInternal(expected, actual)) return `${path}: 一致`;

  const bothArrays = Array.isArray(expected) && Array.isArray(actual);
  const bothObjects =
    isDiffableObject(expected) &&
    isDiffableObject(actual) &&
    Array.isArray(expected) === Array.isArray(actual);

  if (depth >= MAX_DIFF_DEPTH || !bothObjects) {
    return `${path}: expected ${safeStringify(expected)}, actual ${safeStringify(actual)}`;
  }

  const lines: string[] = [];
  if (bothArrays) {
    const expectedArr = expected as unknown[];
    const actualArr = actual as unknown[];
    const len = Math.max(expectedArr.length, actualArr.length);
    for (let i = 0; i < len; i++) {
      if (i >= expectedArr.length) {
        lines.push(`${path}[${i}]: expected <なし>, actual ${safeStringify(actualArr[i])}`);
      } else if (i >= actualArr.length) {
        lines.push(`${path}[${i}]: expected ${safeStringify(expectedArr[i])}, actual <なし>`);
      } else if (!structuralEqualsInternal(expectedArr[i], actualArr[i])) {
        lines.push(formatDiff(expectedArr[i], actualArr[i], `${path}[${i}]`, depth + 1));
      }
    }
  } else {
    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;
    const keys = new Set([...Object.keys(expectedObj), ...Object.keys(actualObj)]);
    for (const k of keys) {
      const inExpected = Object.prototype.hasOwnProperty.call(expectedObj, k);
      const inActual = Object.prototype.hasOwnProperty.call(actualObj, k);
      if (!inExpected) {
        lines.push(`${path}.${k}: expected <なし>, actual ${safeStringify(actualObj[k])}`);
      } else if (!inActual) {
        lines.push(`${path}.${k}: expected ${safeStringify(expectedObj[k])}, actual <なし>`);
      } else if (!structuralEqualsInternal(expectedObj[k], actualObj[k])) {
        lines.push(formatDiff(expectedObj[k], actualObj[k], `${path}.${k}`, depth + 1));
      }
    }
  }
  return lines.join("\n");
}

export type AssertOutcome = { pass: boolean; diff?: string; error?: string };

/** 02§7.2 assertごとの評価。equals/deepEqualsは同一の構造比較を共有する(設計表で同一挙動と定義されているため)。 */
export function evaluateAssert(assert: ExerciseAssert, actual: unknown): AssertOutcome {
  if (hasCircularReference(actual)) {
    return { pass: false, error: CIRCULAR_REFERENCE_MESSAGE };
  }

  switch (assert.type) {
    case "equals":
    case "deepEquals": {
      if (hasCircularReference(assert.value)) {
        return { pass: false, error: CIRCULAR_REFERENCE_MESSAGE };
      }
      const pass = structuralEqualsInternal(assert.value, actual);
      return pass ? { pass } : { pass, diff: diffValues(assert.value, actual) };
    }
    case "oneOf": {
      if (assert.value.some(hasCircularReference)) {
        return { pass: false, error: CIRCULAR_REFERENCE_MESSAGE };
      }
      const pass = assert.value.some((v) => structuralEqualsInternal(v, actual));
      return pass
        ? { pass }
        : {
            pass,
            diff: `期待値のいずれとも一致しませんでした: expected one of ${safeStringify(assert.value)}, actual ${safeStringify(actual)}`,
          };
    }
    case "matches": {
      let regex: RegExp;
      try {
        regex = new RegExp(assert.value);
      } catch {
        return { pass: false, error: `不正な正規表現です: ${assert.value}` };
      }
      const str = stringifyForMatch(actual);
      const pass = regex.test(str);
      return pass
        ? { pass }
        : {
            pass,
            diff: `期待した正規表現に一致しませんでした: pattern=/${assert.value}/, actual=${str}`,
          };
    }
  }
}

/**
 * プロパティベース検証(02§7.2「property」)のヘルパ実行コンテキスト。
 * ヘルパは演習の対象関数を`resolveFn`経由で呼び出せる(例: moveRatioNearが
 * 内部でユーザーのassignKeyを1000回呼び出し移動率を検証する)。
 */
export type PropertyContext = {
  resolveFn: (name: string) => unknown;
};

export type PropertyHelperOutcome = boolean | { pass: boolean; message?: string };

/** 演習別ヘルパ登録機構(02§7.2「ハーネス内ヘルパ、演習ごとに登録」)。 */
export type PropertyHelper = (ctx: PropertyContext, ...args: unknown[]) => PropertyHelperOutcome;

export type PropertyHelperRegistry = Record<string, PropertyHelper>;

type Token =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "ident"; value: string }
  | { kind: "punct"; value: string };

const TOKEN_PATTERN =
  /\s*(?:(\d+(?:\.\d+)?)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|([A-Za-z_][A-Za-z0-9_]*)|([()+\-*/,]))/y;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < input.length) {
    TOKEN_PATTERN.lastIndex = pos;
    const m = TOKEN_PATTERN.exec(input);
    if (!m || m.index !== pos) {
      throw new CheckExpressionError(`checkの構文が不正です: ${input}`);
    }
    pos = TOKEN_PATTERN.lastIndex;
    if (m[1] !== undefined) tokens.push({ kind: "num", value: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ kind: "str", value: m[2].slice(1, -1) });
    else if (m[3] !== undefined) tokens.push({ kind: "ident", value: m[3] });
    else if (m[4] !== undefined) tokens.push({ kind: "punct", value: m[4] });
  }
  return tokens;
}

/**
 * `check`文字列(例: `moveRatioNear(1/4, 0.15)`)の再帰下降パーサ。
 * `eval`/`new Function`は禁止トークンでもあり(harness.worker.ts)、独自コードに
 * おいても使わない方針のため、四則演算+括弧+文字列/真偽値/nullのみを
 * サポートする小さな式評価器として実装する。
 */
class CheckParser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new CheckExpressionError("checkの構文が不正です(予期しない終端)");
    this.pos++;
    return t;
  }

  private isPunct(value: string): boolean {
    const t = this.peek();
    return t?.kind === "punct" && t.value === value;
  }

  private expectPunct(value: string): void {
    const t = this.next();
    if (t.kind !== "punct" || t.value !== value) {
      throw new CheckExpressionError(`checkの構文が不正です: "${value}" が必要です`);
    }
  }

  parseCall(): { name: string; args: unknown[] } {
    const nameToken = this.next();
    if (nameToken.kind !== "ident") {
      throw new CheckExpressionError("checkは関数呼び出し形式である必要があります");
    }
    this.expectPunct("(");
    const args: unknown[] = [];
    if (!this.isPunct(")")) {
      args.push(this.parseArg());
      while (this.isPunct(",")) {
        this.next();
        args.push(this.parseArg());
      }
    }
    this.expectPunct(")");
    if (this.pos !== this.tokens.length) {
      throw new CheckExpressionError("checkの構文が不正です(余分なトークン)");
    }
    return { name: nameToken.value, args };
  }

  private parseArg(): unknown {
    const t = this.peek();
    if (t?.kind === "str") {
      this.next();
      return t.value;
    }
    if (t?.kind === "ident" && (t.value === "true" || t.value === "false" || t.value === "null")) {
      this.next();
      return t.value === "null" ? null : t.value === "true";
    }
    return this.parseAdditive();
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    while (this.isPunct("+") || this.isPunct("-")) {
      const op = this.next().value;
      const rhs = this.parseMultiplicative();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  private parseMultiplicative(): number {
    let value = this.parseUnary();
    while (this.isPunct("*") || this.isPunct("/")) {
      const op = this.next().value;
      const rhs = this.parseUnary();
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }

  private parseUnary(): number {
    if (this.isPunct("-") || this.isPunct("+")) {
      const op = this.next().value;
      const value = this.parseUnary();
      return op === "-" ? -value : value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const t = this.next();
    if (t.kind === "num") return t.value;
    if (t.kind === "punct" && t.value === "(") {
      const value = this.parseAdditive();
      this.expectPunct(")");
      return value;
    }
    throw new CheckExpressionError("checkの数値式が不正です");
  }
}

export function parseCheckExpression(check: string): { name: string; args: unknown[] } {
  const tokens = tokenize(check.trim());
  return new CheckParser(tokens).parseCall();
}

/** `check`文字列を解析しヘルパを実行する。未登録ヘルパは合否falseとして扱う(クラッシュさせない)。 */
export function evaluateProperty(
  check: string,
  helpers: PropertyHelperRegistry,
  context: PropertyContext,
): AssertOutcome {
  const { name, args } = parseCheckExpression(check);
  const helper = helpers[name];
  if (!helper) {
    return { pass: false, error: `未登録のプロパティヘルパーです: ${name}` };
  }
  const outcome = helper(context, ...args);
  const normalized = typeof outcome === "boolean" ? { pass: outcome } : outcome;
  return normalized.pass
    ? { pass: true }
    : { pass: false, diff: "message" in normalized ? normalized.message : undefined };
}

function isPropertyTestCase(tc: ExerciseTestCase): tc is ExercisePropertyTestCase {
  return "kind" in tc && tc.kind === "property";
}

export type GradedResult = {
  id: string;
  pass: boolean;
  actual?: string;
  diff?: string;
  error?: string;
};

export type GraderDeps = {
  /** 演習モジュールのexport名解決(例: `moduleExports[name]`)。関数以外/未定義なら失敗として扱う。 */
  resolveFn: (name: string) => unknown;
  propertyHelpers?: PropertyHelperRegistry;
};

/** 1テストケースを採点する。ユーザー関数の例外・循環参照・未登録ヘルパ等はすべてpass:falseに正規化する。 */
export function gradeTestCase(testCase: ExerciseTestCase, deps: GraderDeps): GradedResult {
  if (isPropertyTestCase(testCase)) {
    try {
      const outcome = evaluateProperty(testCase.check, deps.propertyHelpers ?? {}, {
        resolveFn: deps.resolveFn,
      });
      return { id: testCase.id, pass: outcome.pass, diff: outcome.diff, error: outcome.error };
    } catch (e) {
      return { id: testCase.id, pass: false, error: `プロパティ検証でエラーが発生しました: ${String(e)}` };
    }
  }

  const fn = deps.resolveFn(testCase.call.fn);
  if (typeof fn !== "function") {
    return { id: testCase.id, pass: false, error: `エクスポート関数 "${testCase.call.fn}" が見つかりません` };
  }

  let actual: unknown;
  try {
    actual = (fn as (...args: unknown[]) => unknown)(...testCase.call.args);
  } catch (e) {
    return { id: testCase.id, pass: false, error: String(e) };
  }

  const outcome = evaluateAssert(testCase.assert, actual);
  return {
    id: testCase.id,
    pass: outcome.pass,
    actual: safeStringify(actual),
    diff: outcome.diff,
    error: outcome.error,
  };
}

export type GradeSummary = {
  result: "pass" | "fail";
  score: number;
  perTest: GradedResult[];
};

/** 部分点計算(02§7.2「score = round(passed/total*100)」)。全合格時のみ`result:"pass"`。 */
export function gradeExercise(testCases: ExerciseTestCase[], deps: GraderDeps): GradeSummary {
  const perTest = testCases.map((tc) => gradeTestCase(tc, deps));
  const passed = perTest.filter((t) => t.pass).length;
  const score = Math.round((passed / perTest.length) * 100);
  return { result: passed === perTest.length ? "pass" : "fail", score, perTest };
}

/** 02§7.2「complexity(参考)」。合否には使用しない、入力サイズ2点からの目安表示専用。 */
export type ComplexitySample = { n: number; durationMs: number };

export type ComplexityEstimate = {
  label: string;
  observedRatio: number;
  warning: string;
};

const COMPLEXITY_WARNING =
  "この計算量推定は2点のサンプル実行時間比に基づく参考値です(実行環境により変動するため合否判定には使用されません)";

export function estimateComplexity(a: ComplexitySample, b: ComplexitySample): ComplexityEstimate {
  const [small, large] = a.n <= b.n ? [a, b] : [b, a];
  const sizeRatio = large.n / small.n;
  const timeRatio = Math.max(large.durationMs, 0.001) / Math.max(small.durationMs, 0.001);

  if (sizeRatio <= 1) {
    return { label: "不明(入力サイズが同一)", observedRatio: timeRatio, warning: COMPLEXITY_WARNING };
  }

  const exponent = Math.log(timeRatio) / Math.log(sizeRatio);

  let label: string;
  if (exponent <= 0.2) label = "O(1)";
  else if (exponent <= 0.7) label = "O(log n)";
  else if (exponent <= 1.3) label = "O(n)";
  else if (exponent <= 1.8) label = "O(n log n)";
  else if (exponent <= 2.5) label = "O(n^2)";
  else label = "O(2^n)相当(急激な増加)";

  return { label, observedRatio: timeRatio, warning: COMPLEXITY_WARNING };
}

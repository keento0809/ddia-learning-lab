import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * 02§3共通仕様「レート制限: 認証系 5req/min/IP」のミドルウェア実装。
 *
 * `isRateLimited`はインメモリのスライディングウィンドウ(モジュールスコープの
 * Map)で実装する。Cloudflare Workers(ADR-007)はisolateごとにメモリが
 * 分離されるため、複数isolate/エッジロケールをまたいだ厳密な集計は保証
 * されない(T-703 AU-8所見、docs/security/findings.md Medium #4)。
 *
 * T-705修正: 実際のCloudflare Workersランタイム上ではwrangler.jsoncの
 * Rate Limiting APIバインディング(`AUTH_RATE_LIMITER`、エッジ側で状態を
 * 共有しisolate分離の影響を受けない)を優先して使う`isAuthRateLimited`を
 * 呼び出し側(middleware.ts)の入口とする。このバインディングに到達できない
 * 実行環境(next dev単体・vitestのNode環境等、getCloudflareContext()が
 * 例外を投げる)では、既存のisolate単位フォールバック(`isRateLimited`)へ
 * 委譲する(lib/auth/workerApiAuth.tsの各forwarderと同じフォールバック方針)。
 *
 * T-705ハードニング(docs/security/findings.md 所見1・所見2、独立再侵入テスト):
 * `isAuthRateLimited`のfail-open(バインディング到達後の呼び出し失敗を「未到達」と
 * 誤同一視)と、`getClientIp`の`x-forwarded-for`フォールバック(識別子が完全に
 * クライアント制御下)を修正した。詳細は各関数のコメント参照。
 */

const WINDOW_MS = 60_000;
const LIMIT = 5;

const requestLog = new Map<string, number[]>();

export function isRateLimited(key: string, now: number = Date.now()): boolean {
  const timestamps = (requestLog.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= LIMIT) {
    requestLog.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  requestLog.set(key, timestamps);
  return false;
}

export function resetRateLimit(): void {
  requestLog.clear();
}

/**
 * T-705(docs/security/findings.md 所見2)修正: `getCloudflareContext()`自体の
 * 失敗(バインディング未到達。next dev単体・vitest等の実行環境で常に起きる想定内の
 * 経路)と、バインディングには到達できたが`env.AUTH_RATE_LIMITER.limit()`呼び出し
 * 自体が例外を投げるケース(キー長超過・エッジ側の一時障害等)を別のtry節で区別する。
 * 後者を前者と同一視して無条件にisolate単位フォールバックへ委譲するとfail-open
 * (`.limit()`が例外を投げ続ける限りT-705修正前と同じ弱いレート制限に静かに戻り、
 * かつ検知手段が無い)になるため、fail-closed(制限側)に倒し、縮退状態をログに残す。
 */
export async function isAuthRateLimited(key: string): Promise<boolean> {
  let context: Awaited<ReturnType<typeof getCloudflareContext>>;
  try {
    context = await getCloudflareContext({ async: true });
  } catch {
    return isRateLimited(key);
  }
  try {
    const { success } = await context.env.AUTH_RATE_LIMITER.limit({ key });
    return !success;
  } catch (err) {
    console.error("[auth-rate-limit] AUTH_RATE_LIMITER.limit()が例外を投げたためfail-closed", err);
    return true;
  }
}

/**
 * IPv4/IPv6として一応妥当な形をしているかの簡易チェック。厳密なRFC準拠は目的では
 * なく、レート制限のキー(ひいてはログ)に明らかな非IP文字列(空文字・過剰に長い
 * 文字列・制御文字混入等)をそのまま採用しないための最低限の防御。
 */
function isPlausibleIpAddress(value: string): boolean {
  const ipv4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d|0)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d|0)){3}$/;
  const ipv6 = /^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){2,7}$/;
  return ipv4.test(value) || ipv6.test(value);
}

/**
 * T-705(docs/security/findings.md 所見1)修正: `x-forwarded-for`フォールバックを
 * 廃止した。このヘッダはCloudflareを含むいかなる基盤からも整合性の保証を受けず、
 * クライアント・中間プロキシが自由に設定できるため、1リクエストごとに値を変える
 * だけでレート制限の識別子(=キー)を毎回変えられてしまう(T-705再侵入テスト
 * 経路4a/4b、無制限バイパス)。
 *
 * 残る`cf-connecting-ip`単独への依存については、Cloudflare Workersランタイムに
 * ヘッダを経由しないクライアント単位の識別子が存在しないことを確認済み
 * (`request.cf`は地理・TLS情報のみでIPを含まない。Rate Limiting APIバインディングの
 * `limit({key})`の`key`は呼び出し側が完全に指定する文字列でIPの自動抽出機構は無い。
 * いずれもCloudflare公式ドキュメントで確認)。本番Cloudflareエッジは実接続元IPで
 * このヘッダを必ず上書きするため(ヘッダ経由という以外に選択肢が無い以上)本番経路では
 * 信頼してよいが、この上書き保証は本番Cloudflareエッジを経由する経路にのみ成立する
 * デプロイトポロジ上の性質であり、`wrangler dev --local`等のローカル実行環境では
 * 成立しない(docs/security/findings.md 所見1、検証不能セクション参照。アプリコード側
 * で代替の非スプーフ可能な識別子を構成する手段が無いため、恒久対策はデプロイ環境側の
 * 保証に委ねざるを得ない)。ここでは最低限、IPとして妥当な形をしていない値
 * (非IP文字列の注入)は`cf-connecting-ip`として採用しない。
 */
export function getClientIp(headers: Headers): string {
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp && isPlausibleIpAddress(cfConnectingIp)) {
    return cfConnectingIp;
  }
  return "unknown";
}

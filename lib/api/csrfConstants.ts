/**
 * lib/api/csrf.ts のダブルサブミットcookie名・ヘッダ名の定数のみを切り出したもの。
 * lib/api/csrf.ts本体はnode:cryptoに依存しサーバ専用のため、クライアント
 * コンポーネント(T-105、進捗PUTのCSRFヘッダ付与)からはこちらのみをimportし、
 * node:cryptoをクライアントバンドルへ持ち込まないようにする。
 */
export const CSRF_COOKIE_NAME = "csrf-token";
export const CSRF_HEADER_NAME = "x-csrf-token";

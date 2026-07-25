/**
 * worker-api の Bindings。ADR-008 §4 T-502でDATABASE_URLを追加
 * (progress/submissions/dashboard/guest-progress移設によりPrismaが必要になったため)。
 */
export interface Env {
  AUTH_SECRET: string;
  DATABASE_URL: string;
  // T-505(ADR-008 §4): 未設定時はlib/sentry/toucan.tsがno-opする。
  SENTRY_DSN?: string;
}

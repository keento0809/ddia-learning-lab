/**
 * worker-api の Bindings。ADR-008 §4 T-501骨格時点ではAUTH_SECRETのみ。
 * DATABASE_URL等はT-502/T-503で移設時に追加する。
 */
export interface Env {
  AUTH_SECRET: string;
}

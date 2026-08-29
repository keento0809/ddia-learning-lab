#!/usr/bin/env bash
# T-004: docker-composeでテスト用Postgresを起動し、migrate deploy後に
# tests/integration/** を実行してからコンテナを片付ける。
# T-005: AUTH_SECRETはAuth.js(lib/auth/config.ts)のJWT署名鍵。テスト専用の
# 固定値(本番シークレットではない)で、統合テスト実行にのみ使用する。
# T-707: USE_NATIVE_POSTGRES=1(Docker Hub egress制限のあるサンドボックス向け。
# .claude/hooks/session-start.shがCLAUDE_CODE_REMOTE=true時に自動セット)の場合、
# DB起動をネイティブPostgresにフォールバックする(scripts/lib/test-db.sh)。
# 未設定時の挙動(docker-compose経路)は変更していない。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/test-db.sh
source "$SCRIPT_DIR/lib/test-db.sh"

COMPOSE_FILE="docker-compose.test.yml"
SERVICE="postgres-test"
export DATABASE_URL="postgresql://ddia:ddia@localhost:5433/ddia_test?schema=public"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET="test-integration-auth-secret-not-for-production-use"

trap test_db_down EXIT
test_db_up

npx prisma migrate deploy
npx vitest run -c vitest.integration.config.ts

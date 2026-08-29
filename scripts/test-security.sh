#!/usr/bin/env bash
# T-703(docs/design/11_ADR-011セキュリティ診断計画): tests/security/**の実行。
# scripts/test-integration.shと同様にテスト用Postgresを起動する。加えてAU-9
# (ADR-009検索インデックスのゲーティング検証)は実コンテンツ(content/ja, content/en)
# に対する生成物(lib/generated/search-index*.json)を必要とするため、
# pretest:security(package.json)で縮小フィクスチャではなく実コンテンツに対して
# npm run generate:curriculum を実行済みであることを前提とする。
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
npx vitest run -c vitest.security.config.ts

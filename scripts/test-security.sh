#!/usr/bin/env bash
# T-703(docs/design/11_ADR-011セキュリティ診断計画): tests/security/**の実行。
# scripts/test-integration.shと同様にテスト用Postgresを起動する。加えてAU-9
# (ADR-009検索インデックスのゲーティング検証)は実コンテンツ(content/ja, content/en)
# に対する生成物(lib/generated/search-index*.json)を必要とするため、
# pretest:security(package.json)で縮小フィクスチャではなく実コンテンツに対して
# npm run generate:curriculum を実行済みであることを前提とする。
set -euo pipefail

COMPOSE_FILE="docker-compose.test.yml"
SERVICE="postgres-test"
export DATABASE_URL="postgresql://ddia:ddia@localhost:5433/ddia_test?schema=public"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET="test-integration-auth-secret-not-for-production-use"

cleanup() {
  docker compose -f "$COMPOSE_FILE" down -v
}
trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" up -d

CID=$(docker compose -f "$COMPOSE_FILE" ps -q "$SERVICE")
for _ in $(seq 1 30); do
  HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$CID")
  if [ "$HEALTH" = "healthy" ]; then
    break
  fi
  sleep 1
done
if [ "$HEALTH" != "healthy" ]; then
  echo "postgres-test did not become healthy in time" >&2
  exit 1
fi

npx prisma migrate deploy
npx vitest run -c vitest.security.config.ts

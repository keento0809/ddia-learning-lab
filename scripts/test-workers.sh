#!/usr/bin/env bash
# T-502(ADR-008): workers/api/tests/**(Miniflare/workerd)はサービスbinding経由の
# 実バンドル・実DB接続込みの検証を行うため、scripts/test-integration.shと同様に
# テスト用Postgresを起動してから実行する。
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
npx vitest run -c vitest.workers.config.ts

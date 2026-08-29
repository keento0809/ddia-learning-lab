#!/usr/bin/env bash
# T-707: scripts/test-security.sh・scripts/test-integration.sh共通のテスト用DB
# 起動/停止ロジック。USE_NATIVE_POSTGRES=1(.claude/hooks/session-start.shが
# CLAUDE_CODE_REMOTE=true時に自動セット)の場合はDocker Hub egress制限のある
# サンドボックス向けにネイティブPostgresへフォールバックする。未設定時は既存の
# docker-compose経路のみを通り、挙動は変わらない。
set -euo pipefail

: "${COMPOSE_FILE:=docker-compose.test.yml}"
: "${SERVICE:=postgres-test}"

NATIVE_PG_CLUSTER="ddiatest"
NATIVE_PG_PORT="5433"

_docker_db_up() {
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    echo "[test-db] docker/docker composeが利用できず、USE_NATIVE_POSTGRESも未設定です。" >&2
    echo "[test-db] Docker Hubへのegressが制限されたサンドボックス環境(Claude Code on the web等)の場合、" >&2
    echo "[test-db] .claude/hooks/session-start.shがCLAUDE_CODE_REMOTE=true時にUSE_NATIVE_POSTGRES=1を自動セットします。" >&2
    echo "[test-db] フックが実行されたか(echo \$USE_NATIVE_POSTGRES)を確認するか、Dockerを利用可能にしてください。" >&2
    exit 1
  fi

  docker compose -f "$COMPOSE_FILE" up -d

  local cid health
  cid=$(docker compose -f "$COMPOSE_FILE" ps -q "$SERVICE")
  for _ in $(seq 1 30); do
    health=$(docker inspect --format='{{.State.Health.Status}}' "$cid")
    if [ "$health" = "healthy" ]; then
      break
    fi
    sleep 1
  done
  if [ "$health" != "healthy" ]; then
    echo "postgres-test did not become healthy in time" >&2
    exit 1
  fi
}

_docker_db_down() {
  docker compose -f "$COMPOSE_FILE" down -v
}

_native_pg_ensure_installed() {
  if command -v pg_createcluster >/dev/null 2>&1 && command -v pg_isready >/dev/null 2>&1; then
    return
  fi
  # 主責務は.claude/hooks/session-start.sh。ここはフックを経由しなかった場合の保険。
  echo "[test-db] postgresqlが見つからないため保険としてインストールします(通常はsession-start.shが済ませています)" >&2
  apt-get update -y
  apt-get install -y postgresql
}

_native_pg_version() {
  ls /usr/lib/postgresql | sort -n | tail -1
}

_native_db_up() {
  if ! command -v pg_createcluster >/dev/null 2>&1 || ! command -v pg_isready >/dev/null 2>&1; then
    _native_pg_ensure_installed
  fi

  if ! command -v pg_createcluster >/dev/null 2>&1; then
    echo "[test-db] USE_NATIVE_POSTGRES=1ですが、postgresqlのインストールに失敗しました。" >&2
    exit 1
  fi

  local ver
  ver=$(_native_pg_version)

  if ! pg_lsclusters | awk '{print $1, $2}' | grep -qx "$ver $NATIVE_PG_CLUSTER"; then
    pg_createcluster "$ver" "$NATIVE_PG_CLUSTER" -p "$NATIVE_PG_PORT" --start
  elif ! pg_lsclusters | awk -v c="$NATIVE_PG_CLUSTER" '$2==c {print $4}' | grep -q online; then
    pg_ctlcluster "$ver" "$NATIVE_PG_CLUSTER" start
  fi

  local ready=""
  for _ in $(seq 1 30); do
    if pg_isready -h /var/run/postgresql -p "$NATIVE_PG_PORT" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ -z "$ready" ]; then
    echo "native postgres (cluster $NATIVE_PG_CLUSTER) did not become ready in time" >&2
    exit 1
  fi

  su postgres -s /bin/bash -c \
    "psql -h /var/run/postgresql -p $NATIVE_PG_PORT -tAc \"SELECT 1 FROM pg_roles WHERE rolname='ddia'\"" \
    | grep -q 1 \
    || su postgres -s /bin/bash -c \
    "psql -h /var/run/postgresql -p $NATIVE_PG_PORT -c \"CREATE ROLE ddia LOGIN PASSWORD 'ddia'\""

  su postgres -s /bin/bash -c \
    "psql -h /var/run/postgresql -p $NATIVE_PG_PORT -tAc \"SELECT 1 FROM pg_database WHERE datname='ddia_test'\"" \
    | grep -q 1 \
    || su postgres -s /bin/bash -c \
    "psql -h /var/run/postgresql -p $NATIVE_PG_PORT -c \"CREATE DATABASE ddia_test OWNER ddia\""
}

_native_db_down() {
  if ! command -v pg_ctlcluster >/dev/null 2>&1; then
    return
  fi
  local ver
  ver=$(_native_pg_version)
  if pg_lsclusters | awk '{print $2}' | grep -qx "$NATIVE_PG_CLUSTER"; then
    pg_ctlcluster "$ver" "$NATIVE_PG_CLUSTER" stop || true
  fi
}

test_db_up() {
  if [ "${USE_NATIVE_POSTGRES:-}" = "1" ]; then
    _native_db_up
  else
    _docker_db_up
  fi
}

test_db_down() {
  if [ "${USE_NATIVE_POSTGRES:-}" = "1" ]; then
    _native_db_down
  else
    _docker_db_down
  fi
}

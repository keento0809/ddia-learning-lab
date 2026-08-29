#!/bin/bash
# T-707: Claude Codeのクラウド実行環境(CLAUDE_CODE_REMOTE=true)ではegressプロキシが
# Docker Hub由来のイメージ取得を許可していないため、docker-compose.test.yml経由の
# postgres-testが`docker compose up`のイメージpullで失敗する(組織のegressポリシー
# によるものでこのリポジトリの問題ではない)。ローカル開発環境(CLAUDE_CODE_REMOTE
# 未設定)ではDockerが正常に使えるため、ここでは一切何もしない。
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! command -v psql >/dev/null 2>&1 || ! command -v pg_createcluster >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y postgresql
fi

echo 'export USE_NATIVE_POSTGRES=1' >> "$CLAUDE_ENV_FILE"

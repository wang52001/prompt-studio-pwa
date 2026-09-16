#!/usr/bin/env bash
# 一键部署到 Cloudflare Pages（直传，无构建步骤）
#
# 用法：
#   ./tools/deploy.sh                       # 读项目根 .cf_token（已 gitignore）
#   CLOUDFLARE_API_TOKEN=xxx ./tools/deploy.sh
#   CF_ACCOUNT_ID=xxx ./tools/deploy.sh     # 覆盖默认账户
#
# 说明：环境里的 HTTP 代理会劫持 Cloudflare API，必须先清掉。
set -euo pipefail
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="prompt-studio-pwa"
NODE="/Users/wjw/.workbuddy/binaries/node/versions/22.22.2-2/bin/node"
WRANGLER="/Users/wjw/.workbuddy/binaries/node/workspace/node_modules/.bin/wrangler"

cd "$ROOT"

# 凭据：优先环境变量，其次项目根的 .cf_token
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" && -f .cf_token ]]; then
  CLOUDFLARE_API_TOKEN="$(tr -d '[:space:]' < .cf_token)"
fi
: "${CLOUDFLARE_API_TOKEN:?缺少 CLOUDFLARE_API_TOKEN（可用环境变量传入，或在项目根放一个 .cf_token 文件）}"

export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID="${CF_ACCOUNT_ID:-0bd1c630df5e907adf68b09c0ca6b2f0}"

echo "▶ 部署 $PROJECT → Cloudflare Pages"
exec "$NODE" "$WRANGLER" pages deploy . --project-name="$PROJECT"

#!/usr/bin/env bash
# 全自动部署 prompt-studio-pwa 到 Cloudflare Pages，并绑定 pwa.jdhsf.top
# 用法：CF_API_TOKEN=<你的token> ./tools/deploy_cf.sh
set -euo pipefail

# 环境里的 HTTP 代理会劫持 Cloudflare API / wrangler 请求，必须清掉
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="prompt-studio-pwa"
DOMAIN="pwa.jdhsf.top"
APEX="jdhsf.top"
API="https://api.cloudflare.com/client/v4"
WRANGLER="/Users/wjw/.workbuddy/binaries/node/workspace/node_modules/.bin/wrangler"
NODE="/Users/wjw/.workbuddy/binaries/node/versions/22.22.2-2/bin/node"
PY="/Users/wjw/.workbuddy/binaries/python/envs/default/bin/python"

: "${CF_API_TOKEN:?请先 export CF_API_TOKEN=<Cloudflare API Token>}"
AUTH="Authorization: Bearer ${CF_API_TOKEN}"

jget() { curl -s "$@" -H "$AUTH" -H "Content-Type: application/json"; }
jq1()  { "$PY" -c "import sys,json;d=json.load(sys.stdin);${1}"; }

echo "▶ 校验 Token"
whoami=$(jget "$API/user/tokens/verify")
echo "$whoami" | jq1 "print('  状态:', d['success'], '| expires:', d['result'].get('expires_on','永不过期'))"

echo "▶ 获取 Zone ($APEX)"
ZONE_ID=$(jget "$API/zones?name=$APEX" | jq1 "print(d['result'][0]['id'])")
echo "  Zone: $ZONE_ID"

echo "▶ 获取 Account"
# 注意：部分 Account 级受限的 Token 调 /accounts 会返回空列表，
# 此时改从 Zone 详情的 account 字段反查（实测可用）
if [[ -z "${CF_ACCOUNT_ID:-}" ]]; then
  CF_ACCOUNT_ID=$(jget "$API/zones/$ZONE_ID" | jq1 "print(d['result']['account']['id'])")
fi
if [[ -z "$CF_ACCOUNT_ID" ]]; then
  CF_ACCOUNT_ID=$(jget "$API/accounts" | jq1 "print(d['result'][0]['id'] if d['result'] else '')")
fi
[[ -n "$CF_ACCOUNT_ID" ]] || { echo "✗ 取不到 Account ID"; exit 1; }
echo "  Account: $CF_ACCOUNT_ID"

echo "▶ 清理可能冲突的旧 DNS 记录 ($DOMAIN)"
existing=$(jget "$API/zones/$ZONE_ID/dns_records?type=CNAME&name=$DOMAIN")
ids=$(echo "$existing" | jq1 "
import json
print(' '.join(r['id'] for r in d['result']))")
for id in $ids; do
  echo "  删除 DNS 记录 $id"
  curl -s -X DELETE "$API/zones/$ZONE_ID/dns_records/$id" -H "$AUTH" >/dev/null
done

echo "▶ 部署到 Cloudflare Pages (Direct Upload)"
export CLOUDFLARE_API_TOKEN="$CF_API_TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID"
cd "$ROOT"
"$NODE" "$WRANGLER" pages deploy . --project-name="$PROJECT" 2>&1 | tail -12

echo "▶ 绑定自定义域 $DOMAIN"
add=$(jget -X POST "$API/accounts/$CF_ACCOUNT_ID/pages/projects/$PROJECT/domains" \
  --data "{\"name\":\"$DOMAIN\"}")
echo "$add" | jq1 "print('  success:', d['success'])" || echo "$add"

echo "▶ 等待证书签发"
for i in $(seq 1 30); do
  st=$(jget "$API/accounts/$CF_ACCOUNT_ID/pages/projects/$PROJECT/domains" |
       jq1 "
r=[x for x in d['result'] if x['name']=='$DOMAIN']
print(r[0]['status'] if r and r[0].get('status')!='active' else 'active' if r else 'none')")
  echo "  [$i] $st"
  [[ "$st" == "active" ]] && break
  sleep 10
done

echo "▶ 最终校验"
dns=$(dig +short CNAME "$DOMAIN" @1.1.1.1 2>/dev/null || echo "未生效")
echo "  DNS CNAME: $dns"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "https://$DOMAIN/" || echo "000")
echo "  HTTPS GET / -> $code"
echo "  Service Worker: $(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN/sw.js")"
echo "✅ 完成：https://$DOMAIN"

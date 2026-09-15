#!/usr/bin/env bash
# 给 PromptOps 绑定独立域名 ops.jdhsf.top（部署由 deploy_cf.sh 完成，本脚本只管 DNS + 域名绑定）
set -euo pipefail
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy

: "${CF_API_TOKEN:?请先 export CF_API_TOKEN=<Cloudflare API Token>}"
API="https://api.cloudflare.com/client/v4"
AUTH="Authorization: Bearer ${CF_API_TOKEN}"
PROJECT="prompt-studio-pwa"
APEX="jdhsf.top"
DOMAIN="ops.jdhsf.top"
PY="/Users/wjw/.workbuddy/binaries/python/envs/default/bin/python"

jget() { curl -s "$@" -H "$AUTH" -H "Content-Type: application/json"; }
jq1()  { "$PY" -c "import sys,json;d=json.load(sys.stdin);${1}"; }

ZONE_ID=$(jget "$API/zones?name=$APEX" | jq1 "print(d['result'][0]['id'])")
CF_ACCOUNT_ID=$(jget "$API/zones/$ZONE_ID" | jq1 "print(d['result']['account']['id'])")
echo "  Zone: $ZONE_ID  Account: $CF_ACCOUNT_ID"

existing=$(jget "$API/zones/$ZONE_ID/dns_records?type=CNAME&name=$DOMAIN")
ids=$(echo "$existing" | jq1 "print(' '.join(r['id'] for r in d['result']))")
if [[ -n "$ids" ]]; then
  echo "  CNAME 已存在，跳过创建"
else
  jget -X POST "$API/zones/$ZONE_ID/dns_records" \
    --data "{\"type\":\"CNAME\",\"name\":\"$DOMAIN\",\"content\":\"$PROJECT.pages.dev\",\"proxied\":true,\"ttl\":1}" \
    | jq1 "print('  创建 CNAME ->', d['success'])"
fi

echo "▶ 绑定自定义域 $DOMAIN"
jget -X POST "$API/accounts/$CF_ACCOUNT_ID/pages/projects/$PROJECT/domains" \
  --data "{\"name\":\"$DOMAIN\"}" | jq1 "print('  success:', d['success'], d.get('errors',''))"

echo "▶ 等待证书签发"
for i in $(seq 1 24); do
  st=$(jget "$API/accounts/$CF_ACCOUNT_ID/pages/projects/$PROJECT/domains" |
       jq1 "
r=[x for x in d['result'] if x['name']=='$DOMAIN']
print(r[0]['status'] if r and r[0].get('status')!='active' else 'active' if r else 'none')")
  echo "  [$i] $st"
  [[ "$st" == "active" ]] && break
  sleep 10
done

echo "▶ 校验"
echo "  ops   首页: $(curl -s -o /dev/null -w '%{http_code}' --max-time 25 https://$DOMAIN/)"
echo "  ops   API : $(curl -s --max-time 25 https://$DOMAIN/opsapi/auth/me)"
echo "  主域 首页 : $(curl -s -o /dev/null -w '%{http_code}' --max-time 25 https://pwa.jdhsf.top/)"
echo "✅ 完成：https://$DOMAIN"

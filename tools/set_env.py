#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""读取 Cloudflare Pages 项目的 deployment_configs，合并写入环境变量（Secret），
不覆盖已有的 D1 / 其他绑定。"""
import json, os, sys, urllib.request

TOKEN = os.environ.get("CF_API_TOKEN", "").strip()
KEY = os.environ.get("DASHSCOPE_API_KEY", "").strip()
ACCOUNT = os.environ.get("CF_ACCOUNT_ID", "").strip()
PROJECT = os.environ.get("CF_PROJECT", "prompt-studio-pwa").strip()

for name, val in (("CF_API_TOKEN", TOKEN), ("DASHSCOPE_API_KEY", KEY), ("CF_ACCOUNT_ID", ACCOUNT)):
    if not val:
        print("缺少环境变量:", name)
        sys.exit(1)

API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/pages/projects/{PROJECT}"
HDR = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def req(method, url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(url, data=data, headers=HDR, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode() or "{}")


cur = req("GET", API)
if not cur.get("success"):
    print("读取项目失败:", json.dumps(cur, ensure_ascii=False)[:400])
    sys.exit(1)

cfgs = (cur["result"].get("deployment_configs") or {})
for env in ("production", "preview"):
    cfg = cfgs.setdefault(env, {})
    cfg.setdefault("env_vars", {})["DASHSCOPE_API_KEY"] = {"value": KEY, "type": "secret"}
    cfg.setdefault("compatibility_date", "2024-11-01")

res = req("PATCH", API, {"deployment_configs": cfgs})
print("success:", res.get("success"))
if res.get("success"):
    out = res["result"].get("deployment_configs", {})
    for env in ("production", "preview"):
        c = out.get(env, {})
        print(f"  [{env}] env_vars={list((c.get('env_vars') or {}).keys())} "
              f"d1={list((c.get('d1_databases') or {}).keys())}")
else:
    print(json.dumps(res.get("errors"), ensure_ascii=False)[:600])
    sys.exit(1)

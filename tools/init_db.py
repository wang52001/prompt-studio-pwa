#!/usr/bin/env python3
"""初始化 / 重建 D1 数据库表结构。

用法：
    CF_API_TOKEN=xxx CF_ACCOUNT_ID=xxx CF_D1_ID=xxx \
    /Users/wjw/.workbuddy/binaries/python/envs/default/bin/python tools/init_db.py

不传 CF_D1_ID 时会自动查找名为 prompt-studio-db 的库。
"""
import json
import os
import re
import sys
import urllib.request

API = "https://api.cloudflare.com/client/v4"
TOKEN = os.environ.get("CF_API_TOKEN")
ACCOUNT = os.environ.get("CF_ACCOUNT_ID")
DB_ID = os.environ.get("CF_D1_ID")
DEFAULT_DB_NAME = "prompt-studio-db"

if not TOKEN or not ACCOUNT:
    sys.exit("需要 CF_API_TOKEN 和 CF_ACCOUNT_ID 环境变量")


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        API + path, data=data, method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.load(resp)


def find_db():
    for db in req("GET", f"/accounts/{ACCOUNT}/d1/database")["result"]:
        if db["name"] == DEFAULT_DB_NAME:
            return db["uuid"]
    sys.exit(f"找不到名为 {DEFAULT_DB_NAME} 的数据库")


DB_ID = DB_ID or find_db()
print(f"目标数据库: {DB_ID}")

sql_text = open(os.path.join(os.path.dirname(__file__), "schema.sql"), encoding="utf-8").read()
sql_text = re.sub(r"--[^\n]*", "", sql_text)          # 去掉注释
statements = [s.strip() for s in sql_text.split(";") if s.strip()]

ok = fail = 0
for s in statements:
    first = " ".join(s.split())[:64]
    try:
        req("POST", f"/accounts/{ACCOUNT}/d1/database/{DB_ID}/query", {"sql": s})
        print(f"  ✅ {first}")
        ok += 1
    except Exception as e:                              # noqa: BLE001
        print(f"  ❌ {first}\n     {e}")
        fail += 1

print(f"\n建表完成：成功 {ok} 条，失败 {fail} 条")

tables = req("POST", f"/accounts/{ACCOUNT}/d1/database/{DB_ID}/query",
             {"sql": "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"})["result"][0]
print("现有表:", ", ".join(r["name"] for r in tables["results"]))

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""D1 命令行查询器（开发/运维用）
用法：
  export CLOUDFLARE_API_TOKEN=<token>          # 必填
  export CLOUDFLARE_ACCOUNT_ID=<account>       # 选填，默认已填本项目账号

  python3 tools/d1.py "SELECT id, email FROM users LIMIT 5"
  python3 tools/d1.py "DELETE FROM sessions WHERE expires_at < datetime('now')" --write

注意：wrangler 的 --file 模式只回汇总信息、拿不到 SELECT 结果行，
      所以查数据必须用 --command（本脚本已处理）。
"""
import json
import os
import subprocess
import sys

NODE = '/Users/wjw/.workbuddy/binaries/node/versions/22.22.2-2/bin/node'
WRANGLER = '/Users/wjw/.workbuddy/binaries/node/workspace/node_modules/.bin/wrangler'
CWD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ENV = dict(os.environ)
ENV.setdefault('CLOUDFLARE_ACCOUNT_ID', '0bd1c630df5e907adf68b09c0ca6b2f0')
if not ENV.get('CLOUDFLARE_API_TOKEN'):
    sys.exit('请先 export CLOUDFLARE_API_TOKEN=<Cloudflare API Token>')
# 环境里的 HTTP 代理会劫持 Cloudflare API，必须清掉
for k in ('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'):
    ENV.pop(k, None)


def run(sql):
    p = subprocess.run(
        [NODE, WRANGLER, 'd1', 'execute', 'prompt-studio-db', '--remote',
         '--json', '--command', sql],
        capture_output=True, text=True, env=ENV, cwd=CWD)
    if p.returncode != 0:
        print(p.stdout[-1500:], p.stderr[-1500:])
        sys.exit(1)
    out = p.stdout
    i = out.find('[')          # wrangler --json 会在 JSON 前打进度行
    return json.loads(out[i:])[0]['results'] if i >= 0 else []


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--write']
    write = '--write' in sys.argv
    sql = ' '.join(args)
    if not sql:
        sys.exit('缺少 SQL')
    if write and not sql.strip().lower().startswith(('delete', 'update', 'insert')):
        sys.exit('--write 只允许 DELETE / UPDATE / INSERT')
    print(json.dumps(run(sql), ensure_ascii=False, indent=1))

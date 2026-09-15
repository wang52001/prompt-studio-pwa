#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""线上接口全量回归：乐园 / 社区 / 成就 / 设置 / 积分 / 批量 / 导出
用法：python3 tools/regress_api.py
"""
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = 'https://pwa.jdhsf.top/api'
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36')
EMAIL = 'smoke1@jdhsf.top'

NODE = '/Users/wjw/.workbuddy/binaries/node/versions/22.22.2-2/bin/node'
WRANGLER = '/Users/wjw/.workbuddy/binaries/node/workspace/node_modules/.bin/wrangler'
CWD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = dict(os.environ)
# 凭证一律从环境变量读取，避免把 Token 提交进仓库（GitHub Push Protection 会拦截）
ENV.setdefault('CLOUDFLARE_ACCOUNT_ID', '0bd1c630df5e907adf68b09c0ca6b2f0')
if not ENV.get('CLOUDFLARE_API_TOKEN'):
    sys.exit('请先 export CLOUDFLARE_API_TOKEN=<Cloudflare API Token>')
for k in ('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'):
    ENV.pop(k, None)

COOKIE = None
PASS, FAIL = [], []


def d1(sql):
    """读 D1。注意：wrangler 的 --file 模式只回汇总信息、拿不到 SELECT 结果，
    必须用 --command 才会返回真实行。"""
    p = subprocess.run(
        [NODE, WRANGLER, 'd1', 'execute', 'prompt-studio-db', '--remote',
         '--json', '--command', sql],
        capture_output=True, text=True, env=ENV, cwd=CWD)
    if p.returncode != 0:
        return []
    # wrangler --json 仍会往 stdout 打进度行，必须先截到第一个 '[' 再解析
    out = p.stdout
    i = out.find('[')
    if i < 0:
        return []
    try:
        data = json.loads(out[i:])
        return data[0]['results']
    except Exception:
        return []


def req(path, method='GET', body=None):
    global COOKIE
    # 路径里可能带中文，必须做百分号编码
    url = f'{BASE}/' + urllib.parse.quote(path, safe="/?&=%")
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header('User-Agent', UA)
    r.add_header('Content-Type', 'application/json')
    if COOKIE:
        r.add_header('Cookie', COOKIE)
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            raw = resp.read().decode('utf-8')
            sc = resp.headers.get_all('Set-Cookie') or []
            for c in sc:
                COOKIE = c.split(';')[0]
            try:
                return resp.status, json.loads(raw)
            except Exception:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'ignore')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def check(name, cond, extra=''):
    (PASS if cond else FAIL).append(name)
    print(('  ✓ ' if cond else '  ✗ ') + name + (f'  {extra}' if extra and not cond else ''))


def login():
    st, r = req('auth/send-code', 'POST', {'email': EMAIL, 'nickname': '回归测试'})
    if st != 200:
        print('发送验证码失败', st, r)
        sys.exit(1)
    time.sleep(2)
    rows = d1(f"SELECT salt, code_hash FROM email_codes WHERE email='{EMAIL}' "
              f"AND consumed=0 ORDER BY id DESC LIMIT 1")
    if not rows:
        print('未取到验证码记录')
        sys.exit(1)
    salt, ch = rows[0]['salt'], rows[0]['code_hash']
    code = None
    for i in range(1000000):
        if hashlib.sha256((salt + str(i).zfill(6)).encode()).hexdigest() == ch:
            code = str(i).zfill(6)
            break
    if not code:
        print('验证码爆破失败')
        sys.exit(1)
    st, r = req('auth/verify-code', 'POST', {'email': EMAIL, 'code': code})
    if st != 200:
        print('登录失败', st, r)
        sys.exit(1)
    print(f'  登录成功：{EMAIL}  ({r.get("user", {}).get("nickname")})')


def main():
    print('▶ 登录')
    login()

    print('▶ 乐园')
    st, r = req('playground/gacha')
    check('扭蛋记录 GET', st == 200 and 'logs' in r, str(r)[:120])
    st, r = req('playground/bingo')
    check('Bingo GET', st == 200 and 'cells' in r, str(r)[:120])
    st, r = req('playground/arena/board')
    check('竞技场排行榜', st == 200 and 'board' in r and 'mine' in r, str(r)[:120])
    st, r = req('playground/arena/history')
    check('竞技场历史', st == 200 and 'logs' in r, str(r)[:120])

    print('▶ 沙雕生成器')
    st, r = req('silly')
    check('沙雕词库/热门 GET', st == 200 and len(r.get('slots', [])) == 3, str(r)[:120])
    silly_body = '让兵马俑用 OKR 汇报本季度产能（回归 %d）' % int(time.time())
    st, r = req('silly', 'POST', {'body': silly_body})
    check('沙雕发布 POST', st == 200 and r.get('ok'), str(r)[:120])
    st, r = req('silly')
    sid = next((p['id'] for p in (r.get('hot') or []) + (r.get('mine') or [])
                if p.get('body') == silly_body), None)
    if sid:
        st, r = req('silly/like', 'POST', {'id': sid})
        check('沙雕点赞', st == 200 and r.get('ok'), str(r)[:120])
        st, r = req('silly/like', 'POST', {'id': sid})
        check('重复点赞被拒', st != 200, str(r)[:120])
    else:
        check('沙雕点赞', False, '没拿到 post id')
        check('重复点赞被拒', False, '没拿到 post id')

    print('▶ 成就徽章')
    st, r = req('badges')
    check('徽章列表', st == 200 and r.get('total', 0) >= 19, str(r)[:120])
    check('首次登录徽章已解锁', 'first_login' in [b['id'] for b in r.get('badges', []) if b['unlocked']],
          str([b['id'] for b in r.get('badges', []) if b['unlocked']]))

    print('▶ 锦鲤 / 打卡')
    st, r = req('koi')
    check('锦鲤 GET', st == 200 and r.get('card'), str(r)[:120])
    st, r = req('checkin', 'POST', {})
    ok_checkin = st == 200 or (st == 400 and '已经打过卡' in str(r))
    check('打卡 POST', ok_checkin, str(r)[:120])
    st, r = req('koi')
    check('打卡日历', st == 200 and 'calendar' in r, str(r)[:120])

    print('▶ 翻车现场墙')
    st, r = req('fails?sort=new')
    check('翻车列表', st == 200 and 'posts' in r, str(r)[:120])
    fail_prompt = '（回归%d）画一只猫' % int(time.time())
    st, r = req('fails', 'POST', {
        'prompt': fail_prompt,
        'result': '（回归）输出了一只六条腿的不明生物',
        'remark': '回归测试'
    })
    check('翻车投稿', st == 200 and r.get('ok'), str(r)[:120])
    st, r = req('fails?sort=new')
    fid = next((p['id'] for p in r.get('posts', []) if p.get('prompt') == fail_prompt), None)
    if fid:
        st, r = req('fails/like', 'POST', {'id': fid})
        check('翻车点赞', st == 200 and r.get('ok'), str(r)[:120])
    else:
        check('翻车点赞', False, '没拿到 id')
    st, r = req('fails?sort=hot_week')
    check('翻车最热（本周）', st == 200 and 'posts' in r, str(r)[:120])

    print('▶ 社区广场')
    st, r = req('community?sort=new')
    check('社区列表', st == 200 and 'posts' in r, str(r)[:120])
    title = '（回归）批量测试社区作品 ' + str(int(time.time()))
    st, r = req('community', 'POST', {
        'title': title, 'content': '这是一条回归测试用的完整 Prompt 内容。',
        'tags': '回归,测试', 'effect': '用于验证后端'
    })
    check('社区发布', st == 200 and r.get('ok'), str(r)[:120])
    st, r = req('community?sort=new')
    pid = next((p['id'] for p in r.get('posts', []) if p['title'] == title), None)
    if pid:
        st, r = req('community/like', 'POST', {'id': pid})
        check('社区点赞', st == 200 and r.get('ok'), str(r)[:120])
        st, r = req('community/fav', 'POST', {'id': pid})
        check('社区收藏', st == 200 and r.get('faved') is True, str(r)[:120])
        st, r = req('community/fav', 'POST', {'id': pid})
        check('取消收藏', st == 200 and r.get('faved') is False, str(r)[:120])
        st, r = req('community/comments', 'POST', {'post_id': pid, 'content': '回归评论'})
        check('发表评论', st == 200 and r.get('ok'), str(r)[:120])
        st, r = req(f'community/comments?post_id={pid}')
        check('评论列表', st == 200 and any(c['content'] == '回归评论' for c in r.get('comments', [])),
              str(r)[:120])
        st, r = req('community?sort=new&q=' + title[:8])
        check('社区搜索', st == 200 and any(p['id'] == pid for p in r.get('posts', [])), str(r)[:120])
    else:
        for n in ['社区点赞', '社区收藏', '取消收藏', '发表评论', '评论列表', '社区搜索']:
            check(n, False, '没拿到 post id')

    print('▶ 灵感值')
    st, r = req('credits')
    check('灵感值流水', st == 200 and 'logs' in r and len(r['logs']) > 0, str(r)[:120])
    check('流水含「发布社区作品」',
          any('发布社区作品' in (l.get('reason') or '') for l in r.get('logs', [])),
          str([l.get('reason') for l in r.get('logs', [])])[:160])

    print('▶ 设置')
    st, r = req('settings')
    check('设置 GET', st == 200 and 'settings' in r, str(r)[:120])
    st, r = req('settings', 'PUT', {'font_size': 'large', 'notify': 1})
    check('设置 PUT', st == 200 and r.get('ok'), str(r)[:120])
    st, r = req('settings')
    check('设置已持久化', r.get('settings', {}).get('font_size') == 'large', str(r)[:160])

    print('▶ 批量测试')
    st, r = req('batch')
    check('批量历史 GET', st == 200 and 'runs' in r, str(r)[:120])
    st, r = req('batch/run', 'POST', {
        'name': '回归测试',
        'versions': [
            {'label': 'V1', 'system': '你是文案。', 'user': '为 ${product} 写一句广告语。'},
            {'label': 'V2', 'system': '你是资深文案。', 'user': '为 ${product} 写一句 20 字内广告语。'}
        ],
        'variables': {'product': ['保温杯'], 'style': ['幽默']}
    })
    # 没有可用密钥时应当返回 400 且带明确提示，也算「后端在工作」
    check('批量测试调用', st == 200 or (st == 400 and '密钥' in str(r)), str(r)[:160])
    if st == 200:
        check('批量结果有评分', len(r.get('results', [])) > 0, str(r)[:160])
    else:
        print(f'     （跳过评分检查：{r}）')

    print('▶ 数据导出')
    st, r = req('export')
    check('数据导出', st == 200 and 'prompts' in r and 'badges' in r, str(r)[:120])

    print('▶ 统计')
    st, r = req('stats')
    check('统计 GET', st == 200 and 'totals' in r, str(r)[:120])

    print()
    print(f'通过 {len(PASS)} / {len(PASS) + len(FAIL)}')
    if FAIL:
        print('失败项：')
        for f in FAIL:
            print('  - ' + f)
        sys.exit(1)


if __name__ == '__main__':
    main()

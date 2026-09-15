#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""浏览器端回归：确认每个新页面都能从后端拿到数据并渲染出来
用法：python3 tools/ui_regress.py
"""
import asyncio
import os
import sys

sys.path.insert(0, '/Users/wjw/.workbuddy/binaries/python/envs/default/lib/python3.13/site-packages')
from playwright.async_api import async_playwright  # noqa: E402

CHROME = ('/Users/wjw/Library/Caches/ms-playwright/chromium-1234/'
          'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
BASE = 'https://pwa.jdhsf.top'
EMAIL = 'ui-regress@jdhsf.top'   # 与接口回归分开，避免撞每小时发信上限

PASS, FAIL = [], []


def check(name, cond, extra=''):
    (PASS if cond else FAIL).append(name)
    print(('  ✓ ' if cond else '  ✗ ') + name + (f'   {extra}' if extra and not cond else ''))


async def main():
    import hashlib
    import subprocess

    # 取验证码
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from regress_api import d1, req as api_req  # noqa

    api_req('auth/send-code', 'POST', {'email': EMAIL, 'nickname': '回归测试'})
    await asyncio.sleep(2)
    rows = d1(f"SELECT salt, code_hash FROM email_codes WHERE email='{EMAIL}' "
              f"AND consumed=0 ORDER BY id DESC LIMIT 1")
    code = None
    for i in range(1000000):
        if hashlib.sha256((rows[0]['salt'] + str(i).zfill(6)).encode()).hexdigest() == rows[0]['code_hash']:
            code = str(i).zfill(6)
            break
    print(f'  验证码 {code}')

    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, headless=True)
        ctx = await browser.new_context(viewport={'width': 390, 'height': 844})
        page = await ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        await page.goto(BASE, wait_until='networkidle')
        await page.fill('#authEmail', EMAIL)
        await page.fill('#authCode', code)
        await page.click('#authSubmit')
        await page.wait_for_selector('.screen.active[data-screen="workbench"]', timeout=25000)
        print('  ✓ 登录进入工作台')

        async def dismiss():
            """新用户会被「设置密码」等浮层挡住点击，交互前先关掉"""
            for _ in range(3):
                if not await page.query_selector('#overlay.show'):
                    return
                btn = await page.query_selector('#overlay [data-close]')
                if not btn:
                    return
                await btn.click()
                await page.wait_for_timeout(400)

        await dismiss()

        async def visit(screen, sel, label, wait=2500):
            await page.evaluate(f"location.hash = '#/{screen}'")
            try:
                await page.wait_for_selector(f'.screen.active[data-screen="{screen}"]', timeout=8000)
            except Exception as e:
                check(label, False, f'页面未激活 {e}')
                return None
            await page.wait_for_timeout(wait)
            el = await page.query_selector(sel)
            txt = (await el.inner_text()).strip() if el else ''
            return txt

        # 沙雕生成器
        t = await visit('silly', '#sillyResult', '沙雕-合成 Prompt')
        check('沙雕-合成 Prompt', bool(t) and t.startswith('请让') and '（词库加载中）' not in t, str(t)[:80])

        t = await visit('silly', '#sillyHot', '沙雕-热门列表')
        check('沙雕-热门列表', bool(t) and '加载中' not in t and t != '', str(t)[:80])

        # 成就徽章
        t = await visit('badges', '#badgeSummary', '徽章-进度')
        check('徽章-进度', '已解锁' in t and '/ 19' in t or '已解锁' in t, str(t)[:80])
        t = await visit('badges', '#badgeGrid', '徽章-列表')
        check('徽章-列表', '初出茅庐' in t, str(t)[:80])

        # 锦鲤
        t = await visit('koi', '#koiCard', '锦鲤-今日卡片')
        check('锦鲤-今日卡片', '加载中' not in t and len(t) > 10, str(t)[:80])
        t = await visit('koi', '#koiCalendar', '锦鲤-打卡日历')
        check('锦鲤-打卡日历', t.replace('\n', '').strip() != '' and '加载中' not in t, str(t)[:80])

        # 翻车墙
        t = await visit('failwall', '#failList', '翻车-列表')
        check('翻车-列表', '加载中' not in t and '加载失败' not in t and len(t) > 5, str(t)[:80])

        # 社区
        t = await visit('community', '#communityList', '社区-列表')
        check('社区-列表', '加载中' not in t and '加载失败' not in t and len(t) > 5, str(t)[:80])

        # 灵感值流水
        t = await visit('credits', '#creditsBalance', '积分-余额')
        check('积分-余额', t.strip() != '' and t != '—', str(t)[:40])
        t = await visit('credits', '#creditsList', '积分-流水明细')
        check('积分-流水明细', '加载中' not in t and len(t) > 5, str(t)[:80])

        # 设置
        t = await visit('settings', '#fontTabs', '设置-字体档位')
        check('设置-字体档位', '小' in t and '中' in t and '大' in t, str(t)[:40])

        # 竞技场排行榜弹层
        await page.evaluate("location.hash = '#/arena'")
        await page.wait_for_selector('.screen.active[data-screen="arena"]', timeout=8000)
        await page.wait_for_timeout(800)
        await dismiss()
        ov = await page.query_selector('#overlay.show')
        if ov:
            print('  ⚠ 浮层内容：' + (await ov.inner_text()).replace('\n', ' ')[:120])
        await page.click('[data-action="arena-board"]')
        await page.wait_for_timeout(1500)
        sheet = await page.query_selector('#overlay .sheet')
        stxt = (await sheet.inner_text()) if sheet else ''
        check('竞技场-排行榜弹层', '排行榜 TOP 10' in stxt, str(stxt)[:100])
        await page.click('#overlay [data-close]')

        # 批量测试页
        t = await visit('batchtest', '#btResult', '批量测试-页面')
        check('批量测试-页面', bool(t), str(t)[:60])

        # 翻车投稿弹层
        await page.evaluate("location.hash = '#/failwall'")
        await page.wait_for_selector('.screen.active[data-screen="failwall"]', timeout=8000)
        await dismiss()
        await page.click('[data-action="fail-submit"]')
        await page.wait_for_timeout(600)
        has = await page.query_selector('#fsPrompt')
        check('翻车-投稿弹层', has is not None)

        check('无 JS 运行时报错', not errors, str(errors[:3]))

        await browser.close()

    print()
    print(f'通过 {len(PASS)} / {len(PASS) + len(FAIL)}')
    if FAIL:
        print('失败项：')
        for f in FAIL:
            print('  - ' + f)
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())

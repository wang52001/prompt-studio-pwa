#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""初始化静态内容：沙雕词库 / 徽章定义 / 锦鲤卡池 / 示例社区与翻车帖
用法：python3 tools/seed_content.py           # 本地
      python3 tools/seed_content.py --remote  # 线上
"""
import os
import subprocess
import sys

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

REMOTE = '--remote' in sys.argv

# 沙雕词库：0 主体 / 1 任务 / 2 风格
SUBJECTS = [
    '一只会用 Excel 的橘猫', '刚学会上网的秦始皇', '在便利店上夜班的哲学系毕业生',
    '沉迷拼多多的中世纪骑士', '退休后开始做播客的狼人', '一只患有拖延症的章鱼',
    '从 2077 年穿越来的产品经理', '只会做番茄炒蛋的米其林主厨', '把《史记》背下来的初中生',
    '兼职算命的程序员', '每天写日报的李白', '立志成为rapper的数学老师',
    '养了三只柯基的黑客', '开了十年出租车的诗人', '刚下载社交软件的兵马俑',
    '天天加班的貔貅', '想转行做自媒体的门卫大爷', '精通八国语言的鹦鹉',
]
TASKS = [
    '用公文格式写辞职信', '写一份让老板无法拒绝的加薪申请', '给外星人介绍地球美食',
    '用三句话解释清楚区块链', '把这段代码改成能跑的样子', '策划一场零预算的发布会',
    '给小区流浪猫写竞选宣言', '写一份相亲自我介绍', '把说明书改写成悬疑小说开头',
    '为一款不存在的 App 写商店介绍', '用五言律诗汇报本周工作', '给十年后的自己发一封邮件',
    '把家庭群谣言改写成学术摘要', '设计一套公司团建惩罚制度', '给冰箱里的剩菜写悼词',
    '写一份拒绝周末加班的请假条', '把租房合同纠纷改编成脱口秀段子', '用刑法条文吐槽地铁拥挤',
]
STYLES = [
    '参考王家卫电影风格', '像鲁迅先生那样冷峻', '用小学生日记的天真口吻',
    '模仿小红书爆款文案', '写成网易云热评', '用《甄嬛传》的宫斗腔',
    '像刑侦笔录一样克制', '用脱口秀演员的节奏', '模仿知乎高赞长回答',
    '用民国月份牌上的广告腔', '像相声里的捧哏', '用科幻小说的硬核设定',
    '模仿淘宝客服的温柔语气', '用新闻联播的庄重腔调', '像说唱歌词的押韵flow',
    '用武侠小说的江湖气', '像幼儿园老师讲故事', '模仿法律条文的严谨措辞',
]

# 徽章定义：id / 名称 / 分类 / 解锁条件描述
BADGES = [
    ('first_login', '初出茅庐', '成长', '完成注册并登录', 0),
    ('prompt_5', '小试牛刀', '成长', '累计创建 5 条提示词', 0),
    ('prompt_20', '提示词工匠', '成长', '累计创建 20 条提示词', 0),
    ('call_50', 'AI 常客', '成长', '累计 AI 调用 50 次', 0),
    ('checkin_7', '连续打卡 7 天', '成长', '连续打卡 7 天', 0),
    ('checkin_30', '月月全勤', '成长', '连续打卡 30 天', 1),
    ('gacha_20', '扭蛋达人', '趣味', '累计抽扭蛋 20 次', 0),
    ('gacha_legend', '欧皇附体', '趣味', '抽到 1 次传说级', 1),
    ('silly_10', '沙雕艺术家', '趣味', '创作 10 条沙雕 prompt', 0),
    ('koi_30', '锦鲤王', '趣味', '累计翻开 30 次锦鲤', 1),
    ('fail_5', '翻车收藏家', '趣味', '投稿 5 条翻车现场', 0),
    ('arena_1', '初战告捷', '竞技', '竞技场赢下第 1 局', 0),
    ('arena_10', '十连胜', '竞技', '竞技场累计赢 10 局', 0),
    ('arena_season', '赛季王者', '竞技', '单赛季积分进入前 3', 1),
    ('bingo_line', '一线牵', '限定', 'Bingo 连成 1 条线', 0),
    ('bingo_full', 'Bingo 大师', '限定', 'Bingo 完成整张卡', 1),
    ('community_1', '乐于分享', '限定', '发布 1 篇社区 prompt', 0),
    ('community_100', '社区红人', '限定', '社区作品累计获 100 赞', 1),
    ('key_owner', '自给自足', '限定', '添加并使用自己的 API 密钥', 0),
]

KOI = [
    ('请扮演一位阅尽千帆的深夜电台主播，用三句话安慰今天加班到现在的我。',
     '上上签：今天写的 prompt 都会一次通过', None, 'default'),
    ('你是一位擅长打比方的物理老师，请用厨房里的东西讲明白量子纠缠。',
     '上签：今天适合啃硬骨头', None, 'default'),
    ('请以一位退休老木匠的口吻，讲讲做事情为什么要留三分余地。',
     '上签：慢一点反而更快', None, 'default'),
    ('请化身为一位毒舌但靠谱的产品经理，用三句话指出我这份需求最大的问题。',
     '中签：有人会给你一针见血的反馈', None, 'default'),
    ('你是一只会说话的猫，请用猫的视角解释为什么人类要开那么多会。',
     '上签：换个角度，问题就小了', None, 'default'),
    ('请把「今天不想上班」这句话，改写成八种不同文学流派的版本。',
     '上上签：灵感会在你放松时出现', None, 'default'),
    ('请扮演一位 2077 年的档案管理员，为今天这个时代写一段 200 字的脚注。',
     '中签：你会想起一件很重要的事', None, 'default'),
    ('你是一位开在巷子里的面馆老板，请用一碗面的时间讲完一个人生道理。',
     '上签：今天有人请你吃饭', None, 'default'),
    ('请以一位刚失恋的程序员的视角，写一段关于「重试机制」的独白。',
     '中签：失败只是 timeout，不是 error', None, 'default'),
    ('你是我的私人教练，请设计一份只需要五分钟、但能让我今天状态回血的动作。',
     '上签：身体会给你正反馈', None, 'default'),
    ('请扮演一位古董店老板，讲讲那些被修复过的东西为什么更值钱。',
     '上上签：你修补过的东西会发光', None, 'default'),
    ('请用说明书的冷峻语气，描述一下人类谈恋爱的整个过程。',
     '中签：保持幽默感', None, 'default'),
    ('你是一位深夜便利店的店员，请给每一位进店的客人写一句关东煮般的问候。',
     '上签：今晚有人惦记你', None, 'default'),
    ('请把「我想辞职」翻译成五种不同的人生可能性，每种给一句开场白。',
     '中签：门其实有好几扇', None, 'default'),
    ('你是一位给 AI 写提示词的老师，请用一句话讲清楚提示词的核心心法。',
     '上上签：今天你就是老师', None, 'default'),
    ('1024 特别签：愿你的代码零 bug，需求永不变更，评审一次通过。',
     '程序员节限定：上上签', '1024', 'festival'),
]


def sql_escape(s):
    return str(s).replace("'", "''")


def build():
    out = []
    for slot, words in enumerate((SUBJECTS, TASKS, STYLES)):
        for w in words:
            e = sql_escape(w)
            out.append(f"INSERT INTO silly_words (slot, text) SELECT {slot}, '{e}' "
                       f"WHERE NOT EXISTS (SELECT 1 FROM silly_words WHERE text='{e}');")
    for bid, name, cat, cond, leg in BADGES:
        out.append(
            f"INSERT INTO badge_defs (id, name, cat, cond, legendary) SELECT "
            f"'{bid}', '{sql_escape(name)}', '{cat}', '{sql_escape(cond)}', {leg} "
            f"WHERE NOT EXISTS (SELECT 1 FROM badge_defs WHERE id='{bid}');")
    for body, fortune, festival, skin in KOI:
        fest = 'NULL' if festival is None else f"'{sql_escape(festival)}'"
        out.append(
            f"INSERT INTO koi_cards (body, fortune, festival, skin) SELECT "
            f"'{sql_escape(body)}', '{sql_escape(fortune)}', {fest}, '{skin}' "
            f"WHERE NOT EXISTS (SELECT 1 FROM koi_cards WHERE body='{sql_escape(body)}');")
    return '\n'.join(out)


def run(sql):
    # 注意：wrangler 对 /dev/stdin 支持不稳定（会报 "File contents did not upload
    # successfully"），所以先落到临时文件再传给 --file。
    import tempfile
    fd, path = tempfile.mkstemp(suffix='.sql', prefix='seed_')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(sql)
    try:
        args = [NODE, WRANGLER, 'd1', 'execute', 'prompt-studio-db']
        if REMOTE:
            args.append('--remote')
        args += ['--file', path]
        p = subprocess.run(args, capture_output=True, text=True, env=ENV, cwd=CWD)
    finally:
        os.unlink(path)
    if p.returncode != 0:
        print(p.stdout[-2000:])
        print(p.stderr[-2000:])
        sys.exit(1)
    errs = [l for l in p.stdout.splitlines() if 'error' in l.lower()]
    if errs:
        print('\n'.join(errs[:10]))
        sys.exit(1)


if __name__ == '__main__':
    print(('线上' if REMOTE else '本地') + '灌入静态内容…')
    run(build())
    print('完成：词库 %d 条 / 徽章 %d 枚 / 锦鲤 %d 张'
          % (len(SUBJECTS) + len(TASKS) + len(STYLES), len(BADGES), len(KOI)))

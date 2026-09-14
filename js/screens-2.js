// 06 – 10：乐园 / 扭蛋机 / 沙雕生成器 / 竞技场 / Bingo
import { playgroundIcons as pi } from './icons.js';
import { shell, scroll, toolbar } from './helpers.js';

const entry = (icon, name, target, color) =>
  `<div class="play-entry" data-action="go" data-target="${target}" style="color:${color}">${icon}<span style="color:var(--text)">${name}</span></div>`;

const doneCells = new Set([0, 2, 4, 6, 10, 15, 17, 20, 22]);

export const screens2 = {
  // 06 乐园
  playground: () => shell('playground', '', `
    <div class="toolbar">
      <div class="toolbar-title" style="text-align:left;font-size:20px;font-weight:700">乐园</div>
      <span class="text-sm text-warning text-bold">1,280 积分</span>
    </div>
    ${scroll(`
      <div class="playground-banner">
        <div style="font-size:17px;font-weight:700;color:#fff">第 3 赛季开启</div>
        <div style="font-size:12px;color:#E4E9FF">竞技场积分翻倍，来一战 ›</div>
        <div class="row gap-2" style="margin-top:10px">
          <span style="width:16px;height:4px;border-radius:2px;background:#fff"></span>
          <span style="width:4px;height:4px;border-radius:2px;background:rgba(255,255,255,.45)"></span>
          <span style="width:4px;height:4px;border-radius:2px;background:rgba(255,255,255,.45)"></span>
        </div>
      </div>

      <div class="playground-grid">
        <div class="playground-row">
          ${entry(pi.gacha, '扭蛋机', 'gacha', 'var(--secondary)')}
          ${entry(pi.silly, '沙雕生成器', 'silly', 'var(--warning)')}
          ${entry(pi.arena, '竞技场', 'arena', 'var(--danger)')}
        </div>
        <div class="playground-row">
          ${entry(pi.bingo, 'Bingo挑战', 'bingo', 'var(--success)')}
          ${entry(pi.koi, '每日锦鲤', 'koi', 'var(--warning)')}
          ${entry(pi.medal, '成就徽章', 'badges', 'var(--primary)')}
        </div>
        <div class="playground-row">
          ${entry(pi.crash, '翻车墙', 'failwall', 'var(--danger)')}
          ${entry(pi.spark, '主题彩蛋', 'playground', 'var(--secondary)')}
          ${entry(pi.community, '社区广场', 'community', 'var(--success)')}
        </div>
      </div>

      <div class="playground-section-title">最近获得</div>
      <div class="recent-row">
        <div class="list-item" style="flex:1"><span class="text-xs text-success">徽章 · 连续打卡 7 天</span></div>
        <div class="list-item" style="flex:1"><span class="text-xs text-secondary">稀有卡 · 赛博诗人</span></div>
      </div>

      <div class="playground-section-title">本周排行榜</div>
      <div class="list-item">
        <span class="text-sm">01&nbsp;&nbsp;小明同学</span><span class="text-sm text-warning text-bold">2,340</span>
      </div>
      <div class="list-item mt-2" style="background:var(--surface-soft);border-color:rgba(79,140,255,.6)">
        <span class="text-sm text-primary">06&nbsp;&nbsp;我</span><span class="text-sm text-warning text-bold">1,980</span>
      </div>
    `)}`),

  // 07 扭蛋机
  gacha: () => shell('gacha', '', `
    ${toolbar({ title: '扭蛋机', right: '<span class="text-xs text-warning text-bold">积分 1,280</span>' })}
    <div class="gacha-area">
      <div class="gacha-machine">
        <span class="gacha-ball" style="width:32px;height:32px;background:#F87171;left:52px;top:56px"></span>
        <span class="gacha-ball" style="width:40px;height:40px;background:#FBBF24;left:104px;top:42px"></span>
        <span class="gacha-ball" style="width:28px;height:28px;background:#34D399;left:136px;top:96px"></span>
        <span class="gacha-ball" style="width:36px;height:36px;background:#4F8CFF;left:66px;top:120px"></span>
        <span class="gacha-ball" style="width:30px;height:30px;background:#9B6DFF;left:100px;top:138px"></span>
      </div>
    </div>
    <div class="pool-tabs">
      <div class="pool-tab">普通 10</div>
      <div class="pool-tab active">稀有 30</div>
      <div class="pool-tab">限定 50</div>
    </div>
    <div class="draw-btn" data-action="draw">抽取一次 · 消耗 30 积分</div>
    <div class="gacha-info">
      <span>概率公示 普通70% 稀有20% 史诗8% 传说2%</span>
      <span class="text-primary" data-action="toast" data-msg="抽卡记录：按时间倒序展示">抽卡记录 ›</span>
    </div>`),

  // 08 沙雕生成器
  silly: () => shell('silly', '', `
    ${toolbar({ title: '沙雕生成器', right: '<span class="text-xs text-primary" data-action="toast" data-msg="历史记录">历史记录</span>' })}
    ${scroll(`
      <div class="silly-slot"><span class="label">主体</span><span class="value">一只会用 Excel 的橘猫</span></div>
      <div class="silly-slot"><span class="label">任务</span><span class="value">用公文格式写辞职信</span></div>
      <div class="silly-slot"><span class="label">风格</span><span class="value">参考王家卫电影风格</span></div>

      <div class="silly-prompt">
        <div class="head">合成 Prompt</div>
        <div style="font-size:14px;line-height:1.65;color:var(--text)">请让一只会用 Excel 的橘猫，用公文格式写一份辞职信，文风参考王家卫电影。</div>
      </div>

      <button class="btn block" data-action="reroll">随机全部</button>
      <div class="row gap-2 mt-2">
        <button class="btn ghost flex-1" data-action="reroll">换主体</button>
        <button class="btn ghost flex-1" data-action="reroll">换任务</button>
        <button class="btn ghost flex-1" data-action="reroll">换风格</button>
      </div>
      <div class="silly-actions mt-2">
        <button class="btn ghost flex-1" data-action="toast" data-msg="已点赞，计入热门榜">太好笑了 1.2k</button>
        <button class="btn success flex-1" data-action="toast" data-msg="已保存到素材库">保存到素材库</button>
      </div>

      <div class="row gap-2 mt-4">
        <div class="editor-tab active flex-1">热门沙雕</div>
        <div class="editor-tab flex-1">我的创作</div>
      </div>
      <div class="list-item mt-3" style="height:auto;padding:12px;align-items:flex-start">
        <div class="col gap-1">
          <span class="text-sm">让唐僧用 OKR 汇报取经进度</span>
          <span class="text-xs text-muted">★ 3.4k · 复制</span>
        </div>
      </div>
    `)}`),

  // 09 竞技场
  arena: () => shell('arena', '', `
    ${toolbar({ title: '竞技场', right: '<span class="text-xs text-muted">第 3 赛季 · 剩 12 天</span>' })}
    ${scroll(`
      <div class="arena-vs">
        <div class="vs-card me">
          <span class="text-sm text-primary">你</span>
          <span class="score">26.5</span>
          <span class="text-xs text-success text-bold">胜</span>
        </div>
        <span class="text-bold text-muted" style="font-size:13px">VS</span>
        <div class="vs-card ai">
          <span class="text-sm text-muted">AI 对手</span>
          <span class="score">24.1</span>
          <span class="text-xs text-muted">负</span>
        </div>
      </div>

      <div class="card score-card">
        <div class="text-bold text-sm">裁判 AI 评分</div>
        <div class="score-row text-primary">创意分&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;████████░░&nbsp;&nbsp;8.5</div>
        <div class="score-row text-secondary">细节分&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;███████░░░&nbsp;&nbsp;7.8</div>
        <div class="score-row text-success">实用分&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;█████████░&nbsp;&nbsp;9.2</div>
        <div class="text-xs text-muted mt-3" style="line-height:1.6">你的 prompt 加入了明确的角色设定和输出格式约束，细节更丰富，实用性略胜一筹。</div>
      </div>

      <div class="row gap-2" style="padding:0 16px">
        <button class="btn flex-1" data-action="toast" data-msg="新一局开始，倒计时 60 秒">再来一局</button>
        <button class="btn ghost flex-1" data-action="toast" data-msg="回放：逐句对比双方 prompt">查看回放</button>
      </div>

      <div class="row gap-2 mt-4" style="padding:0 16px">
        <div class="editor-tab active flex-1">对战</div>
        <div class="editor-tab flex-1">排行</div>
        <div class="editor-tab flex-1">历史</div>
      </div>
    `)}`),

  // 10 Bingo
  bingo: () => shell('bingo', '', `
    ${toolbar({ title: '本周 Bingo', right: '<span class="text-xs text-warning">剩 4 天</span>' })}
    ${scroll(`
      <div class="card bingo-progress">
        <div class="text-bold">已完成 9 / 25</div>
        <div class="text-xs text-muted mt-2" style="line-height:1.5">已连成 1 条线 · 每条 +50 积分 · 全图完成 +300 积分</div>
      </div>

      <div class="bingo-grid">
        ${[0, 1, 2, 3, 4].map(r => `
          <div class="bingo-row">
            ${[0, 1, 2, 3, 4].map(c => {
              const i = r * 5 + c;
              if (i === 12) return `<div class="bingo-cell free" data-action="bingo">免费</div>`;
              const cls = doneCells.has(i) ? 'done' : 'undone';
              return `<div class="bingo-cell ${cls}" data-action="bingo">${doneCells.has(i) ? '✓' : ''}</div>`;
            }).join('')}
          </div>`).join('')}
      </div>

      <div class="text-xs text-muted mt-3">■ 已完成&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;□ 未完成&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;◆ 免费奖励格</div>

      <div class="row gap-2 mt-4">
        <button class="btn ghost flex-1" data-action="toast" data-msg="上周完成 18/25">上周回顾</button>
        <button class="btn ghost flex-1" data-action="toast" data-msg="横/竖/斜连成一线即可获奖">规则说明</button>
      </div>
    `)}`)
};

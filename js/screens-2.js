// 06 – 10：乐园 / 扭蛋机 / 沙雕生成器 / 竞技场 / Bingo
import { playgroundIcons as pi } from './icons.js';
import { shell, scroll, toolbar } from './helpers.js';

const entry = (icon, name, target, color) =>
  `<div class="play-entry" data-action="go" data-target="${target}" style="color:${color}">${icon}<span style="color:var(--text)">${name}</span></div>`;

export const screens2 = {
  // 06 乐园
  playground: () => shell('playground', '', `
    <div class="toolbar">
      <div class="toolbar-title" style="text-align:left;font-size:20px;font-weight:700">乐园</div>
      <span class="text-sm text-warning text-bold"><span data-stat="credits">0</span> 灵感值</span>
    </div>
    ${scroll(`
      <div class="playground-banner">
        <div style="font-size:17px;font-weight:700;color:#fff">灵感值可以抽扭蛋</div>
        <div style="font-size:12px;color:#E4E9FF">每抽一次 10 灵感值，稀有度由服务端决定 ›</div>
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
          ${entry(pi.spark, '统计分析', 'stats', 'var(--secondary)')}
          ${entry(pi.community, '社区广场', 'community', 'var(--success)')}
        </div>
      </div>

      <div class="playground-section-title">本周进度</div>
      <div class="list-item">
        <span class="text-sm">Bingo 打卡</span>
        <span class="text-sm text-success text-bold"><span data-stat="bingoDone">0</span> / 25</span>
      </div>
      <div class="list-item mt-2">
        <span class="text-sm">我的提示词</span>
        <span class="text-sm text-primary text-bold"><span data-stat="prompts">0</span> 条</span>
      </div>
      <div class="list-item mt-2">
        <span class="text-sm">累计 AI 调用</span>
        <span class="text-sm text-warning text-bold"><span data-stat="calls">0</span> 次</span>
      </div>
    `)}`),

  // 07 扭蛋机
  gacha: () => shell('gacha', '', `
    ${toolbar({ title: '扭蛋机', right: '<span class="text-xs text-warning text-bold">灵感值 <span data-stat="credits">0</span></span>' })}
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
      <div class="pool-tab active">灵感扭蛋</div>
      <div class="pool-tab" data-action="toast" data-msg="奖池由服务端控制，概率已公示">概率公示</div>
      <div class="pool-tab" data-action="gacha-history">抽卡记录</div>
    </div>
    <div class="draw-btn" data-action="draw">抽取一次 · 消耗 10 灵感值</div>
    <div class="gacha-info">
      <span>概率公示 普通62% 稀有25% 史诗10% 传说3%</span>
      <span class="text-primary" data-action="go" data-target="playground">返回乐园 ›</span>
    </div>`),

  // 08 沙雕生成器
  silly: () => shell('silly', '', `
    ${toolbar({ title: '沙雕生成器', right: '<span class="text-xs text-primary" data-action="go" data-target="library">我的创作</span>' })}
    ${scroll(`
      <div class="silly-slot" data-action="reroll" data-slot="0"><span class="label">主体</span><span class="value">一只会用 Excel 的橘猫</span></div>
      <div class="silly-slot" data-action="reroll" data-slot="1"><span class="label">任务</span><span class="value">用公文格式写辞职信</span></div>
      <div class="silly-slot" data-action="reroll" data-slot="2"><span class="label">风格</span><span class="value">参考王家卫电影风格</span></div>

      <div class="silly-prompt">
        <div class="head">合成 Prompt</div>
        <div style="font-size:14px;line-height:1.65;color:var(--text)" id="sillyResult">请让一只会用 Excel 的橘猫，用公文格式写一份辞职信，文风参考王家卫电影。</div>
      </div>

      <button class="btn block" data-action="reroll" data-slot="all">随机全部</button>
      <div class="row gap-2 mt-2">
        <button class="btn ghost flex-1" data-action="reroll" data-slot="0">换主体</button>
        <button class="btn ghost flex-1" data-action="reroll" data-slot="1">换任务</button>
        <button class="btn ghost flex-1" data-action="reroll" data-slot="2">换风格</button>
      </div>
      <div class="silly-actions mt-2">
        <button class="btn ghost flex-1" data-action="toast" data-msg="已点赞，计入热门榜">太好笑了 1.2k</button>
        <button class="btn success flex-1" data-action="save-silly">保存到素材库</button>
      </div>

      <div class="row gap-2 mt-4">
        <div class="editor-tab active flex-1">热门沙雕</div>
        <div class="editor-tab flex-1" data-action="go" data-target="library">我的创作</div>
      </div>
      <div class="list-item mt-3" style="height:auto;padding:12px;align-items:flex-start">
        <div class="col gap-1">
          <span class="text-sm">让唐僧用 OKR 汇报取经进度</span>
          <span class="text-xs text-muted">★ 3.4k · 社区热门</span>
        </div>
      </div>
    `)}`),

  // 09 竞技场
  arena: () => shell('arena', '', `
    ${toolbar({ title: '竞技场', right: '<span class="text-xs text-muted">由 AI 裁判打分</span>' })}
    ${scroll(`
      <div class="arena-vs">
        <div class="vs-card me">
          <span class="text-sm text-primary">你</span>
          <span class="score" data-arena="my">–</span>
          <span class="text-xs text-success text-bold" data-arena="myTag">待战</span>
        </div>
        <span class="text-bold text-muted" style="font-size:13px">VS</span>
        <div class="vs-card ai">
          <span class="text-sm text-muted">AI 对手</span>
          <span class="score" data-arena="ai">–</span>
          <span class="text-xs text-muted" data-arena="aiTag">待战</span>
        </div>
      </div>

      <div class="card score-card">
        <div class="text-bold text-sm">裁判 AI 评语</div>
        <div class="text-xs text-muted mt-3" style="line-height:1.6" data-arena="verdict">
          点「开始对战」，裁判模型会分别给你的提示词和基线提示词打分（0–10），胜出 +20 灵感值。
        </div>
      </div>

      <div class="row gap-2" style="padding:0 16px">
        <button class="btn flex-1" data-action="arena-play" id="arenaBtn">开始对战</button>
        <button class="btn ghost flex-1" data-action="go" data-target="editor">去改提示词</button>
      </div>

      <div class="row gap-2 mt-4" style="padding:0 16px">
        <div class="editor-tab active flex-1">对战</div>
        <div class="editor-tab flex-1" data-action="toast" data-msg="赛季排行榜：即将开放">排行</div>
        <div class="editor-tab flex-1" data-action="toast" data-msg="历史战绩：累计写入你的账户">历史</div>
      </div>
    `)}`),

  // 10 Bingo
  bingo: () => shell('bingo', '', `
    ${toolbar({ title: '本月 Bingo', right: '<span class="text-xs text-warning">自动保存</span>' })}
    ${scroll(`
      <div class="card bingo-progress">
        <div class="text-bold">已完成 <span data-stat="bingoDone">0</span> / 25</div>
        <div class="text-xs text-muted mt-2" style="line-height:1.5">
          已连成 <span data-stat="bingoLines">0</span> 条线 · 每条 +50 灵感值 · 全图完成 +300
        </div>
      </div>

      <div class="bingo-grid" id="bingoGrid">
        ${[0, 1, 2, 3, 4].map(r => `
          <div class="bingo-row">
            ${[0, 1, 2, 3, 4].map(c => {
              const i = r * 5 + c;
              if (i === 12) return `<div class="bingo-cell free" data-action="bingo" data-cell="${i}">免费</div>`;
              return `<div class="bingo-cell undone" data-action="bingo" data-cell="${i}"></div>`;
            }).join('')}
          </div>`).join('')}
      </div>

      <div class="text-xs text-muted mt-3">■ 已完成&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;□ 未完成&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;◆ 免费奖励格</div>

      <div class="row gap-2 mt-4">
        <button class="btn ghost flex-1" data-action="bingo-reset">重置本月</button>
        <button class="btn ghost flex-1" data-action="toast" data-msg="横/竖/斜连成一线即可获奖">规则说明</button>
      </div>
    `)}`)
};

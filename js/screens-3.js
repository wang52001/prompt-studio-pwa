// 11 – 15：成就徽章墙 / 每日锦鲤 / 翻车现场墙 / 社区广场 / 个人中心
// 全部数据由后端 /api 提供，页面只负责渲染与交互
import { icons } from './icons.js';
import { shell, scroll, toolbar, listItem } from './helpers.js';

export const screens3 = {
  // 11 成就徽章墙
  badges: () => shell('badges', '', `
    ${toolbar({ title: '成就徽章墙' })}
    <div style="padding:0 16px">
      <div class="card badge-progress">
        <div class="text-bold" id="badgeSummary">徽章加载中…</div>
        <div class="profile-track" style="margin-top:10px"><div class="profile-track-fill" id="badgeBar" style="width:0%"></div></div>
        <div class="text-xs text-muted mt-2" id="badgeLatest">—</div>
      </div>
    </div>
    <div class="row gap-2" style="padding:0 16px 8px" id="badgeTabs">
      <span class="text-sm text-primary text-bold" data-badge-cat="all">全部</span>
      <span class="text-sm text-muted" data-badge-cat="成长">成长类</span>
      <span class="text-sm text-muted" data-badge-cat="趣味">趣味类</span>
      <span class="text-sm text-muted" data-badge-cat="竞技">竞技类</span>
      <span class="text-sm text-muted" data-badge-cat="限定">限定类</span>
    </div>
    ${scroll(`<div id="badgeGrid"><div class="text-xs text-muted">加载中…</div></div>`)}`),

  // 12 每日锦鲤
  koi: () => shell('koi', '', `
    ${toolbar({ title: '每日锦鲤', right: '<span class="text-xs text-warning">连续 <span data-stat="streak">0</span> 天</span>' })}
    ${scroll(`
      <div id="koiCard">
        <div class="koi-card">
          <span class="label">今日锦鲤 · 加载中</span>
          <div style="font-size:14px;line-height:1.7;color:var(--text)">正在为你翻开今日锦鲤…</div>
        </div>
      </div>

      <div class="row gap-2 mt-3">
        <button class="btn flex-1" data-action="save-koi">收藏到素材库</button>
        <button class="btn ghost flex-1" data-action="checkin">今日打卡 +10</button>
      </div>

      <div class="koi-calendar mt-4">
        <div class="text-xs text-muted">近 30 天打卡 · 漏签可花 20 灵感值补签（点格子）</div>
        <div class="calendar-row" id="koiCalendar" style="flex-wrap:wrap">
          <div class="text-xs text-muted">加载中…</div>
        </div>
      </div>
    `)}`),

  // 13 翻车现场墙
  failwall: () => shell('failwall', '', `
    ${toolbar({ title: '翻车现场墙', right: '<button class="btn" style="height:32px;padding:0 12px;font-size:12px" data-action="fail-submit">投稿翻车</button>' })}
    <div class="row gap-2" style="padding:0 16px 8px" id="failTabs">
      <span class="text-sm text-primary text-bold" data-fail-sort="new">最新</span>
      <span class="text-sm text-muted" data-fail-sort="hot_week">最热（本周）</span>
      <span class="text-sm text-muted" data-fail-sort="hot">最热（总榜）</span>
    </div>
    ${scroll(`<div id="failList"><div class="text-xs text-muted">加载中…</div></div>`)}`),

  // 14 社区广场
  community: () => shell('community', '', `
    ${toolbar({ title: '社区广场', right: '<button class="btn" style="height:32px;padding:0 12px;font-size:12px" data-action="community-publish">发布</button>' })}
    <div style="padding:0 16px">
      <div class="search-box">${icons.search}<input id="commSearch" placeholder="搜索社区 prompt" style="background:none;border:0;outline:none;color:var(--text);flex:1;font-size:13px"></div>
    </div>
    <div class="row gap-2" style="padding:8px 16px" id="commTabs">
      <span class="text-sm text-primary text-bold" data-comm-sort="new">最新</span>
      <span class="text-sm text-muted" data-comm-sort="hot">热门</span>
    </div>
    ${scroll(`<div id="communityList"><div class="text-xs text-muted">加载中…</div></div>`)}`),

  // 15 个人中心
  profile: () => shell('profile', '', `
    ${scroll(`
      <div class="card profile-card">
        <div class="profile-row">
          <div class="profile-avatar" data-user="avatar">创</div>
          <div class="col">
            <div style="font-size:16px;font-weight:600" data-user="nickname">创作者</div>
            <div class="profile-meta" data-user="email">—</div>
          </div>
        </div>
        <div class="profile-track"><div class="profile-track-fill" data-stat="levelBar" style="width:0%"></div></div>
        <div class="text-xs text-muted mt-2">当前 <span data-stat="credits">0</span> 灵感值 · 写提示词与打卡可持续获得</div>
      </div>

      <div class="data-row-4">
        <div class="data-cell"><span style="font-size:15px;font-weight:700;color:var(--text)" data-stat="calls">0</span>AI调用总次数</div>
        <div class="data-cell"><span style="font-size:15px;font-weight:700;color:var(--text)" data-stat="tokens">0</span>累计 Token</div>
        <div class="data-cell"><span style="font-size:15px;font-weight:700;color:var(--text)" data-stat="prompts">0</span>我的提示词</div>
        <div class="data-cell"><span style="font-size:15px;font-weight:700;color:var(--text)" data-stat="streak">0</span>连续打卡</div>
      </div>

      <div class="group-title">我的内容</div>
      ${listItem('我的模板', 'go:library')}
      <div class="mt-2"></div>
      ${listItem('Bingo 打卡', 'go:bingo')}
      <div class="mt-2"></div>
      ${listItem('统计分析', 'go:stats')}
      <div class="mt-2"></div>
      ${listItem('灵感值流水', 'go:credits')}

      <div class="group-title">账户</div>
      ${listItem('登录密码&nbsp;&nbsp;<span data-user="pwState">未设置</span>', 'password-sheet')}
      <div class="mt-2"></div>
      ${listItem('API 密钥管理', 'go:apikeys')}
      <div class="mt-2"></div>
      ${listItem('导出我的数据', 'export-data')}
      <div class="mt-2"></div>
      ${listItem('订阅状态&nbsp;&nbsp;免费版', 'toast')}

      <div class="group-title">偏好</div>
      ${listItem('设置', 'go:settings')}
      <div class="mt-2"></div>
      ${listItem('主题切换&nbsp;&nbsp;&nbsp;深色', 'toast')}

      <div class="group-title">PWA</div>
      ${listItem('添加到桌面 / 离线缓存', 'install')}
      <div class="mt-2"></div>
      ${listItem('关于 / 检查更新&nbsp;&nbsp;&nbsp;v1.2.0', 'toast')}

      <button class="logout-btn mt-4" data-action="logout">退出登录</button>
    `)}`)
};

// 11 – 15：成就徽章墙 / 每日锦鲤 / 翻车现场墙 / 社区广场 / 个人中心
import { icons } from './icons.js';
import { shell, scroll, toolbar, listItem } from './helpers.js';

export const screens3 = {
  // 11 成就徽章墙
  badges: () => shell('badges', '', `
    ${toolbar({ title: '成就徽章墙' })}
    <div style="padding:0 16px">
      <div class="card badge-progress">
        <div class="text-bold">已解锁 14 / 30 枚徽章</div>
        <div class="profile-track" style="margin-top:10px"><div class="profile-track-fill" style="width:47%"></div></div>
        <div class="text-xs text-muted mt-2">最近解锁：连续打卡 7 天 · 扭蛋达人</div>
      </div>
    </div>
    <div class="row gap-2" style="padding:0 16px 8px">
      <span class="text-sm text-primary text-bold">全部</span>
      <span class="text-sm text-muted">成长类</span>
      <span class="text-sm text-muted">趣味类</span>
      <span class="text-sm text-muted">竞技类</span>
    </div>
    ${scroll(`
      <div class="badge-row">
        <div class="badge-tile" data-action="toast" data-msg="初出茅庐 · 解锁于 2026.08.02">
          <span class="badge-icon" style="background:var(--primary)"></span>初出茅庐
        </div>
        <div class="badge-tile" data-action="toast" data-msg="连续打卡 7 天 · 解锁于 2026.09.10">
          <span class="badge-icon" style="background:var(--success)"></span>连续打卡 7 天
        </div>
        <div class="badge-tile" data-action="toast" data-msg="扭蛋达人 · 解锁于 2026.09.12">
          <span class="badge-icon" style="background:var(--secondary)"></span>扭蛋达人
        </div>
      </div>
      <div class="badge-row">
        <div class="badge-tile legendary" data-action="toast" data-msg="传说 · 锦鲤王（金色边框 + 微光）">
          <span class="badge-icon" style="background:var(--warning)"></span>传说 · 锦鲤王
        </div>
        <div class="badge-tile locked" data-action="toast" data-msg="未解锁：完成 1 次 Bingo 全图">
          <span class="badge-icon" style="background:var(--border)"></span>Bingo 大师
        </div>
        <div class="badge-tile" data-action="toast" data-msg="竞技场十连胜 · 解锁于 2026.09.08">
          <span class="badge-icon" style="background:var(--danger)"></span>竞技场十连胜
        </div>
      </div>
    `)}`),

  // 12 每日锦鲤
  koi: () => shell('koi', '', `
    ${toolbar({ title: '每日锦鲤', right: '<span class="text-xs text-warning">连续 12 天</span>' })}
    ${scroll(`
      <div class="koi-card">
        <span class="label">今日锦鲤 · 已翻开</span>
        <div style="font-size:14px;line-height:1.7;color:var(--text)">请扮演一位阅尽千帆的深夜电台主播，用三句话安慰今天加班到现在的我。</div>
        <span class="fortune">上上签：今天写的 prompt 都会一次通过</span>
      </div>

      <div class="row gap-2 mt-3">
        <button class="btn flex-1" data-action="toast" data-msg="已收藏到素材库">收藏到素材库</button>
        <button class="btn ghost flex-1" data-action="toast" data-msg="生成分享卡片">分享锦鲤</button>
      </div>

      <div class="koi-calendar mt-4">
        <div class="text-xs text-muted">本月打卡 · 漏签可花 20 积分补签</div>
        <div class="calendar-row">
          <div class="calendar-day check">1</div>
          <div class="calendar-day check">2</div>
          <div class="calendar-day miss">3</div>
          <div class="calendar-day check">4</div>
          <div class="calendar-day check">5</div>
          <div class="calendar-day check">6</div>
          <div class="calendar-day miss">7</div>
        </div>
      </div>
    `)}`),

  // 13 翻车现场墙
  failwall: () => shell('failwall', '', `
    ${toolbar({ title: '翻车现场墙', right: '<button class="btn" style="height:32px;padding:0 12px;font-size:12px" data-action="toast" data-msg="投稿弹窗：选择失败回复 + 吐槽说明">投稿翻车</button>' })}
    <div class="row gap-2" style="padding:0 16px 8px">
      <span class="text-sm text-primary text-bold">最新</span>
      <span class="text-sm text-muted">最热（本周）</span>
      <span class="text-sm text-muted">最热（总榜）</span>
    </div>
    ${scroll(`
      <div class="card fail-card">
        <div class="text-xs text-muted">小明的 AI · 2 小时前</div>
        <div class="text-sm text-bold mt-2">Prompt：画一只坐在沙发上的橘猫</div>
        <div class="result mt-2">结果：生成了一只六条腿、长着人脸的橘色不明生物，沙发悬浮在半空。</div>
        <div class="foot">赞 234&nbsp;&nbsp;&nbsp;评论 18&nbsp;&nbsp;&nbsp;收藏</div>
      </div>
      <div class="card fail-card">
        <div class="text-xs text-muted">Prompt 练习生 · 昨天</div>
        <div class="text-sm text-bold mt-2">Prompt：把这段中文翻译成地道的文言文</div>
        <div class="result mt-2">结果：AI 自信地输出了一段看起来很像日文的东西，并表示「翻译完成」。</div>
        <div class="foot">赞 1.1k&nbsp;&nbsp;&nbsp;评论 96&nbsp;&nbsp;&nbsp;收藏</div>
      </div>
    `)}`),

  // 14 社区广场
  community: () => shell('community', '', `
    ${toolbar({ title: '社区广场', right: '<button class="btn" style="height:32px;padding:0 12px;font-size:12px" data-action="toast" data-msg="发布页：标题 / prompt / 标签 / 效果说明">发布</button>' })}
    <div style="padding:0 16px">
      <div class="search-box">${icons.search}<span>搜索社区 prompt</span></div>
    </div>
    <div class="row gap-2" style="padding:8px 16px">
      <span class="text-sm text-primary text-bold">推荐</span>
      <span class="text-sm text-muted">最新</span>
      <span class="text-sm text-muted">热门</span>
      <span class="text-sm text-muted">关注</span>
    </div>
    ${scroll(`
      <div class="card post-card" data-action="toast" data-msg="进入详情页">
        <div class="text-xs text-muted">文案老司机 · Lv.5</div>
        <div class="title mt-2">让 AI 写出不像 AI 的文案</div>
        <div class="preview">核心是给它具体的读者画像和禁用词表，效果立竿见影，附完整 prompt…</div>
        <div class="foot">#文案 #营销&nbsp;&nbsp;&nbsp;赞 892&nbsp;&nbsp;&nbsp;一键使用 ›</div>
      </div>
      <div class="card post-card" data-action="toast" data-msg="进入详情页">
        <div class="text-xs text-muted">前端小菜鸟 · Lv.3</div>
        <div class="title mt-2">一键生成组件文档</div>
        <div class="preview">把组件源码丢给它，自动输出 Props 表格和使用示例，省下半天时间…</div>
        <div class="foot">#代码 #效率&nbsp;&nbsp;&nbsp;赞 517&nbsp;&nbsp;&nbsp;一键使用 ›</div>
      </div>
    `)}`),

  // 15 个人中心
  profile: () => shell('profile', '', `
    ${scroll(`
      <div class="card profile-card">
        <div class="profile-row">
          <div class="profile-avatar">创</div>
          <div class="col">
            <div style="font-size:16px;font-weight:600">创作者小明</div>
            <div class="profile-meta">ID 8842130 · Lv.4 Prompt 大师</div>
          </div>
        </div>
        <div class="profile-track"><div class="profile-track-fill"></div></div>
        <div class="text-xs text-muted mt-2">再获 720 积分升至 Lv.5</div>
      </div>

      <div class="data-row-4">
        <div class="data-cell"><span style="font-size:15px;font-weight:700;color:var(--text)">1,284</span>AI调用总次数</div>
        <div class="data-cell"><span style="font-size:15px;font-weight:700;color:var(--text)">128.4K</span>累计 Token</div>
        <div class="data-cell"><span style="font-size:15px;font-weight:700;color:var(--text)">86</span>模板收藏</div>
        <div class="data-cell"><span style="font-size:15px;font-weight:700;color:var(--text)">12</span>连续打卡</div>
      </div>

      <div class="group-title">我的内容</div>
      ${listItem('我的模板&nbsp;&nbsp;32', 'toast')}
      <div class="mt-2"></div>
      ${listItem('我的对战&nbsp;&nbsp;48 场', 'toast')}
      <div class="mt-2"></div>
      ${listItem('我的沙雕&nbsp;&nbsp;15 条', 'toast')}
      <div class="mt-2"></div>
      ${listItem('投稿记录&nbsp;&nbsp;6 条', 'toast')}

      <div class="group-title">账户</div>
      ${listItem('API 密钥管理', 'go:apikeys')}
      <div class="mt-2"></div>
      ${listItem('积分明细', 'toast')}
      <div class="mt-2"></div>
      ${listItem('订阅状态&nbsp;&nbsp;免费版', 'toast')}

      <div class="group-title">偏好</div>
      ${listItem('主题切换&nbsp;&nbsp;&nbsp;深色', 'toast')}
      <div class="mt-2"></div>
      ${listItem('默认模型&nbsp;&nbsp;&nbsp;DeepSeek-V3', 'toast')}

      <div class="group-title">PWA</div>
      ${listItem('添加到桌面 / 离线缓存', 'install')}
      <div class="mt-2"></div>
      ${listItem('关于 / 检查更新&nbsp;&nbsp;&nbsp;v1.0.0', 'toast')}

      <button class="logout-btn mt-4" data-action="toast" data-msg="已退出登录（演示）">退出登录</button>
    `)}`)
};

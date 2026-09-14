// 01 – 05：启动页 / 工作台 / 编辑器 / 调试面板 / 素材库
import { icons, logoPencil } from './icons.js';
import { shell, scroll, toolbar } from './helpers.js';

export const screens1 = {
  // 01 启动页
  splash: () => shell('splash', 'screen-splash', `
    <div class="splash-logo">${logoPencil}</div>
    <div class="splash-title">Prompt Studio</div>
    <div class="splash-tag">提示词工坊</div>
    <div class="splash-quote">「好的提示词是和 AI 的一场谈判」</div>
    <div class="splash-progress"></div>`),

  // 02 工作台
  workbench: () => shell('workbench', '', `
    ${scroll(`
      <div class="workbench-header">
        <div class="workbench-avatar">创</div>
        <div class="workbench-greeting">晚上好，创作者</div>
        <div class="streak-pill"><span style="color:var(--warning)">${icons.flame}</span>12 天</div>
      </div>

      <div class="data-row">
        <div class="data-card">
          <span class="label">今日AI调用</span>
          <span class="value">28</span>
          <span class="delta text-success">较昨日 +12%</span>
        </div>
        <div class="data-card">
          <span class="label">累计消耗Token</span>
          <span class="value">128.4K</span>
          <div class="bar"><div class="bar-fill" style="width:72%"></div></div>
        </div>
        <div class="data-card">
          <span class="label">积分余额</span>
          <span class="value text-warning">1,280</span>
          <span class="delta text-primary" data-action="go" data-target="gacha">去扭蛋 ›</span>
        </div>
      </div>

      <div class="quick-grid">
        <div class="quick-row">
          <div class="quick-card blue" data-action="go" data-target="editor">${icons.plus}<span>新建提示词</span></div>
          <div class="quick-card purple" data-action="go" data-target="debug">${icons.terminal}<span>AI调试台</span></div>
        </div>
        <div class="quick-row">
          <div class="quick-card green" data-action="go" data-target="library">${icons.folder}<span>模板素材库</span></div>
          <div class="quick-card orange" data-action="go" data-target="batchtest">${icons.layers}<span>批量测试</span></div>
        </div>
      </div>

      <div class="section-title">最近编辑</div>
      <div class="recent-row">
        <div class="recent-card" data-action="go" data-target="editor">
          <span class="title">小红书爆款文案生成器</span>
          <span class="meta">● 2小时前</span>
        </div>
        <div class="recent-card" data-action="go" data-target="editor">
          <span class="title">代码审查助手 Prompt</span>
          <span class="meta">● 昨天 21:40</span>
        </div>
      </div>

      <div class="card-grad-blue mt-4" data-action="go" data-target="bingo" style="margin-top:16px">
        <div class="text-bold" style="font-size:14px;color:#fff">今日Bingo 已完成 3/5</div>
        <div class="text-sm" style="color:#DCE4FF;margin-top:4px">新卡池上线：赛博朋克系列 ›</div>
      </div>
    `)}`),

  // 03 提示词编辑器
  editor: () => shell('editor', '', `
    ${toolbar({ title: '小红书爆款文案', right: `<span class="text-xs text-muted">已保存 · 3分钟前</span><button class="icon-btn small" data-action="toast" data-msg="更多操作：导出 / 复制 / 版本历史">${icons.more}</button>` })}
    <div class="editor-tabs">
      <div class="editor-tab active" data-tab="edit">编辑</div>
      <div class="editor-tab" data-tab="debug">调试</div>
      <div class="editor-tab" data-tab="version">版本</div>
    </div>
    ${scroll(`
      <div class="list-item" data-action="toast" data-msg="切换预设角色">
        <span>角色：文案写手</span><span class="text-muted">${icons.chevron}</span>
      </div>

      <div class="editor-box mt-3">
        <span class="tag">System</span>
        <div class="content">你是一位资深小红书内容运营专家，擅长为 <span class="var">\${产品名}</span> 撰写爆款笔记。请突出 <span class="var">\${卖点}</span>，语气亲切有网感，适当使用 emoji，结尾引导互动。</div>
      </div>

      <div class="editor-box">
        <span class="tag">User</span>
        <div class="content">请为 <span class="var">\${产品名}</span> 写 3 条小红书笔记，包含标题和正文。</div>
      </div>

      <div class="editor-box">
        <div class="text-bold text-sm">变量（2）</div>
        <div class="list-item mt-2" style="background:var(--bg)">
          <span class="text-secondary">产品名</span><span>便携咖啡杯</span>
        </div>
        <div class="list-item mt-2" style="background:var(--bg)">
          <span class="text-secondary">卖点</span><span>30 秒速冷</span>
        </div>
      </div>

      <div class="editor-box">
        <div class="row between">
          <span class="text-bold text-sm">最终Prompt预览</span>
          <span class="text-xs text-primary" data-action="toast" data-msg="已复制到剪贴板">一键复制</span>
        </div>
        <div class="content text-muted mt-2">你是一位资深小红书内容运营专家，擅长为 便携咖啡杯 撰写爆款笔记。请突出 30 秒速冷，语气亲切有网感…</div>
      </div>
    `)}
    <div class="editor-bottom">
      <span class="text-xs text-muted">126 字 ≈ 98 Token</span>
      <div class="row gap-2">
        <button class="btn ghost" data-action="toast" data-msg="已保存">保存</button>
        <button class="btn" data-action="go" data-target="debug">去调试</button>
      </div>
    </div>`),

  // 04 AI 调试面板
  debug: () => shell('debug', '', `
    ${toolbar({ title: 'AI 调试台', right: `<button class="icon-btn small" data-action="toast" data-msg="本次调用：输入 96 / 输出 412 Token · 耗时 1.8s">${icons.stats}</button>` })}
    <div class="config-row">
      <div class="model-pill" data-action="toast" data-msg="切换模型：DeepSeek-V3 / GLM-4 / Qwen-Max">
        DeepSeek-V3 <span class="text-muted">${icons.chevron}</span>
      </div>
      <span class="text-xs text-muted">T 0.7 · Top P 1.0 · 2048</span>
    </div>
    <div class="chat-area">
      <div class="bubble-user">帮我写一段便携咖啡杯的产品介绍</div>
      <div class="bubble-ai">
        <strong>便携咖啡杯 · 30 秒速冷</strong><br><br>
        告别等待，一摇即凉。316 不锈钢内胆 + 双层真空，保冷 12 小时。<br><br>
        1. 30 秒速冷，开盖即饮<br>
        2. 350ml 轻量，单手可握<br>
        3. 一键弹盖，车载适配
        <div class="actions">
          <span data-action="toast" data-msg="感谢反馈">👍 有用</span>
          <span data-action="toast" data-msg="已复制">复制</span>
          <span data-action="toast" data-msg="正在重新生成…">重新生成</span>
        </div>
      </div>
    </div>
    <div class="input-bar">
      <button class="icon-btn small" data-action="toast" data-msg="上传图片（多模态模型可用）">${icons.attach}</button>
      <input class="input" placeholder="继续追问，Shift+Enter 换行" />
      <button class="send-btn" data-action="toast" data-msg="已发送（示例数据，未接真实接口）">${icons.send}</button>
    </div>`),

  // 05 模板素材库
  library: () => shell('library', '', `
    <div class="toolbar">
      <div class="toolbar-title" style="text-align:left;font-size:20px;font-weight:700">素材库</div>
      <span class="text-xs text-muted" data-action="toast" data-msg="排序：最新 / 最常用 / 收藏数">最新 ↓</span>
    </div>
    <div style="padding:0 16px">
      <div class="search-box">${icons.search}<span>搜索标题 / 内容 / 标签</span></div>
    </div>
    <div class="chip-row" style="padding:0 16px">
      <span class="chip active">全部</span><span class="chip">代码</span><span class="chip">文案</span>
      <span class="chip">绘图</span><span class="chip">剧本</span>
    </div>
    ${scroll(`
      <div class="lib-grid">
        <div class="lib-card" data-action="toast" data-msg="模板预览弹窗">
          <span class="title">小红书爆款文案</span>
          <span class="preview">你是一位资深小红书内容运营专家，擅长撰写爆款笔记…</span>
          <span class="meta">★ 已用 128 次</span>
        </div>
        <div class="lib-card" data-action="toast" data-msg="模板预览弹窗">
          <span class="title">代码审查助手</span>
          <span class="preview">请审查以下代码，指出潜在 bug、性能与安全问题…</span>
          <span class="meta">★ 已用 96 次</span>
        </div>
        <div class="lib-card" data-action="toast" data-msg="模板预览弹窗">
          <span class="title">赛博朋克绘图描述</span>
          <span class="preview">霓虹雨夜、机械义体、8K 超清、电影级光影…</span>
          <span class="meta">★ 已用 74 次</span>
        </div>
        <div class="lib-card" data-action="toast" data-msg="模板预览弹窗">
          <span class="title">周报自动生成器</span>
          <span class="preview">根据本周工作记录，生成结构化、有数据的周报…</span>
          <span class="meta">★ 已用 51 次</span>
        </div>
      </div>
      <div class="action-bar">
        <button class="btn block" data-action="toast" data-msg="新建模板">+ 新建模板</button>
        <button class="btn ghost block" data-action="toast" data-msg="导入 JSON / 分享链接">导入</button>
      </div>
    `)}`)
};

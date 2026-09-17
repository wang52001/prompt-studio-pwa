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
        <div class="workbench-avatar" data-user="avatar">创</div>
        <div class="workbench-greeting">你好，<span data-user="nickname">创作者</span></div>
        <div class="streak-pill"><span style="color:var(--warning)">${icons.flame}</span><span data-stat="streak">0</span> 天</div>
      </div>

      <div class="data-row">
        <div class="data-card">
          <span class="label">今日AI调用</span>
          <span class="value" data-stat="todayCalls">0</span>
          <span class="delta text-success" data-stat="todayDelta">较昨日 —</span>
        </div>
        <div class="data-card">
          <span class="label">累计消耗Token</span>
          <span class="value" data-stat="tokens">0</span>
          <div class="bar"><div class="bar-fill" data-stat="tokenBar" style="width:0%"></div></div>
        </div>
        <div class="data-card">
          <span class="label">灵感值</span>
          <span class="value text-warning" data-stat="credits">0</span>
          <span class="delta text-primary" data-action="go" data-target="gacha">去扭蛋 ›</span>
        </div>
      </div>

      <div class="quick-grid">
        <div class="quick-row">
          <div class="quick-card blue" data-action="new-prompt">${icons.plus}<span>新建提示词</span></div>
          <div class="quick-card purple" data-action="go" data-target="debug">${icons.terminal}<span>AI调试台</span></div>
        </div>
        <div class="quick-row">
          <div class="quick-card green" data-action="go" data-target="library">${icons.folder}<span>我的素材库</span></div>
          <div class="quick-card orange" data-action="go" data-target="stats">${icons.stats}<span>统计分析</span></div>
        </div>
      </div>

      <div class="section-title">最近编辑</div>
      <div class="recent-row" id="recentRow">
        <div class="text-xs text-muted" style="padding:6px 2px">还没有提示词，点上面「新建提示词」开始吧</div>
      </div>

      <div class="card-grad-blue mt-4" data-action="go" data-target="bingo" style="margin-top:16px">
        <div class="text-bold" style="font-size:14px;color:#fff">本周Bingo 已完成 <span data-stat="bingoDone">0</span>/25</div>
        <div class="text-sm" style="color:#DCE4FF;margin-top:4px">连成 <span data-stat="bingoLines">0</span> 条线 · 点击去打卡 ›</div>
      </div>
    `)}`),

  // 03 提示词编辑器
  editor: () => shell('editor', '', `
    ${toolbar({
      title: '<input class="title-input" id="edTitle" placeholder="给提示词起个标题" />',
      right: `<span class="text-xs text-muted" id="edSaved">未保存</span>
              <button class="icon-btn small" data-action="editor-more" aria-label="更多操作">${icons.more}</button>`
    })}
    <div class="editor-tabs">
      <div class="editor-tab active" data-tab="edit">编辑</div>
      <div class="editor-tab" data-tab="debug" data-action="go" data-target="debug">调试</div>
      <div class="editor-tab" data-tab="version" data-action="editor-versions">版本</div>
    </div>
    ${scroll(`
      <div class="list-item" data-action="role-pick">
        <span>角色：<span class="text-bold" id="edRoleName">未设置</span></span><span class="text-muted">${icons.chevron}</span>
      </div>

      <div class="editor-box mt-3">
        <span class="tag">System</span>
        <div class="content editable" id="edSystem" contenteditable="true"
             data-placeholder="系统提示词：给 AI 设定角色、语气与约束…"></div>
      </div>

      <div class="editor-box">
        <span class="tag">User</span>
        <div class="content editable" id="edUser" contenteditable="true"
             data-placeholder="用户提示词：你真正要问的那句话…"></div>
      </div>

      <div class="editor-box">
        <div class="text-bold text-sm">变量（每行一条：变量名=默认值）</div>
        <div class="content editable mt-2" id="edVars" contenteditable="true"
             data-placeholder="产品名=便携咖啡杯&#10;卖点=30 秒速冷"></div>
      </div>

      <div class="editor-box">
        <div class="row between">
          <span class="text-bold text-sm">最终Prompt预览</span>
          <span class="text-xs text-primary" data-action="copy-preview">一键复制</span>
        </div>
        <div class="content text-muted mt-2" id="edPreview">填写上方内容后自动生成…</div>
      </div>
    `)}
    <div class="editor-bottom">
      <span class="text-xs text-muted" id="edCount">0 字 ≈ 0 Token</span>
      <div class="row gap-2">
        <button class="btn ghost" data-action="save-prompt">保存</button>
        <button class="btn" data-action="go" data-target="debug">去调试</button>
      </div>
    </div>`),

  // 04 AI 调试面板
  debug: () => shell('debug', '', `
    ${toolbar({
      title: 'AI 调试台',
      right: `<button class="icon-btn small" data-action="clear-chat" aria-label="清空对话">${icons.more}</button>`
    })}
    <div class="config-row">
      <div class="model-pill" data-action="model" id="modelPill">qwen-plus <span class="text-muted">${icons.chevron}</span></div>
      <span class="text-xs text-muted" id="keySource">—</span>
    </div>
    <div class="chat-area" id="chatArea">
      <div class="bubble-ai">
        把你在编辑器里写好的提示词拿过来跑一跑。<br>
        我会把它作为 System 指令，你在这里说的每句话都会真实调用模型。
        <div class="actions">
          <span data-action="use-prompt">载入编辑器提示词</span>
          <span data-action="clear-chat">清空对话</span>
        </div>
      </div>
    </div>
    <div class="input-bar">
      <input class="input" id="chatInput" placeholder="继续追问，Enter 发送" />
      <button class="send-btn" data-action="send">${icons.send}</button>
    </div>`),

  // 05 模板素材库
  library: () => shell('library', '', `
    <div class="toolbar">
      <div class="toolbar-title" style="text-align:left;font-size:20px;font-weight:700">素材库</div>
      <span class="text-xs text-muted" id="libCount">0 条</span>
    </div>
    <div style="padding:0 16px">
      <div class="search-box">${icons.search}<input id="libSearch" placeholder="搜索标题 / 内容" /></div>
    </div>
    ${scroll(`
      <div class="lib-grid" id="libGrid">
        <div class="text-xs text-muted">加载中…</div>
      </div>
      <div class="action-bar">
        <button class="btn block" data-action="new-prompt">+ 新建提示词</button>
        <button class="btn ghost block" data-action="go" data-target="workbench">返回工作台</button>
      </div>
    `)}`)
};

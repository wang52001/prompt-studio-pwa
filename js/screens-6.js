// 06：PromptOps 评测模块（合并后的容器，内容由 ops/js/app.js 渲染）
import { shell, scroll } from './helpers.js';

export const screens6 = {
  // LLM 评测与回归平台
  ops: () => shell('ops', '', scroll(`
    <div class="ops-root" id="opsRoot">
      <nav id="opsNav" class="ops-nav" hidden>
        <div class="ops-nav-pill">
          <a class="ops-nav-item" data-tab="home" href="#/ops/">
            <span class="ops-nav-ico" data-ico="chart"></span><span>评测</span>
          </a>
          <a class="ops-nav-item" data-tab="data" href="#/ops/data">
            <span class="ops-nav-ico" data-ico="db"></span><span>数据集</span>
          </a>
          <a class="ops-nav-item" data-tab="library" href="#/ops/library">
            <span class="ops-nav-ico" data-ico="branch"></span><span>版本库</span>
          </a>
        </div>
      </nav>
      <div id="opsApp" class="ops-body">
        <div class="empty">正在加载评测台…</div>
      </div>
      <div id="opsToast" class="ops-toast" hidden></div>
    </div>`)),

  // 公开分享页（免登录只读）
  share: () => shell('share', '', `
    <div class="toolbar">
      <span style="width:20px"></span>
      <div class="toolbar-title">共享提示词</div>
      <span style="width:20px"></span>
    </div>
    ${scroll(`
      <div id="shareBody">
        <div class="text-xs text-muted" style="padding:24px 2px;text-align:center">加载中…</div>
      </div>
      <div class="action-bar">
        <button class="btn block" data-action="share-fork">复制到我的素材库</button>
        <button class="btn ghost block" data-action="share-home">去工作台</button>
      </div>
      <div class="text-xs text-muted mt-3" style="line-height:1.7">
        这是别人分享的只读提示词，复制一份到自己的素材库后就能编辑。
      </div>
    `)}`)
};

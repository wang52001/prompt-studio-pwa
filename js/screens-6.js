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
    </div>`))
};

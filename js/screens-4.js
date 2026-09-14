// 16 – 20：设置页 / API 密钥 / 统计分析 / 批量测试 / 离线状态页
import { shell, scroll, toolbar, listItem } from './helpers.js';

export const screens4 = {
  // 16 设置页
  settings: () => shell('settings', '', `
    ${toolbar({ title: '设置' })}
    ${scroll(`
      <div class="group-title">AI 设置</div>
      ${listItem('模型服务&nbsp;&nbsp;&nbsp;阿里云百炼', 'toast')}
      <div class="mt-2"></div>
      ${listItem('默认参数&nbsp;&nbsp;&nbsp;T 0.7 / 流式', 'toast')}
      <div class="mt-2"></div>
      ${listItem('密钥状态&nbsp;&nbsp;&nbsp;服务端托管', 'go:apikeys')}

      <div class="group-title">外观</div>
      ${listItem('主题模式&nbsp;&nbsp;&nbsp;深色', 'toast')}
      <div class="color-swatches mt-2">
        <div class="swatch active" style="background:#4F8CFF" data-action="theme" data-color="#4F8CFF"></div>
        <div class="swatch" style="background:#9B6DFF" data-action="theme" data-color="#9B6DFF"></div>
        <div class="swatch" style="background:#FBBF24" data-action="theme" data-color="#FBBF24"></div>
        <div class="swatch" style="background:#34D399" data-action="theme" data-color="#34D399"></div>
      </div>
      <div class="mt-2"></div>
      ${listItem('字体大小&nbsp;&nbsp;&nbsp;中', 'toast')}

      <div class="group-title">账户</div>
      <div class="card">
        <div class="text-sm">登录邮箱&nbsp;&nbsp;<span data-user="email">—</span></div>
      </div>
      <div class="mt-2"></div>
      ${listItem('数据导出 / 导入', 'toast')}
      <div class="mt-2"></div>
      ${listItem('离线缓存管理', 'toast')}

      <div class="group-title">关于</div>
      ${listItem('版本号&nbsp;&nbsp;&nbsp;v1.1.0', 'toast')}
      <div class="mt-2"></div>
      ${listItem('隐私政策 / 用户协议', 'toast')}
      <div class="mt-2"></div>
      ${listItem('更新日志', 'toast')}

      <button class="logout-btn mt-4" data-action="logout">退出登录</button>
    `)}`),

  // 17 API 密钥管理
  apikeys: () => shell('apikeys', '', `
    ${toolbar({ title: 'API 密钥管理' })}
    ${scroll(`
      <div class="security-banner">AI 密钥保存在服务端环境变量中，浏览器永远拿不到，也不会出现在任何响应里。</div>

      <div class="card key-card">
        <div class="text-sm text-bold">阿里云百炼 DashScope&nbsp;&nbsp;·&nbsp;&nbsp;<span class="text-success">已连接</span>&nbsp;·&nbsp;默认</div>
        <div class="text-sm text-muted mt-2">sk-**** **** **** (服务端)</div>
        <div class="ops">可用模型&nbsp;&nbsp;&nbsp;&nbsp;qwen-turbo / plus / max</div>
      </div>

      <div class="card">
        <div class="text-xs text-muted" style="line-height:1.7">
          想换模型服务商：在 Cloudflare Pages 项目里改环境变量
          <b>DASHSCOPE_API_KEY</b>，重新部署即可，前端无需改动。
        </div>
      </div>
    `)}`),

  // 18 统计分析
  stats: () => shell('stats', '', `
    ${toolbar({ title: '统计分析' })}
    ${scroll(`
      <div class="card chart-card">
        <div class="text-sm text-bold">近 7 日调用趋势&nbsp;&nbsp;次数 / Token</div>
        <div class="mt-2" id="trendChart"><div class="text-xs text-muted">加载中…</div></div>
      </div>

      <div class="card chart-card">
        <div class="chart-donut">
          <div id="donutWrap"></div>
          <div class="chart-legend" id="modelLegend">
            <div class="text-sm text-bold">模型使用占比</div>
            <div class="text-xs text-muted">暂无数据</div>
          </div>
        </div>
      </div>

      <div class="card chart-card">
        <div class="text-sm text-bold">近 7 日 Token 消耗</div>
        <div class="bars mt-3" id="tokenBars"></div>
      </div>

      <div class="card chart-card">
        <div class="row between">
          <span class="text-xs text-muted">费用估算（按 qwen-plus 计费粗算，非真实账单）</span>
          <span style="font-size:20px;font-weight:700;color:var(--warning)" data-stat="cost">¥ 0</span>
        </div>
      </div>

      <div class="group-title">最近调用记录</div>
      <div class="card" id="recentLogs">
        <div class="text-xs text-muted">加载中…</div>
      </div>
    `)}`),

  // 19 批量测试
  batchtest: () => shell('batchtest', '', `
    ${toolbar({ title: '批量测试' })}
    ${scroll(`
      <div class="card">
        <div class="text-sm text-bold">提示词版本（2）</div>
        <div class="list-item prompt-version active mt-3" style="background:var(--bg)">
          <span class="text-primary">V1&nbsp;&nbsp;简洁版</span><span class="text-muted">›</span>
        </div>
        <div class="list-item prompt-version mt-2" style="background:var(--bg)">
          <span>V2&nbsp;&nbsp;带角色设定</span><span class="text-muted">›</span>
        </div>
      </div>

      <div class="card mt-3">
        <div class="text-sm text-bold">测试变量（2 组 × 2 值 = 4 组合）</div>
        <div class="row gap-2 mt-3">
          <span class="chip" style="background:var(--surface-soft);color:var(--primary)">产品名 × 2</span>
          <span class="chip">卖点 × 2</span>
        </div>
      </div>

      <div class="card mt-3">
        <div class="text-sm text-bold">结果对比</div>
        <div class="test-table text-muted mt-2">版本&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;创意&nbsp;&nbsp;&nbsp;准确&nbsp;&nbsp;&nbsp;完整&nbsp;&nbsp;AI评分</div>
        <div class="test-table mt-2">V1&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;7.2&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;7.8&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;6.9&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;7.3</div>
        <div class="test-table text-success">V2&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8.6&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8.1&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8.9&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8.5</div>
      </div>

      <button class="btn block mt-3" data-action="toast" data-msg="批量测试正在开发中，可先用调试台手动对比">开始批量测试</button>
      <button class="btn ghost block mt-2" data-action="go" data-target="debug">去调试台</button>
    `)}`),

  // 20 离线状态页
  offline: () => shell('offline', '', `
    <div class="offline-banner">当前离线：AI 调试不可用，编辑与素材库可正常使用</div>
    ${scroll(`
      <div class="group-title" style="color:var(--success)">离线可用</div>
      <div class="list-item offline-available" data-action="go" data-target="editor"><span>提示词编辑器</span><span class="text-success">可用</span></div>
      <div class="mt-2"></div>
      <div class="list-item offline-available" data-action="go" data-target="library"><span>模板素材库</span><span class="text-success">可用</span></div>
      <div class="mt-2"></div>
      <div class="list-item offline-available" data-action="go" data-target="silly"><span>沙雕生成器（本地词库）</span><span class="text-success">可用</span></div>
      <div class="mt-2"></div>
      <div class="list-item offline-available" data-action="go" data-target="badges"><span>成就查看</span><span class="text-success">可用</span></div>

      <div class="group-title">需要联网</div>
      <div class="list-item offline-unavailable"><span>AI 调试台</span><span>不可用</span></div>
      <div class="mt-2"></div>
      <div class="list-item offline-unavailable"><span>竞技场</span><span>不可用</span></div>
      <div class="mt-2"></div>
      <div class="list-item offline-unavailable"><span>扭蛋机 / 社区</span><span>不可用</span></div>

      <div class="text-xs text-warning mt-4" style="line-height:1.6">提示词保存后会同步到云端，换设备登录同一账号即可继续。</div>

      <button class="btn block mt-3" data-action="retry-connect">重试连接</button>
    `)}`)
};

// 16 – 20：设置页 / API 密钥 / 统计分析 / 批量测试 / 离线状态页
import { shell, scroll, toolbar, listItem } from './helpers.js';

const donut = `<svg width="110" height="110" viewBox="0 0 110 110" fill="none">
  <circle cx="55" cy="55" r="40" stroke="#2A2E37" stroke-width="17"/>
  <circle cx="55" cy="55" r="40" stroke="#4F8CFF" stroke-width="17" stroke-dasharray="125 126" stroke-dashoffset="0" transform="rotate(-90 55 55)"/>
  <circle cx="55" cy="55" r="40" stroke="#9B6DFF" stroke-width="17" stroke-dasharray="80 171" stroke-dashoffset="-125" transform="rotate(-90 55 55)"/>
  <circle cx="55" cy="55" r="40" stroke="#34D399" stroke-width="17" stroke-dasharray="46 205" stroke-dashoffset="-205" transform="rotate(-90 55 55)"/>
</svg>`;

const lineChart = `<svg width="100%" height="92" viewBox="0 0 326 92" fill="none" preserveAspectRatio="none">
  <polyline points="6,72 46,54 86,62 126,40 166,48 206,26 246,34 286,16 320,24" stroke="#4F8CFF" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="6,80 46,72 86,74 126,62 166,66 206,54 246,58 286,48 320,52" stroke="#9B6DFF" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export const screens4 = {
  // 16 设置页
  settings: () => shell('settings', '', `
    ${toolbar({ title: '设置' })}
    ${scroll(`
      <div class="group-title">AI 设置</div>
      ${listItem('默认模型&nbsp;&nbsp;&nbsp;DeepSeek-V3', 'toast')}
      <div class="mt-2"></div>
      ${listItem('默认参数&nbsp;&nbsp;&nbsp;T 0.7 / Top P 1.0', 'toast')}
      <div class="mt-2"></div>
      ${listItem('API 密钥管理&nbsp;&nbsp;&nbsp;3 个', 'go:apikeys')}

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

      <div class="group-title">数据与存储</div>
      <div class="card">
        <div class="text-sm">本地存储用量&nbsp;&nbsp;18.4 MB / 50 MB</div>
        <div class="profile-track" style="margin-top:8px"><div class="profile-track-fill" style="width:37%"></div></div>
      </div>
      <div class="mt-2"></div>
      ${listItem('离线缓存管理', 'toast')}
      <div class="mt-2"></div>
      ${listItem('数据导出 / 导入', 'toast')}

      <div class="group-title">通知</div>
      ${listItem('推送通知&nbsp;&nbsp;&nbsp;已开启', 'toast')}
      <div class="mt-2"></div>
      ${listItem('每日锦鲤提醒&nbsp;&nbsp;&nbsp;09:00', 'toast')}
      <div class="mt-2"></div>
      ${listItem('竞技场赛季提醒', 'toast')}

      <div class="group-title">关于</div>
      ${listItem('版本号&nbsp;&nbsp;&nbsp;v1.0.0', 'toast')}
      <div class="mt-2"></div>
      ${listItem('隐私政策 / 用户协议', 'toast')}
      <div class="mt-2"></div>
      ${listItem('更新日志', 'toast')}
    `)}`),

  // 17 API 密钥管理
  apikeys: () => shell('apikeys', '', `
    ${toolbar({ title: 'API 密钥管理' })}
    ${scroll(`
      <div class="security-banner">密钥仅存储在本地浏览器，不会上传到服务器</div>

      <div class="card key-card">
        <div class="text-sm text-bold">DeepSeek&nbsp;&nbsp;·&nbsp;&nbsp;<span class="text-success">已连接</span>&nbsp;·&nbsp;默认</div>
        <div class="text-sm text-muted mt-2">sk-**** **** **** 7f3a</div>
        <div class="ops">测试连接&nbsp;&nbsp;&nbsp;&nbsp;设为默认&nbsp;&nbsp;&nbsp;&nbsp;<span class="text-danger">删除</span></div>
      </div>

      <div class="card key-card">
        <div class="text-sm text-bold">智谱 GLM&nbsp;&nbsp;·&nbsp;&nbsp;<span class="text-success">已连接</span></div>
        <div class="text-sm text-muted mt-2">sk-**** **** **** 2b9c</div>
        <div class="ops">测试连接&nbsp;&nbsp;&nbsp;&nbsp;设为默认&nbsp;&nbsp;&nbsp;&nbsp;<span class="text-danger">删除</span></div>
      </div>

      <div class="card key-card danger">
        <div class="text-sm text-bold text-danger">OpenAI 兼容&nbsp;&nbsp;·&nbsp;&nbsp;已失效</div>
        <div class="text-sm text-muted mt-2">sk-**** **** **** d401</div>
        <div class="ops">重新测试&nbsp;&nbsp;&nbsp;&nbsp;编辑&nbsp;&nbsp;&nbsp;&nbsp;<span class="text-danger">删除</span></div>
      </div>

      <button class="btn block mt-3" data-action="toast" data-msg="添加密钥：选择服务商 → 输入 Key → 测试连接 → 保存">+ 添加密钥</button>
    `)}`),

  // 18 统计分析
  stats: () => shell('stats', '', `
    ${toolbar({ title: '统计分析' })}
    <div class="row gap-2" style="padding:0 16px 8px">
      <span class="text-sm text-muted">今日</span>
      <span class="text-sm text-primary text-bold">本周</span>
      <span class="text-sm text-muted">本月</span>
      <span class="text-sm text-muted">自定义</span>
    </div>
    ${scroll(`
      <div class="card chart-card">
        <div class="text-sm text-bold">调用趋势&nbsp;&nbsp;次数 / Token</div>
        <div class="mt-2">${lineChart}</div>
      </div>

      <div class="card chart-card">
        <div class="chart-donut">
          ${donut}
          <div class="chart-legend">
            <div class="text-sm text-bold">模型使用占比</div>
            <div class="text-xs text-primary">DeepSeek-V3&nbsp;&nbsp;&nbsp;50%</div>
            <div class="text-xs text-secondary">GLM-4&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;32%</div>
            <div class="text-xs text-success">Qwen-Max&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;18%</div>
          </div>
        </div>
      </div>

      <div class="card chart-card">
        <div class="text-sm text-bold">Token 消耗&nbsp;&nbsp;输入 / 输出</div>
        <div class="bars mt-3">
          <div class="bar" style="height:44px"></div>
          <div class="bar" style="height:62px"></div>
          <div class="bar" style="height:36px"></div>
          <div class="bar" style="height:74px"></div>
          <div class="bar" style="height:52px"></div>
        </div>
      </div>

      <div class="card chart-card">
        <div class="row between">
          <span class="text-xs text-muted">费用估算（非真实账单）</span>
          <span style="font-size:20px;font-weight:700;color:var(--warning)">¥ 6.82</span>
        </div>
      </div>

      <div class="group-title">最近调用记录</div>
      <div class="card">
        <div class="row between text-xs"><span class="text-muted">15:02 · DeepSeek-V3</span><span>96 / 412 · 1.8s · <span class="text-success">成功</span></span></div>
        <div class="row between text-xs mt-2"><span class="text-muted">14:47 · GLM-4</span><span>120 / 388 · 2.1s · <span class="text-success">成功</span></span></div>
        <div class="row between text-xs mt-2"><span class="text-muted">14:20 · Qwen-Max</span><span>88 / 0 · 0.4s · <span class="text-danger">429 限流</span></span></div>
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
        <div class="text-xs text-primary mt-3" data-action="toast" data-msg="查看该单元格的完整 AI 回复">点击查看任意单元格的完整 AI 回复 ›</div>
      </div>

      <button class="btn block mt-3" data-action="toast" data-msg="批量测试进行中… 4/4 组合已完成">开始批量测试</button>
      <button class="btn ghost block mt-2" data-action="toast" data-msg="已导出对比报告">导出报告</button>
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

      <div class="text-xs text-warning mt-4" style="line-height:1.6">离线编辑的内容已自动标记「待同步」，联网后自动上传（3 条待同步）</div>

      <button class="btn block mt-3" data-action="retry-connect">重试连接</button>
    `)}`)
};

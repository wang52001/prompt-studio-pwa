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
      ${listItem('主题模式&nbsp;&nbsp;&nbsp;<span id="setThemeLabel">深色</span>', 'toast')}
      <div class="color-swatches mt-2">
        <div class="swatch active" style="background:#4F8CFF" data-action="theme" data-color="#4F8CFF"></div>
        <div class="swatch" style="background:#9B6DFF" data-action="theme" data-color="#9B6DFF"></div>
        <div class="swatch" style="background:#FBBF24" data-action="theme" data-color="#FBBF24"></div>
        <div class="swatch" style="background:#34D399" data-action="theme" data-color="#34D399"></div>
      </div>
      <div class="mt-2"></div>
      <div class="group-title">字体大小（云端同步）</div>
      <div class="row gap-2" id="fontTabs">
        <span class="chip" data-set-font="small">小</span>
        <span class="chip" data-set-font="medium">中</span>
        <span class="chip" data-set-font="large">大</span>
      </div>
      <div class="group-title">消息通知</div>
      ${listItem('新徽章 / 打卡提醒&nbsp;&nbsp;&nbsp;<span id="setNotifyLabel">开</span>', 'toggle-notify')}

      <div class="group-title">账户</div>
      <div class="card">
        <div class="text-sm">登录邮箱&nbsp;&nbsp;<span data-user="email">—</span></div>
      </div>
      <div class="mt-2"></div>
      ${listItem('数据导出（JSON）', 'export-data')}
      <div class="mt-2"></div>
      ${listItem('离线缓存管理', 'toast')}

      <div class="group-title">关于</div>
      ${listItem('版本号&nbsp;&nbsp;&nbsp;v1.2.0', 'toast')}
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
      <div class="security-banner">密钥经 AES-GCM 加密后存在服务端，浏览器拿不到明文，也不会出现在任何响应里。</div>

      <div id="keyList"><div class="text-xs text-muted">加载中…</div></div>

      <button class="btn block mt-3" data-action="key-add">+ 添加密钥</button>

      <div class="card mt-3">
        <div class="text-xs text-muted" style="line-height:1.7">
          添加后调试台会<b>优先用你自己的密钥</b>，费用走你自己的账号；<br>
          没添加也没关系，会回退到应用内置的服务端密钥。<br>
          支持任何 OpenAI 兼容接口（百炼 / DeepSeek / GLM / OpenAI / Kimi / 自建）。
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

  // 19 批量测试（真实调用模型，结果存后端）
  batchtest: () => shell('batchtest', '', `
    ${toolbar({ title: '批量测试' })}
    ${scroll(`
      <div class="card">
        <div class="text-sm text-bold">提示词版本（用 \${变量名} 占位）</div>

        <div class="mt-3">
          <div class="text-xs text-muted">V1 · 简洁版</div>
          <textarea class="input" id="btV1Sys" rows="2" placeholder="V1 系统提示（可留空）" style="margin-top:4px">你是一位资深文案。</textarea>
          <textarea class="input" id="btV1User" rows="2" placeholder="V1 用户提示" style="margin-top:6px">为 \${product} 写一句 \${style} 的广告语。</textarea>
        </div>

        <div class="mt-3">
          <div class="text-xs text-muted">V2 · 带角色设定</div>
          <textarea class="input" id="btV2Sys" rows="2" placeholder="V2 系统提示（可留空）" style="margin-top:4px">你是一位拿过戛纳金狮的文案总监，只说人话。</textarea>
          <textarea class="input" id="btV2User" rows="2" placeholder="V2 用户提示" style="margin-top:6px">为 \${product} 写一句 \${style} 的广告语，20 字以内。</textarea>
        </div>
      </div>

      <div class="card mt-3">
        <div class="text-sm text-bold">测试变量（每行一个值）</div>
        <div class="mt-2">
          <div class="text-xs text-muted">变量名：product</div>
          <textarea class="input" id="btVarProduct" rows="2" style="margin-top:4px">智能保温杯
便携咖啡机</textarea>
        </div>
        <div class="mt-2">
          <div class="text-xs text-muted">变量名：style</div>
          <textarea class="input" id="btVarStyle" rows="2" style="margin-top:4px">幽默
极简</textarea>
        </div>
        <div class="text-xs text-muted mt-2">最多 3 个版本 × 4 组变量 = 8 次调用，超出部分自动截断。</div>
      </div>

      <div class="card mt-3">
        <div class="text-sm text-bold">结果对比（AI 裁判打分 0–10）</div>
        <div id="btResult" class="mt-2"><div class="text-xs text-muted">点下方按钮开始，结果会存到云端</div></div>
      </div>

      <button class="btn block mt-3" data-action="batch-run" id="btRun">开始批量测试</button>
      <button class="btn ghost block mt-2" data-action="batch-history">查看历史记录</button>
      <button class="btn ghost block mt-2" data-action="go" data-target="debug">去调试台</button>
    `)}`),

  // 22 灵感值流水
  credits: () => shell('credits', '', `
    ${toolbar({ title: '灵感值流水' })}
    ${scroll(`
      <div class="card">
        <div class="text-xs text-muted">当前余额</div>
        <div style="font-size:26px;font-weight:700;color:var(--primary)" id="creditsBalance">—</div>
      </div>
      <div class="group-title">收支明细（最近 50 条）</div>
      <div id="creditsList"><div class="text-xs text-muted">加载中…</div></div>
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

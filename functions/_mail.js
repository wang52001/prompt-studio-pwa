// 邮件发送（下划线开头，不会被当作路由）
// 目前支持：Resend API。未配置密钥时，若 MAIL_MODE=dev 则只在服务端记录日志供本地调试。

const enc = new TextEncoder();

const toHex = (buf) =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function sha256(s) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** 生成 6 位数字验证码 */
export function randomCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, '0');
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function buildEmail(code) {
  const c = `${code.slice(0, 3)} ${code.slice(3)}`;
  return {
    subject: `${code} · Prompt Studio 登录验证码`,
    html: `<!DOCTYPE html><html lang="zh-CN"><body style="margin:0;padding:0;background:#F4F6FB">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#fff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif">
        <tr><td style="padding:28px 28px 0">
          <div style="font-size:13px;color:#8A93A6;letter-spacing:.5px">PROMPT STUDIO</div>
          <div style="font-size:20px;font-weight:700;color:#0F1115;margin-top:6px">登录验证码</div>
          <div style="font-size:14px;color:#4A5262;line-height:1.7;margin-top:10px">
            你正在登录「提示词工坊」，请在 App 中填入下面的 6 位验证码完成登录。
          </div>
        </td></tr>
        <tr><td style="padding:22px 28px">
          <div style="background:#F2F5FF;border:1px solid #DDE5FF;border-radius:12px;padding:22px;text-align:center">
            <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#2540CC">${c}</div>
          </div>
          <div style="font-size:12px;color:#8A93A6;line-height:1.7;margin-top:16px">
            验证码 10 分钟内有效，最多可尝试 5 次。<br>
            如果不是你本人操作，忽略这封邮件即可，你的账号仍然是安全的。
          </div>
        </td></tr>
        <tr><td style="padding:16px 28px 26px;border-top:1px solid #EEF1F7">
          <div style="font-size:11px;color:#A8B0C0">本邮件由系统自动发送，请勿回复。</div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`,
    text: `你的 Prompt Studio 登录验证码是 ${code}，10 分钟内有效。如果这不是你本人操作，请忽略此邮件。`
  };
}

/**
 * 发送验证码邮件。
 * @returns {{ ok: boolean, provider: string, devCode?: string }}
 */
export async function sendLoginCode(env, email, code) {
  const { html, text, subject } = buildEmail(code);

  // 本地 / 未配置时的降级模式：不发信，把验证码带回给调用方（仅当 MAIL_MODE=dev）
  const key = env.RESEND_API_KEY;
  const from = env.MAIL_FROM || 'Prompt Studio <onboarding@resend.dev>';

  if (!key) {
    if (env.MAIL_MODE === 'dev') {
      console.log(`[mail:dev] ${email} -> ${code}`);
      return { ok: true, provider: 'dev', devCode: code };
    }
    return { ok: false, provider: 'none', error: '邮件服务未配置：缺少 RESEND_API_KEY' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject, html, text })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend 发送失败 ${res.status}: ${t.slice(0, 200)}`);
  }
  return { ok: true, provider: 'resend' };
}

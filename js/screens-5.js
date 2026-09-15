// 21：登录 / 注册（邮箱验证码为主，密码为备选）
import { logoPencil } from './icons.js';
import { shell } from './helpers.js';

export const screens5 = {
  login: () => shell('login', '', `
    <div class="screen-scroll">
      <div class="auth-wrap">
        <div class="auth-logo">${logoPencil}</div>
        <div class="auth-title">Prompt Studio</div>
        <div class="auth-sub">提示词工坊 · 数据云端同步</div>

        <div class="auth-seg">
          <div class="auth-seg-item active" id="tabCode" data-action="auth-mode" data-mode="code">验证码登录</div>
          <div class="auth-seg-item" id="tabPwd" data-action="auth-mode" data-mode="password">密码登录</div>
        </div>

        <div class="card auth-card">
          <div class="auth-row">
            <input class="auth-input" id="authEmail" type="email" inputmode="email"
                   placeholder="邮箱" autocomplete="email" />
            <button class="btn auth-code-btn" id="authSendCode">获取验证码</button>
          </div>

          <input class="auth-input auth-code" id="authCode" type="text"
                 inputmode="numeric" pattern="[0-9]*" maxlength="6"
                 placeholder="6 位验证码" autocomplete="one-time-code" />

          <input class="auth-input" id="authPassword" type="password"
                 placeholder="密码" autocomplete="current-password" hidden />

          <input class="auth-input" id="authNickname" type="text"
                 placeholder="昵称（选填，不填用邮箱前缀）" autocomplete="nickname" maxlength="20" />

          <div class="auth-msg" id="authMsg"></div>

          <button class="btn block" id="authSubmit" data-mode="code">登录 / 注册</button>

          <div class="auth-switch">
            <span id="authToggle" class="text-primary">还没账号？输入邮箱即可自动创建</span>
          </div>
        </div>

        <div class="auth-tip text-xs text-muted">
          验证码 10 分钟内有效，同一邮箱每小时最多 10 封。<br>
          首次登录后可在「我的」里设置密码，之后也能用密码登录。
        </div>
      </div>
    </div>
  `)
};

export default screens5;

// 21：登录 / 注册
import { logoPencil } from './icons.js';
import { shell } from './helpers.js';

export const screens5 = {
  login: () => shell('login', '', `
    <div class="screen-scroll">
      <div class="auth-wrap">
        <div class="auth-logo">${logoPencil}</div>
        <div class="auth-title">Prompt Studio</div>
        <div class="auth-sub">提示词工坊 · 登录后数据云端同步</div>

        <div class="card auth-card">
          <input class="auth-input" id="authEmail" type="email" inputmode="email"
                 placeholder="邮箱" autocomplete="email" />
          <input class="auth-input" id="authNickname" type="text"
                 placeholder="昵称（选填）" autocomplete="nickname" hidden />
          <input class="auth-input" id="authPassword" type="password"
                 placeholder="密码，至少 6 位" autocomplete="current-password" />

          <div class="auth-msg" id="authMsg"></div>

          <button class="btn block" id="authSubmit" data-mode="login">登录</button>
          <div class="auth-switch">
            <span id="authToggle" class="text-primary">还没有账号？注册一个</span>
          </div>
        </div>

        <div class="auth-tip text-xs text-muted">
          账号与提示词存于你自己的数据库；AI 密钥只保存在服务端，不下发到浏览器。
        </div>
      </div>
    </div>
  `)
};

export default screens5;

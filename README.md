# Prompt Studio 提示词工坊 · 全栈 PWA

由画布设计稿 1:1 还原的移动端 PWA。前端 21 屏 + Cloudflare Pages Functions 后端 + D1 数据库，
邮箱注册登录、提示词云端存储、AI 真实调用、乐园数据上云，全部可用。Android / iOS 双端可安装到主屏。

## 一、线上地址

**https://pwa.jdhsf.top**

| 项 | 值 |
| --- | --- |
| 托管 | Cloudflare Pages（Direct Upload） |
| 后端 | Cloudflare Pages Functions（`functions/api/[[route]].js`） |
| 数据库 | Cloudflare D1 `prompt-studio-db`（SQLite） |
| AI | 阿里云百炼 DashScope（`qwen-turbo` / `qwen-plus` / `qwen-max`） |
| 自定义域 | `pwa.jdhsf.top` |
| 备份域名 | https://prompt-studio-pwa.pages.dev |
| Cloudflare Account | `0bd1c630df5e907adf68b09c0ca6b2f0` |
| Cloudflare Zone | `e17f0499e2f59c7850704eb95e4e2bfc`（`jdhsf.top`） |

## 二、登录方式

**主流程：邮箱验证码登录。** 输入邮箱 → 收 6 位验证码 → 登录，首次登录自动建号。
登录成功后可以到「我的 → 登录密码」设置密码，之后也能用 邮箱 + 密码 登录。

| 环节 | 策略 |
| --- | --- |
| 验证码 | 6 位随机数字，服务端只存 `SHA256(salt + code)` |
| 有效期 | 10 分钟，单个码最多尝试 5 次 |
| 频率限制 | 同一邮箱 60 秒重发冷却、每小时最多 10 封 |
| 会话 | 随机 32 字节 Token 存 D1，Cookie 有效期 30 天 |
| 密码 | PBKDF2-SHA256，10 万次迭代 + 每用户独立盐，只存哈希 |
| 未验证邮箱不能注册 | 已移除旧的「邮箱+密码直接注册」接口，账号只能由验证码创建 |

> 没有配邮件服务时（`RESEND_API_KEY` 缺失且 `MAIL_MODE≠dev`），发送接口会明确报错，不会假装成功。

## 三、已实现的真实能力

| 功能 | 说明 |
| --- | --- |
| 邮箱验证码登录 | 6 位验证码，10 分钟有效；首次登录自动建号；成功后可自行设置密码 |
| 提示词云端 CRUD | 新建 / 保存 / 删除 / 搜索，按账号隔离，换设备登录即可继续 |
| 变量替换预览 | `${变量名}` 自动填充，实时生成最终 Prompt 与 Token 估算 |
| AI 真实调用 | 调试台 SSE 流式输出；编辑器 System 指令自动注入；可切 qwen-turbo / plus / max |
| 用量统计 | 每次调用的输入 / 输出 Token 落库，统计页趋势图、模型占比、费用估算均为真实数据 |
| 扭蛋机 | 奖池与概率在服务端，扣灵感值、写抽卡记录，可查历史 |
| Bingo 打卡 | 25 格状态按月存云端，刷新 / 换设备不丢 |
| 竞技场 | 裁判模型对你的提示词与基线提示词分别打分，胜出 +20 灵感值 |
| 灵感值体系 | 注册送 500，抽卡 -10，竞技场胜出 +20 |
| **自带 AI 密钥** | 在「我的 → API 密钥管理」里填自己的 Key，调试台优先用它、费用走自己账号；删掉自动回退内置 Key |

### 自带 AI 密钥（用户密钥管理）

每个用户都能在 App 内添加自己的大模型 Key，后端用 **AES-GCM** 加密后存 D1。

| 环节 | 策略 |
| --- | --- |
| 存储 | AES-256-GCM 加密，密钥来自 Pages Secret `KEYS_ENC_KEY`（32 字节 hex / 64 字符），每条记录独立 IV |
| 传输 | 只在「添加」时提交一次明文，之后所有响应只返回脱敏的 `key_hint`（如 `sk-****4f2a`） |
| 使用 | 调试台优先取 `is_default=1` 的用户密钥；没有才回退到服务端内置 `DASHSCOPE_API_KEY` |
| 校验 | 保存前强制「测试连接」，连不通就拦下并给出上游原文原因 |
| 支持的服务商 | 阿里云百炼 / DeepSeek / 智谱 GLM / OpenAI / Moonshot Kimi / 自定义（任意 OpenAI 兼容地址） |

调试台顶部会实时显示当前用的是「自有密钥」还是「内置密钥」。

手动测试账号可在 App 内直接注册，无需后台开通。

## 四、部署 / 更新

```bash
cd prompt-studio-pwa
export CF_API_TOKEN=<Cloudflare API Token>

# 1) 环境变量（Secret），换值时重跑即可，无需重新部署代码
npx wrangler pages secret put DASHSCOPE_API_KEY --project-name=prompt-studio-pwa   # AI
npx wrangler pages secret put RESEND_API_KEY     --project-name=prompt-studio-pwa   # 发验证码邮件
npx wrangler pages secret put MAIL_FROM          --project-name=prompt-studio-pwa   # 如 Prompt Studio <no-reply@jdhsf.top>
npx wrangler pages secret put KEYS_ENC_KEY       --project-name=prompt-studio-pwa   # 用户密钥加密用，32字节hex

# 2) 数据库（幂等）
python3 tools/init_db.py

# 3) 部署
./tools/deploy_cf.sh      # 上传静态资源 + Functions，绑域名，等证书
```

deploy 脚本会自动完成：校验 Token → 取 Zone/Account → 确保 DNS 存在 → 部署 → 绑自定义域 → 等证书 → 验证。

Token 需要的权限：`Cloudflare Pages:Edit`、`D1:Edit`、`DNS:Edit`、`Zone:Read`。

### 邮件服务（Resend）

`functions/_mail.js` 走 Resend REST API（`POST https://api.resend.com/emails`）。

当前线上配置：

| 变量 | 值 |
| --- | --- |
| `RESEND_API_KEY` | Pages Secret |
| `MAIL_FROM` | `Prompt Studio <no-reply@jdhsf.top>` |
| 发信域名 | `jdhsf.top`（Resend 中已验证，sending enabled，region ap-northeast-1） |

重新配 / 轮换：

```bash
printf '<new-key>' | npx wrangler pages secret put RESEND_API_KEY --project-name=prompt-studio-pwa
```

> 没有配 Key 且 `MAIL_MODE≠dev` 时，发送接口直接报错，不会假装成功，也不会把验证码泄露给前端。

## 四、后端接口

全部挂在 `/api/` 下，由 `functions/api/[[route]].js` 统一路由。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/send-code` | 发送登录验证码（带冷却与频率限制） |
| POST | `/api/auth/verify-code` | 校验验证码并登录，首次自动建号 |
| POST | `/api/auth/login` | 密码登录（仅已设置密码的账号） |
| POST | `/api/auth/set-password` | 设置 / 修改密码（需登录） |
| POST | `/api/auth/logout` | 退出，清会话 |
| GET | `/api/auth/me` | 当前用户，未登录返回 `{user:null}` |
| GET/POST | `/api/prompts` | 列表 / 新建 |
| PUT/DELETE | `/api/prompts/:id` | 更新 / 删除 |
| POST | `/api/chat` | AI 对话，`stream:false` 返回 JSON，`stream:true` 返回 SSE |
| POST/GET | `/api/playground/gacha` | 抽卡 / 抽卡记录 |
| GET/PUT | `/api/playground/bingo` | 读 / 写本月打卡 |
| POST | `/api/playground/arena` | 记录对局，胜出加灵感值 |
| GET | `/api/stats` | 日趋势、模型占比、Token 汇总、最近调用 |
| GET | `/api/keys` | 我的密钥列表（只返回 `key_hint`，不返回密文）+ 支持的服务商 |
| POST | `/api/keys` | 新增密钥（服务端加密后落库） |
| POST | `/api/keys/test` | 测试连接，可传 `id`（用已存的）或直接传明文（不落库） |
| POST | `/api/keys/default` | 设为默认 |
| PUT/DELETE | `/api/keys/:id` | 改模型 / 删除 |

## 五、本地全栈调试

```bash
cd prompt-studio-pwa
cp /dev/null wrangler.toml 2>/dev/null   # 本仓库不含 wrangler.toml，按需自建

# 1) 起本地服务（自动加载 functions/ 与 D1）
npx wrangler pages dev . --d1=DB \
  -b DASHSCOPE_API_KEY=<你的Key> \
  -b MAIL_MODE=dev \            # 不真发邮件，验证码直接回给前端，便于本地自测
  --port 8788

# 2) 首次需要给本地 D1 建表（wrangler 的本地库在 .wrangler/state 下）
python3 - <<'PY'
import glob, sqlite3
s = open('tools/schema.sql').read()
for f in glob.glob('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite'):
    if 'metadata' in f: continue
    sqlite3.connect(f).executescript(s)
PY
```

打开 http://localhost:8788 即可完整体验（验证码登录 → 写提示词 → 调试 → 抽卡）。

> 生产环境务必不要设置 `MAIL_MODE=dev`，否则验证码会被下发给浏览器。

## 六、目录结构

```
prompt-studio-pwa/
├─ index.html              应用外壳
├─ manifest.webmanifest    安装元数据
├─ sw.js                   Service Worker（预缓存，/api 不缓存）
├─ _headers / _redirects   缓存与路由策略
├─ css/app.css             设计系统 + 21 屏样式
├─ js/
│  ├─ api.js               后端接口客户端（含 SSE 流式读取）
│  ├─ store.js             全局状态：用户 / 提示词 / 统计 / Bingo
│  ├─ app.js               认证、路由、编辑器、调试台、乐园、统计
│  ├─ screens.js           21 页总表
│  ├─ screens-1~5.js       页面渲染
│  ├─ helpers.js / icons.js
├─ functions/
│  ├─ _lib.js              密码哈希、会话、用量统计
│  ├─ _mail.js             验证码邮件模板与 Resend 发送
│  └─ api/[[route]].js     全部后端接口
├─ tools/
│  ├─ schema.sql           D1 表结构（含 email_codes）
│  ├─ init_db.py           远程建表（幂等）
│  └─ deploy_cf.sh         一键部署
└─ icons/ og-image.png …
```

## 七、安全说明

- 验证码：服务端只存 `SHA256(salt + code)`，10 分钟过期、最多错 5 次、用后即焚（置为已消费）。
- 频率限制：同一邮箱 60 秒重发冷却 + 每小时上限 10 封，防止被当成垃圾邮件发射器。
- 未验证邮箱无法注册：已移除旧的「邮箱+密码直接注册」入口。
- 密码：PBKDF2-SHA256，10 万次迭代 + 每用户独立盐，只存哈希。
- 会话：随机 32 字节 Token 存 D1，`HttpOnly + Secure + SameSite=Lax`，前端拿不到。
- AI 密钥：
  - 服务端内置 Key 只存在于 Pages Secret，后端注入请求头，任何响应都不会返回。
  - 用户自带 Key 用 AES-256-GCM 加密后存 D1，加密主密钥在 Pages Secret `KEYS_ENC_KEY`；
    接口只返回脱敏的 `key_hint`，明文永不出现在任何响应、日志或前端 DOM 里。
- 越权防护：所有提示词 / 密钥 / 数据查询都带 `user_id` 条件，改不了别人的记录。
- 错误状态码：业务错误统一返回 **4xx + JSON**。Cloudflare Pages 会吞掉 Functions 返回的 5xx
  并替换成自带的 `error code: 502` 纯文本页，前端拿不到任何提示，所以凡是「需要把原因告诉
  用户」的失败（密钥无效、上游报错、邮件发不出）都走 `fail()`（400）。

## 八、安装到手机

- **Android / Chrome**：访问 https://pwa.jdhsf.top → 菜单 →「安装应用」
- **iOS / Safari**：访问 → 分享 →「添加到主屏幕」

## 九、设计还原对照

| Token | 值 |
| --- | --- |
| 背景 | `#0F1115` |
| 卡片 | `#1A1D24` |
| 主色 / 辅色 | `#4F8CFF` / `#9B6DFF` |
| 成功 / 警告 / 危险 | `#34D399` / `#FBBF24` / `#F87171` |
| 圆角 | 卡片 12 · 按钮 8 · Chip 6 · 胶囊 999 |
| 间距 | 4 / 8 / 12 / 16 / 20 / 24 / 32（8pt 网格） |
| 字体 | Noto Sans SC → PingFang SC 回退 |

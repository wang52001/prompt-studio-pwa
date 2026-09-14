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

## 二、已实现的真实能力

| 功能 | 说明 |
| --- | --- |
| 邮箱注册 / 登录 | PBKDF2-SHA256 加盐哈希；httpOnly + Secure + SameSite=Lax 会话 Cookie，30 天有效 |
| 提示词云端 CRUD | 新建 / 保存 / 删除 / 搜索，按账号隔离，换设备登录即可继续 |
| 变量替换预览 | `${变量名}` 自动填充，实时生成最终 Prompt 与 Token 估算 |
| AI 真实调用 | 调试台 SSE 流式输出；编辑器 System 指令自动注入；可切 qwen-turbo / plus / max |
| 用量统计 | 每次调用的输入 / 输出 Token 落库，统计页趋势图、模型占比、费用估算均为真实数据 |
| 扭蛋机 | 奖池与概率在服务端，扣灵感值、写抽卡记录，可查历史 |
| Bingo 打卡 | 25 格状态按月存云端，刷新 / 换设备不丢 |
| 竞技场 | 裁判模型对你的提示词与基线提示词分别打分，胜出 +20 灵感值 |
| 灵感值体系 | 注册送 500，抽卡 -10，竞技场胜出 +20 |

手动测试账号可在 App 内直接注册，无需后台开通。

## 三、部署 / 更新

```bash
cd prompt-studio-pwa
export CF_API_TOKEN=<Cloudflare API Token>
export DASHSCOPE_API_KEY=<百炼 API Key>

./tools/deploy_cf.sh      # 上传静态资源 + Functions，绑域名，等证书
python3 tools/init_db.py  # 首次执行：建表（已建过则幂等）
python3 tools/set_env.py  # 首次执行：把 AI 密钥写进 Pages 环境变量（Secret）
```

脚本会自动完成：校验 Token → 取 Zone/Account → 清理冲突 DNS → 部署 → 绑自定义域 → 等证书 → 验证。

Token 需要的权限：`Cloudflare Pages:Edit`、`D1:Edit`、`DNS:Edit`、`Zone:Read`。

## 四、后端接口

全部挂在 `/api/` 下，由 `functions/api/[[route]].js` 统一路由。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册（邮箱 + 密码 + 昵称） |
| POST | `/api/auth/login` | 登录，下发 Cookie |
| POST | `/api/auth/logout` | 退出，清会话 |
| GET | `/api/auth/me` | 当前用户，未登录返回 `{user:null}` |
| GET/POST | `/api/prompts` | 列表 / 新建 |
| PUT/DELETE | `/api/prompts/:id` | 更新 / 删除 |
| POST | `/api/chat` | AI 对话，`stream:false` 返回 JSON，`stream:true` 返回 SSE |
| POST/GET | `/api/playground/gacha` | 抽卡 / 抽卡记录 |
| GET/PUT | `/api/playground/bingo` | 读 / 写本月打卡 |
| POST | `/api/playground/arena` | 记录对局，胜出加灵感值 |
| GET | `/api/stats` | 日趋势、模型占比、Token 汇总、最近调用 |

## 五、本地全栈调试

```bash
cd prompt-studio-pwa

# 1) 建本地 D1 表
npx wrangler d1 execute prompt-studio-db --local --file=tools/schema.sql

# 2) 起本地服务（自动加载 functions/ 与 D1）
npx wrangler pages dev . --d1=DB -b DASHSCOPE_API_KEY=<你的Key> --port 8788
```

打开 http://localhost:8788 即可完整体验（注册 → 写提示词 → 调试 → 抽卡）。

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
│  └─ api/[[route]].js     全部后端接口
├─ tools/
│  ├─ schema.sql           D1 表结构
│  ├─ init_db.py           远程建表
│  ├─ set_env.py           写入 Pages 环境变量
│  └─ deploy_cf.sh         一键部署
└─ icons/ og-image.png …
```

## 七、安全说明

- 密码：PBKDF2-SHA256，10 万次迭代 + 每用户独立盐，只存哈希。
- 会话：随机 32 字节 Token 存 D1，`HttpOnly + Secure + SameSite=Lax`，前端拿不到。
- AI 密钥：只存在于 Pages 环境变量（Secret），后端注入请求头，任何响应都不会返回它。
- 越权防护：所有提示词 / 数据查询都带 `user_id` 条件。

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

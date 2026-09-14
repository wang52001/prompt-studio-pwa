# Prompt Studio 提示词工坊 · PWA

由画布设计稿 1:1 还原的移动端 PWA，Android / iOS 双端可安装到主屏，离线可用。

## 一、需要服务器和域名吗？

| 项目 | 结论 |
| --- | --- |
| 后端服务器 | **不需要**。纯前端，数据存 IndexedDB / localStorage |
| 域名 | **不强制**。免费静态托管会自带 `xxx.pages.dev` 这类二级域名；想用自己的域名再单独买 |
| HTTPS | **必须**。Service Worker 只在 HTTPS（或 `localhost`）下生效 |

只有接真实大模型 API 时才需要后端或中转服务——把密钥放前端等于公开。

## 二、本地预览

SW 需要 http 环境，不能直接双击 `index.html`（ES Module 会被 file:// 拦住）。

```bash
cd prompt-studio-pwa
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
# F12 → Application → Manifest / Service Workers 可验证
```

## 三、部署到 pwa.jdhsf.top（Cloudflare Pages）

你的 `jdhsf.top` 已经在跑「接单护身符」站点（Next.js + Cloudflare 代理），所以这次用 **子域名 `pwa.jdhsf.top`**，不影响主域。

### 1. 推送代码到 GitHub

```bash
cd prompt-studio-pwa
git init && git add . && git commit -m "Prompt Studio PWA v1.0"
git branch -M main
git remote add origin https://github.com/<你的用户名>/prompt-studio-pwa.git
git push -u origin main
```

### 2. Cloudflare Dashboard 操作

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com) → Pages → 创建项目
2. 来源选刚才的 GitHub 仓库
3. **构建配置**：
   - 框架预设：`None`
   - 构建命令：留空（纯静态 HTML，不需要 build）
   - 输出目录：留空（默认根目录 `/`）
4. 保存并部署，稍等获得 `xxx.pages.dev` 临时域名
5. 进入项目 → **自定义域** → 添加 `pwa.jdhsf.top`
6. Cloudflare 会自动做：
   - 在 `jdhsf.top` 的 DNS 里加一条 `pwa` 的 CNAME 指向 Pages 项目
   - 自动签发 TLS 证书
   - 自动开启 CDN
7. 等待 1-3 分钟，访问 `https://pwa.jdhsf.top`，看到启动页即成功

> 如果 DNS 没自动加：手动在 Cloudflare DNS 里加一条 `pwa` 的 `CNAME` 记录，指向 `xxx.pages.dev`（替换为你的 Pages 临时域名），关闭 Cloudflare 代理（小云朵灰色）也可，Pages 自带 CDN。

### 3. 验证 PWA 是否生效

Chrome 打开 `https://pwa.jdhsf.top` → F12 → **Application** 面板：

- **Manifest**：name、icons、display:standalone 正确
- **Service Workers**：sw.js 已注册，状态 `activated and is running`
- **Storage**：Cache Storage 里有 `prompt-studio-v1...`

右上角地址栏或 Chrome 菜单应该出现「安装 Prompt Studio」图标。

### 4. 后续更新

每次 `git push`，Cloudflare Pages 会自动重新构建和部署。Service Worker 会在下次访问时后台更新。

## 四、其他托管平台（备用）

| 平台 | 命令 / 方式 |
| --- | --- |
| Vercel | `npm i -g vercel && vercel --prod`，然后在域名设置里加 `pwa.jdhsf.top`（CNAME 到 cname.vercel-dns.com，DNS 代理关闭） |
| Netlify | 把 `prompt-studio-pwa` 目录拖到 [app.netlify.com/drop](https://app.netlify.com/drop) |
| GitHub Pages | 仓库 Settings → Pages → Source 选 main / root；若放在子路径需改 `manifest.webmanifest` 的 `start_url` 和 `scope` |
| 腾讯云 EdgeOne Pages | 国内访问最快；若走中国大陆加速节点，需要域名 ICP 备案 |

## 五、DNS 记录速查（Cloudflare Pages）

| 类型 | 名称 | 目标 | 代理状态 |
| --- | --- | --- | --- |
| CNAME | pwa | `<你的Pages临时域名>.pages.dev` | 自动 / 灰色均可 |

不需要改 `jdhsf.top` 的 A 记录，`www`/`CDN`/`MX` 也别动。

## 六、安装到手机

- **Android / Chrome**：访问 `https://pwa.jdhsf.top` → 右上角菜单 →「安装应用」
- **iOS / Safari**：访问 → 底部分享 →「添加到主屏幕」
  - iOS 需要的 `apple-touch-icon`、`apple-mobile-web-app-capable`、`apple-mobile-web-app-title` 都已配置

## 七、目录结构

```
prompt-studio-pwa/
├─ index.html              应用外壳（状态栏 / 页面栈 / TabBar）
├─ manifest.webmanifest    安装元数据，已填 pwa.jdhsf.top
├─ sw.js                   Service Worker（预缓存 + 离线）
├─ _headers                缓存策略：sw.js / manifest 禁止长期缓存
├─ _redirects              SPA 回退：任意路径 → index.html 200
├─ robots.txt              允许爬虫
├─ sitemap.xml             站点地图
├─ og-image.png            社交分享卡（1200×630）
├─ css/app.css             设计系统：CSS 变量、20 屏样式
├─ js/
│  ├─ app.js               路由、TabBar、交互、主题色、SW 注册
│  ├─ screens.js           20 页总表 + 标题映射
│  ├─ screens-1~4.js       页面渲染（每片 5 页）
│  ├─ helpers.js           结构片段（shell / toolbar / card / btn…）
│  └─ icons.js             内联 SVG 图标（离线可用）
├─ icons/                  192 / 512 / maskable / apple-touch / favicon
├─ tools/
│  ├─ make_icons.py        PWA 图标生成
│  └─ make_og.py           社交分享卡生成
└─ README.md
```

## 八、设计还原对照

| Token | 值 |
| --- | --- |
| 背景 | `#0F1115` |
| 卡片 | `#1A1D24` |
| 主色 / 辅色 | `#4F8CFF` / `#9B6DFF` |
| 成功 / 警告 / 危险 | `#34D399` / `#FBBF24` / `#F87171` |
| 圆角 | 卡片 12 · 按钮 8 · Chip 6 · 胶囊 999 |
| 间距 | 4 / 8 / 12 / 16 / 20 / 24 / 32（8pt 网格） |
| 字体 | Noto Sans SC → PingFang SC 回退 |

## 九、当前为演示数据

扭蛋、竞技场、社区等页面均为静态演示内容，交互以 Toast 反馈。
接真实能力时只需改两处：

1. `js/app.js` 的 `sendMessage()` —— 替换为真实模型调用
2. `js/screens-*.js` 中的假数据 —— 换成 IndexedDB 读写

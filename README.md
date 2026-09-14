# Prompt Studio 提示词工坊 · PWA

由画布设计稿 1:1 还原的移动端 PWA，Android / iOS 双端可安装到主屏，离线可用。

## 一、线上地址

**https://pwa.jdhsf.top**

| 项 | 值 |
| --- | --- |
| 托管 | Cloudflare Pages（Direct Upload） |
| 自定义域 | `pwa.jdhsf.top`，已自动签发 Google Trust Services 证书 |
| 备份域名 | https://prompt-studio-pwa.pages.dev |
| Cloudflare Account | `0bd1c630df5e907adf68b09c0ca6b2f0` |
| Cloudflare Zone | `e17f0499e2f59c7850704eb95e4e2bfc`（`jdhsf.top`） |
| Pages 项目 | `prompt-studio-pwa` |
| DNS 记录 | `CNAME pwa → prompt-studio-pwa.pages.dev`（已开 CDN 代理） |

> `jdhsf.top` 根域在跑「接单护身符」，本应用走子域名，互不影响。

## 二、重新部署 / 更新

站点是 Direct Upload 模式，**不依赖 GitHub Actions**，本地一条命令即可更新：

```bash
cd prompt-studio-pwa
CF_API_TOKEN=<你的 Cloudflare API Token> ./tools/deploy_cf.sh
```

脚本会自动完成：校验 Token → 取 Zone/Account → 清理冲突 DNS → 部署 → 绑自定义域 → 等证书 → 验证。

## 三、需要的 Cloudflare Token 权限

- `Account` · `Cloudflare Pages` · **Edit**
- `Zone` · `DNS` · **Edit**
- `Zone` · `Zone` · **Read**

> 部署完成后建议到 https://dash.cloudflare.com/profile/api-tokens 吊销该 Token。

## 四、本地预览

Service Worker 需要 http 环境，不能直接双击 `index.html`。

```bash
cd prompt-studio-pwa
python3 -m http.server 8080   # 打开 http://localhost:8080
```

## 五、验证清单（已全部通过）

| 检查项 | 结果 |
| --- | --- |
| `HTTPS GET /` | HTTP/2 200，标题 `Prompt Studio 提示词工坊` |
| `manifest.webmanifest` / `sw.js` / `og-image.png` / CSS / JS | 全部 200 |
| Service Worker 缓存头 | `no-cache, no-store, must-revalidate`（更新即时生效） |
| 哈希深链 `#/gacha` | 200 |
| TLS 证书 | Google Trust Services WE1，2026-09-14 → 2026-12-13 |

浏览器打开 https://pwa.jdhsf.top → F12 → Application 面板可确认 Manifest、Service Worker、Cache Storage 三项正常。

## 六、安装到手机

- **Android / Chrome**：访问 https://pwa.jdhsf.top → 菜单 →「安装应用」
- **iOS / Safari**：访问 → 分享 →「添加到主屏幕」

## 七、目录结构

```
prompt-studio-pwa/
├─ index.html              应用外壳（状态栏 / 页面栈 / TabBar）
├─ manifest.webmanifest    安装元数据
├─ sw.js                   Service Worker（预缓存 + 离线）
├─ _headers                缓存策略：sw.js 禁止缓存
├─ _redirects              SPA 回退
├─ robots.txt / sitemap.xml
├─ og-image.png            社交分享卡 1200×630
├─ css/app.css             设计系统：CSS 变量、20 屏样式
├─ js/
│  ├─ app.js               路由、TabBar、交互、主题色、SW 注册
│  ├─ screens.js           20 页总表 + 标题映射
│  ├─ screens-1~4.js       页面渲染（每片 5 页）
│  ├─ helpers.js           结构片段
│  └─ icons.js             内联 SVG 图标（离线可用）
├─ icons/                  192 / 512 / maskable / apple-touch / favicon
└─ tools/
   ├─ make_icons.py        PWA 图标生成
   ├─ make_og.py           分享卡生成
   └─ deploy_cf.sh         一键部署脚本
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

扭蛋、竞技场、社区等页面为静态演示内容，交互以 Toast 反馈。接真实能力只需改两处：

1. `js/app.js` 的 `sendMessage()` —— 换成真实模型调用
2. `js/screens-*.js` 中的假数据 —— 换成 IndexedDB 读写

/* Prompt Studio PWA — Service Worker
   策略：预缓存 + 静态资源缓存优先；/api 一律走网络 */

const VERSION = 'v1.2.0';
const CACHE = `prompt-studio-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/api.js',
  './js/store.js',
  './js/screens.js',
  './js/screens-1.js',
  './js/screens-2.js',
  './js/screens-3.js',
  './js/screens-4.js',
  './js/screens-5.js',
  './js/helpers.js',
  './js/icons.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .catch(() => null)
      .then(() => self.skipWaiting())
  );
});

// 只清理 prompt-studio-* 自己的缓存：/ops/ 子应用有独立 SW（promptops-*），
// 按"非本版本即删除"过滤会误删子应用的缓存。
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('prompt-studio-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // /ops/ 子应用有独立 SW 接管，这里一律放行，避免两套缓存策略打架
  if (url.pathname.startsWith('/ops')) return;
  if (url.pathname.startsWith('/opsapi/')) return;

  // 后端接口：永不缓存
  if (url.pathname.startsWith('/api/')) return;
  if (req.method !== 'GET') return;

  // 导航请求：网络优先，失败回退缓存首页
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // 静态资源：缓存优先 + 后台更新
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

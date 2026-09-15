// PromptOps Service Worker：静态资源缓存优先，API 永远走网络
const CACHE = 'promptops-v3';
const ASSETS = ['./', './index.html', './css/app.css', './js/api.js', './js/app.js', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
// 只清理自己的缓存：本站同时存在主应用 SW（scope /，缓存名 prompt-studio-*），
// 若按"非本版本即删除"过滤，两个 SW 会互相清掉对方的缓存。
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('promptops-') && k !== CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
/* stale-while-revalidate：
   先返回缓存保证秒开与离线可用，同时后台拉取写入缓存，下次打开即为新版。
   纯 cache-first 会让用户永远停在旧代码上。 */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.includes('/opsapi/')) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request);
    const net = fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) cache.put(e.request, res.clone()).catch(() => {});
        return res;
      })
      .catch(() => null);
    return hit || (await net) || (await cache.match('./index.html'));
  })());
});

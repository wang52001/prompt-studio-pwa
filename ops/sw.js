// PromptOps 已并入 Prompt Studio，/ops/ 这个 scope 不再需要 Service Worker。
//
// 为什么保留文件而不是删掉：
//   旧版 SW 的 scope 是 /ops/，会拦截 /ops/** 下所有 GET 请求，而合并后主应用
//   也要加载 /ops/js/app.js、/ops/js/api.js、/ops/css/app.scoped.css。
//   直接删除文件的话，浏览器更新检查拿到 404，旧 SW 不会退出，
//   反而会继续给主应用喂缓存里的旧版 ops 代码。
//   保留一个「自注销」版本，才能让已安装的旧 SW 更新过来并干净退出。
//
// 升级后本 SW 没有 fetch 监听，请求一律透传给网络，不再缓存。

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 只清自己名下的缓存，不动主应用的 prompt-studio-*
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('promptops-')).map((k) => caches.delete(k))
    );
    await self.registration.unregister();
  })());
});

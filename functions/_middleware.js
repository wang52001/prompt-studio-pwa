// 按主机名分流：ops.jdhsf.top → /ops/ 子应用；其他域名完全不受影响
export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);

  // 只处理 ops 子域；主域 pwa.jdhsf.top 与预览域直接放行
  if (url.hostname !== 'ops.jdhsf.top' && !url.hostname.startsWith('ops.')) {
    return next();
  }
  // API 与 /ops 下的静态资源走原路径
  if (url.pathname.startsWith('/opsapi') || url.pathname.startsWith('/ops')) {
    return next();
  }

  // 注意目标必须是 /ops/：Pages 会把 /ops/index.html 308 到 /ops/，写成前者会多一次跳转
  const target = url.pathname === '/' ? '/ops/' : `/ops${url.pathname}`;
  return env.ASSETS.fetch(new Request(new URL(target, url.origin), request));
}

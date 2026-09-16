// PromptOps 已合并进主应用，ops 子域统一 301 到主应用，只保留一个入口与一个图标
const MAIN_ORIGIN = 'https://pwa.jdhsf.top';

export async function onRequest(ctx) {
  const { request, next } = ctx;
  const url = new URL(request.url);

  // 只处理 ops 子域；主域 pwa.jdhsf.top 与预览域直接放行
  if (url.hostname !== 'ops.jdhsf.top' && !url.hostname.startsWith('ops.')) {
    return next();
  }
  // 接口仍按原路径提供（前端已迁到主域，直接请求主域 /opsapi）
  if (url.pathname.startsWith('/opsapi')) return next();

  // /ops/run/8 → #/ops/run/8；/ops/ 与根路径 → #/ops/
  const rest = url.pathname.startsWith('/ops') ? url.pathname.slice(4) : url.pathname;
  const sub = rest.replace(/^\/+|\/+$/g, '');
  return Response.redirect(`${MAIN_ORIGIN}/#/ops${sub ? '/' + sub : ''}`, 301);
}

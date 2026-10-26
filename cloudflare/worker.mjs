import { resolvePublicRoute, publicPath } from '../src/seo/route-contract.mjs';
import {createApiHandler} from '../backend/router.mjs';
import {accessConfiguration,authenticateAccess} from '../backend/auth.mjs';
import {cleanupRateLimits} from '../backend/business.mjs';
const handleApi=createApiHandler();

const rootAssets = new Set(['/favicon.ico', '/favicon.svg', '/favicon-16x16.png', '/favicon-32x32.png', '/favicon-48x48.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/og-image.png', '/site.webmanifest', '/robots.txt', '/sitemap.xml','/third-party-notices.txt']);
const truthy = value => value === true || value === 'true';
const isAsset = path => rootAssets.has(path) || /^\/(?:assets|brand)\/[a-zA-Z0-9_./-]+\.(?:css|js|mjs|woff2?|ttf|otf|png|webp|jpe?g|gif|svg|ico|avif)$/i.test(path);

function finish(response, { status = response.status, robots = 'noindex,nofollow', head = false, staging = true } = {}) {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', robots);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if (staging) headers.set('Cache-Control', 'no-store');
  else if (headers.get('Content-Type')?.includes('text/html')) headers.set('Cache-Control', 'no-cache');
  // A public asset must never acquire a cookie through the read-only adapter.
  headers.delete('Set-Cookie');
  return new Response(head ? null : response.body, { status, headers });
}

function message(text, status, headers = {}) {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers } });
}

async function asset(env, request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = '';
  // GET internally also allows HEAD responses to retain their representation headers.
  return env.ASSETS.fetch(new Request(url, { method: 'GET', headers: { Accept: request.headers.get('Accept') || '*/*' } }));
}

async function notFound(env, request) {
  if (env.ASSETS?.fetch) {
    for (const path of ['/404.html', '/404/index.html']) {
      const response = await asset(env, request, path);
      if (response.status === 200) return response;
    }
  }
  return message('Page Not Found', 404);
}

export default {
  async fetch(request, env = {}, execution = {}) {
    const url = new URL(request.url);
    const path = publicPath(url.pathname);
    const release = truthy(env.RELEASE);
    const head = request.method === 'HEAD';
    const options = { head, staging: !release };
    if(path?.startsWith('/api/'))return handleApi(request,env,execution);
    if(path==='/admin'||path?.startsWith('/admin/')){
      const adminOptions={...options,staging:true};
      if(!accessConfiguration(env))return finish(await notFound(env,request),{...adminOptions,status:404});
      const actor=await authenticateAccess(request,env);
      if(!actor)return finish(message('Administrator sign-in required.',403),adminOptions);
      if(!['GET','HEAD'].includes(request.method))return finish(message('Method Not Allowed',405),adminOptions);
      if(path==='/admin')return finish(new Response(null,{status:308,headers:{Location:'/admin/leads/'}}),adminOptions);
      if(!/^\/admin\/leads(?:\/[A-Za-z0-9_-]{8,128})?\/?$/.test(path))return finish(await notFound(env,request),{...adminOptions,status:404});
      return finish(await asset(env,request,'/admin/index.html'),adminOptions);
    }
    if (path === '/api' || path?.startsWith('/api/')) {
      return finish(message('Inquiry API is not connected.', 503, { 'Retry-After': '3600', 'Cache-Control': 'no-store' }), options);
    }
    if (!['GET', 'HEAD'].includes(request.method)) return finish(message('Method Not Allowed', 405, { Allow: 'GET, HEAD' }), options);
    const route = resolvePublicRoute(path || '', { allowLegalDrafts: !release || truthy(env.LEGAL_APPROVED) });
    if (route.redirect) return finish(new Response(null, { status: 308, headers: { Location: route.redirect } }), options);
    if (path && isAsset(path) && env.ASSETS?.fetch) {
      const response = await asset(env, request, path);
      // Guard against a host-level SPA fallback answering a missing asset with HTML.
      if (response.status === 200 && !response.headers.get('Content-Type')?.includes('text/html')) return finish(response, { ...options, robots: release ? 'index,follow' : 'noindex,nofollow' });
    } else if (route.status === 200 && env.ASSETS?.fetch) {
      const artifact = route.path === '/' ? '/index.html' : route.path.replace(/\/$/, '') + '/index.html';
      const response = await asset(env, request, artifact);
      if (response.status === 200) return finish(response, { ...options, robots: !release ? 'noindex,nofollow' : route.kind === 'legal' ? 'noindex,follow' : route.kind === 'system' ? 'noindex,nofollow' : 'index,follow' });
    }
    return finish(await notFound(env, request), { ...options, status: 404 });
  },
  async scheduled(_event,env,execution){if(env.DB)execution.waitUntil(cleanupRateLimits(env.DB));},
};

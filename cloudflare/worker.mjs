import { resolvePublicRoute, publicPath } from '../src/seo/route-contract.mjs';
import {createApiHandler} from '../backend/router.mjs';
import {accessConfiguration,authenticateAccess} from '../backend/auth.mjs';
import {cleanupRateLimits} from '../backend/business.mjs';
import {loadPublicContent,resolvePublishedContent,publishedSitemapPages} from '../backend/content-public.mjs';
import {loadContentPreview} from '../backend/content.mjs';
import {renderPublishedHtml} from './cms-response.mjs';
import {administratorLoginPage} from './login-page.mjs';
import {resolveCustomerRoute} from '../src/customer-routes.mjs';
import {customerCleanup,customerGoogleAdminActor,customerPortalConfiguration} from '../backend/customer-auth.mjs';
import {customerEmailAvailable,sendCustomerLoginCode} from '../backend/portal-email.mjs';
import {validGoogleClientId} from '../backend/google-identity.mjs';
import {isVendorMarketingRoute} from '../src/analytics/vendors.mjs';
const handleApi=createApiHandler();
const googleAdminActor=(request,env)=>{
  const config=customerPortalConfiguration(env,{sendCode:customerEmailAvailable(env)?input=>sendCustomerLoginCode(env,input):undefined});
  return config&&validGoogleClientId(env.GOOGLE_CLIENT_ID)?customerGoogleAdminActor(request,env,config):null;
};
const handleGoogleAdminApi=createApiHandler({authenticate:googleAdminActor});

const rootAssets = new Set(['/favicon.ico', '/favicon.svg', '/favicon-16x16.png', '/favicon-32x32.png', '/favicon-48x48.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/og-image.png', '/site.webmanifest', '/robots.txt', '/sitemap.xml','/third-party-notices.txt']);
const truthy = value => value === true || value === 'true';
const isAsset = path => rootAssets.has(path) || /^\/(?:assets|brand)\/[a-zA-Z0-9_./-]+\.(?:css|js|mjs|woff2?|ttf|otf|png|webp|jpe?g|gif|svg|ico|avif)$/i.test(path);

function finish(response, { status = response.status, robots = 'noindex,nofollow', head = false, staging = true,externalAnalytics=false,noReferrer=false,googleSignIn=false } = {}) {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', robots);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', noReferrer?'no-referrer':'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Strict-Transport-Security','max-age=31536000');
  const script=externalAnalytics?' https://www.googletagmanager.com https://www.clarity.ms https://scripts.clarity.ms https://analytics.ahrefs.com':'';
  const image=externalAnalytics?' https://www.googletagmanager.com https://*.google-analytics.com https://*.clarity.ms https://c.bing.com':'';
  const connect=externalAnalytics?' https://www.googletagmanager.com https://*.google-analytics.com https://www.google.com https://*.clarity.ms https://plausible.shipsolo.io https://analytics.ahrefs.com':'';
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'"+script+(googleSignIn?' https://accounts.google.com/gsi/client':'')+"; style-src 'self' 'unsafe-inline'"+(googleSignIn?' https://accounts.google.com/gsi/style':'')+"; img-src 'self' data: blob:"+image+"; font-src 'self' data:; connect-src 'self'"+connect+(googleSignIn?' https://accounts.google.com/gsi/':'')+"; frame-src "+(googleSignIn?'https://accounts.google.com/gsi/':"'none'")+"; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if(googleSignIn)headers.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');
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

async function protectedContentPreview(env,request,pageId,options){
  try{
    const draft=await loadContentPreview(env,pageId);
    if(!draft)return finish(message('Saved draft unavailable. Reload the editor.',409),options);
    const original=draft.originalPath==='/'?'/index.html':draft.originalPath.replace(/\/$/,'')+'/index.html';
    let shell=await asset(env,request,original);if(shell.status!==200)shell=await asset(env,request,'/about/index.html');
    const rendered=renderPublishedHtml(await shell.text(),draft.page.path,env,draft.bundle,draft.page,draft.originalPath);
    const response=finish(rendered,options),headers=new Headers(response.headers);
    headers.set('X-Frame-Options','SAMEORIGIN');headers.set('Content-Security-Policy',headers.get('Content-Security-Policy').replace("frame-ancestors 'none'","frame-ancestors 'self'"));
    return new Response(response.body,{status:response.status,headers});
  }catch{return finish(message('Preview temporarily unavailable.',503),options);}
}

export default {
  async fetch(request, env = {}, execution = {}) {
    const url = new URL(request.url);
    const path = publicPath(url.pathname);
    const release = truthy(env.RELEASE);
    const seoIndexing = release && truthy(env.SEO_INDEXING_ENABLED);
    const head = request.method === 'HEAD';
    const options = { head, staging: !release,externalAnalytics:truthy(env.EXTERNAL_ANALYTICS_ENABLED)&&isVendorMarketingRoute(path),noReferrer:['/request-a-quote/','/inquiry-received/'].includes(path) };
    // Only the confirmed apex and its www alias are canonicalized. API writes
    // over HTTP/aliases are rejected without forwarding customer bodies.
    if(env.SITE_ORIGIN){
      let canonical;try{canonical=new URL(env.SITE_ORIGIN);}catch{}
      if(canonical?.protocol==='https:'&&['exactmec.com','www.exactmec.com'].includes(url.hostname)&&(url.protocol!=='https:'||url.origin!==canonical.origin)){
        if(!['GET','HEAD'].includes(request.method))return finish(message('Use the HTTPS website to submit this request.',400),options);
        const resolved=resolvePublicRoute(path||'');
        const target=new URL(resolved.redirect||url.pathname,canonical.origin);
        if(!target.search)target.search=url.search;
        return finish(new Response(null,{status:308,headers:{Location:target.href}}),options);
      }
    }
    if(path?.startsWith('/api/manage/')){
      const rewritten=new URL(request.url);rewritten.pathname=path.replace(/^\/api\/manage\//,'/api/admin/');
      return handleGoogleAdminApi(new Request(rewritten,request),env,execution);
    }
    if(path?.startsWith('/api/'))return handleApi(request,env,execution);
    if(path==='/admin/login'||path==='/admin/login/'){
      if(!['GET','HEAD'].includes(request.method))return finish(message('Method Not Allowed',405),{...options,staging:true});
      if(path==='/admin/login')return finish(new Response(null,{status:308,headers:{Location:'/admin/login/'}}),{...options,staging:true});
      const response=finish(administratorLoginPage(env),{...options,staging:true}),headers=new Headers(response.headers);
      headers.set('Referrer-Policy','no-referrer');
      return new Response(response.body,{status:response.status,headers});
    }
    if(path==='/account'||path?.startsWith('/account/')){
      const privateOptions={...options,staging:true};
      if(!['GET','HEAD'].includes(request.method))return finish(message('Method Not Allowed',405),privateOptions);
      const customer=resolveCustomerRoute(path);
      if(customer.redirect)return finish(new Response(null,{status:308,headers:{Location:customer.redirect}}),privateOptions);
      if(customer.status!==200)return finish(await notFound(env,request),{...privateOptions,status:404});
      const shell=await asset(env,request,'/account/index.html');
      const available=Boolean(customerPortalConfiguration(env,{sendCode:customerEmailAvailable(env)?input=>sendCustomerLoginCode(env,input):undefined}));
      const googleClientId=available&&validGoogleClientId(env.GOOGLE_CLIENT_ID)?env.GOOGLE_CLIENT_ID:'';
      const html=(await shell.text()).replace('</head>','<script type="application/json" id="customer-config">'+JSON.stringify({available,googleClientId})+'</script></head>');
      const response=finish(new Response(html,{status:shell.status,headers:shell.headers}),{...privateOptions,googleSignIn:!!googleClientId}),headers=new Headers(response.headers);
      if(!googleClientId)headers.set('Referrer-Policy','no-referrer');
      return new Response(response.body,{status:response.status,headers});
    }
    if(path==='/manage'||path?.startsWith('/manage/')){
      const manageOptions={...options,staging:true,noReferrer:true};
      if(!['GET','HEAD'].includes(request.method))return finish(message('Method Not Allowed',405),manageOptions);
      const actor=await googleAdminActor(request,env);
      if(!actor)return finish(message('Administrator sign-in required.',403),manageOptions);
      const preview=path.match(/^\/manage\/content\/([a-z0-9]+(?:-[a-z0-9]+)*)\/preview\/?$/);
      if(preview)return protectedContentPreview(env,request,preview[1],manageOptions);
      if(path==='/manage')return finish(new Response(null,{status:308,headers:{Location:'/manage/leads/'}}),manageOptions);
      if(!/^\/manage\/leads(?:\/[A-Za-z0-9_-]{8,128})?\/?$/.test(path))return finish(await notFound(env,request),{...manageOptions,status:404});
      return finish(await asset(env,request,'/admin/index.html'),manageOptions);
    }
    if(path==='/admin'||path?.startsWith('/admin/')){
      const adminOptions={...options,staging:true};
      if(!accessConfiguration(env))return finish(await notFound(env,request),{...adminOptions,status:404});
      const actor=await authenticateAccess(request,env);
      if(!actor)return finish(message('Administrator sign-in required.',403),adminOptions);
      if(!['GET','HEAD'].includes(request.method))return finish(message('Method Not Allowed',405),adminOptions);
      const preview=path.match(/^\/admin\/content\/([a-z0-9]+(?:-[a-z0-9]+)*)\/preview\/?$/);
      if(preview)return protectedContentPreview(env,request,preview[1],adminOptions);
      if(path==='/admin')return finish(new Response(null,{status:308,headers:{Location:'/admin/leads/'}}),adminOptions);
      if(!/^\/admin\/leads(?:\/[A-Za-z0-9_-]{8,128})?\/?$/.test(path))return finish(await notFound(env,request),{...adminOptions,status:404});
      return finish(await asset(env,request,'/admin/index.html'),adminOptions);
    }
    if (path === '/api' || path?.startsWith('/api/')) {
      return finish(message('Inquiry API is not connected.', 503, { 'Retry-After': '3600', 'Cache-Control': 'no-store' }), options);
    }
    if (!['GET', 'HEAD'].includes(request.method)) return finish(message('Method Not Allowed', 405, { Allow: 'GET, HEAD' }), options);
    if(path==='/how-we-work'||path==='/how-we-work/')return finish(new Response(null,{status:308,headers:{Location:'/about/#how-we-work'}}),options);
    // A scoped review exception for the owner's Site Audit project only.
    // Robots directives are crawl preferences, never authentication controls.
    if(path==='/robots.txt'&&!seoIndexing){
      const rules='User-agent: *\nDisallow: /\n'+(truthy(env.AHREFS_AUDIT_ENABLED)?'\nUser-agent: AhrefsSiteAudit\nAllow: /\nDisallow: /api\nDisallow: /admin\nDisallow: /account\nDisallow: /customer\nDisallow: /design-system\nDisallow: /inquiry-received\nCrawl-delay: 2\n':'');
      return finish(message(rules,200,{'Cache-Control':'no-store'}),options);
    }
    if(path==='/sitemap.xml'&&!seoIndexing){
      return finish(new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}}),options);
    }
    if(truthy(env.CMS_ENABLED)&&!isAsset(path||'')||truthy(env.CMS_ENABLED)&&path==='/sitemap.xml'){
      try{
        const bundle=await loadPublicContent(env);
        if(path==='/sitemap.xml'){
          const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
          const items=seoIndexing?publishedSitemapPages(bundle).map(page=>'<url><loc>'+esc(env.SITE_ORIGIN+page.path)+'</loc>'+(page.lastmod?'<lastmod>'+page.lastmod+'</lastmod>':'')+'</url>').join('\n'):'';
          return finish(new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+items+'</urlset>',{headers:{'Content-Type':'application/xml; charset=utf-8'}}),options);
        }
        const published=resolvePublishedContent(path,bundle);
        if(published?.status===410)return finish(await notFound(env,request),{...options,status:410});
        if(published?.redirect)return finish(new Response(null,{status:308,headers:{Location:published.redirect}}),options);
        const ordinary=resolvePublicRoute(path||'',{allowLegalDrafts:!release||truthy(env.LEGAL_APPROVED)});
        if(published?.page||ordinary.status===200&&(bundle.pages.length||bundle.withdrawn.length||Object.keys(bundle.settings).length)){
          const original=published?.originalPath||ordinary.path;
          const artifact=original==='/'?'/index.html':original.replace(/\/$/,'')+'/index.html';
          let shell=await asset(env,request,artifact);if(shell.status!==200&&published?.page)shell=await asset(env,request,'/about/index.html');
          if(shell.status!==200)return finish(await notFound(env,request),{...options,status:404});
          const externalAnalytics=truthy(env.EXTERNAL_ANALYTICS_ENABLED)&&(published?.page?isVendorMarketingRoute(published.page.path,[published.page.path]):isVendorMarketingRoute(ordinary.path));
          return finish(renderPublishedHtml(await shell.text(),published?.page?.path||ordinary.path,env,bundle,published?.page,original),{...options,externalAnalytics,robots:!seoIndexing?'noindex,nofollow':ordinary.kind==='legal'?'noindex,follow':ordinary.kind==='system'&&!published?.page?'noindex,nofollow':'index,follow'});
        }
      }catch{return finish(message('Content temporarily unavailable.',503),options);}
    }
    const route = resolvePublicRoute(path || '', { allowLegalDrafts: !release || truthy(env.LEGAL_APPROVED) });
    if (route.redirect) return finish(new Response(null, { status: 308, headers: { Location: route.redirect } }), options);
    if (path && isAsset(path) && env.ASSETS?.fetch) {
      const response = await asset(env, request, path);
      // Guard against a host-level SPA fallback answering a missing asset with HTML.
      if (response.status === 200 && !response.headers.get('Content-Type')?.includes('text/html')) return finish(response, { ...options, robots: seoIndexing ? 'index,follow' : 'noindex,nofollow' });
    } else if (route.status === 200 && env.ASSETS?.fetch) {
      const artifact = route.path === '/' ? '/index.html' : route.path.replace(/\/$/, '') + '/index.html';
      const response = await asset(env, request, artifact);
      if (response.status === 200) return finish(response, { ...options, robots: !seoIndexing ? 'noindex,nofollow' : route.kind === 'legal' ? 'noindex,follow' : route.kind === 'system' ? 'noindex,nofollow' : 'index,follow' });
    }
    return finish(await notFound(env, request), { ...options, status: 404 });
  },
  async scheduled(_event,env,execution){if(env.DB)execution.waitUntil(Promise.all([cleanupRateLimits(env.DB),...(truthy(env.CUSTOMER_SCHEMA_READY)?[customerCleanup(env)]:[])]));},
};

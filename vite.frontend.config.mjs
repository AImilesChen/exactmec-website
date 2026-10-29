import {defineConfig,mergeConfig} from 'vite';
import fs from 'node:fs/promises';
import base from './vite.config.mjs';
import {PUBLIC_ROUTES,resolvePublicRoute} from './src/seo/route-contract.mjs';
import {routeStyleFiles,routeStylesFor} from './src/route-styles.mjs';
import {resolveCustomerRoute} from './src/customer-routes.mjs';

// Public frontend HMR entry. The older workbench remains in dev:review.
export function publicDevPlugin({entry='/src/entry-public.jsx'}={}) {return {
  name:'exactmec-public-dev-entry',
  configureServer(server){
   server.middlewares.use(async(req,res,next)=>{
    if(req.method!=='GET'||!req.headers.accept?.includes('text/html'))return next();
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(/\.[^/]+$/.test(pathname)||pathname.startsWith('/@')||pathname.startsWith('/src/'))return next();
    try{
     const customer=pathname==='/account'||pathname.startsWith('/account/');
     const route=customer?resolveCustomerRoute(pathname):resolvePublicRoute(pathname);
     res.setHeader('X-Robots-Tag','noindex,nofollow');res.setHeader('Cache-Control','no-store');
     if(route.redirect){res.writeHead(308,{Location:route.redirect});res.end();return;}
     const source=customer?await fs.readFile(new URL('./customer.html',import.meta.url),'utf8'):(await fs.readFile(new URL('./frontend.html',import.meta.url),'utf8')).replace('/src/entry-public.jsx',entry);
     let html=await server.transformIndexHtml(req.url,source);
     if(!customer){
      const urls=Object.fromEntries([...new Set(Object.values(routeStyleFiles).flat())].map(file=>[file,'/src/'+file]));
      const styles=routeStylesFor(pathname,PUBLIC_ROUTES,urls).map(href=>`<link rel="stylesheet" href="${href}"/>`).join('');
      html=html.replace('</head>',styles+`<script id="route-style-manifest" type="application/json">${JSON.stringify(urls)}</script></head>`);
     }
     res.statusCode=route.status;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
    }catch(error){next(error);}
   });
  },
 };}
export default mergeConfig(base,defineConfig({
 server:{warmup:{clientFiles:['./src/entry-public.jsx']}},
 plugins:[publicDevPlugin()],
}));

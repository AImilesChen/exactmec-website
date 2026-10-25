import {defineConfig,mergeConfig} from 'vite';
import fs from 'node:fs/promises';
import base from './vite.config.mjs';
import {resolvePublicRoute} from './src/seo/route-contract.mjs';

// Public frontend HMR entry. The older workbench remains in dev:review.
export default mergeConfig(base,defineConfig({
 server:{warmup:{clientFiles:['./src/entry-public.jsx']}},
 plugins:[{
  name:'exactmec-public-dev-entry',
  configureServer(server){
   server.middlewares.use(async(req,res,next)=>{
    if(req.method!=='GET'||!req.headers.accept?.includes('text/html'))return next();
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(/\.[^/]+$/.test(pathname)||pathname.startsWith('/@')||pathname.startsWith('/src/'))return next();
    try{
     const route=resolvePublicRoute(pathname);
     res.setHeader('X-Robots-Tag','noindex,nofollow');res.setHeader('Cache-Control','no-store');
     if(route.redirect){res.writeHead(308,{Location:route.redirect});res.end();return;}
     const source=await fs.readFile(new URL('./frontend.html',import.meta.url),'utf8');
     const html=await server.transformIndexHtml(req.url,source);
     res.statusCode=route.status;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
    }catch(error){next(error);}
   });
  },
 }],
}));

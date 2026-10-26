// Local synthetic integration only. Never deploy this Node host or its identity
// stub. The production entry is cloudflare/worker.mjs and validates Access JWTs.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createServer as createViteServer} from 'vite';
import react from '@vitejs/plugin-react';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createApiHandler} from '../backend/router.mjs';
import {publicDevPlugin} from '../vite.frontend.config.mjs';
import {loadContentPreview} from '../backend/content.mjs';
import {renderPublishedHtml} from '../cloudflare/cms-response.mjs';
import publicWorker from '../cloudflare/worker.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.LOCAL_BACKEND_PORT||4176);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid local port.');
const origin=`http://127.0.0.1:${port}`,state=path.join(root,'.wrangler/backend-local');
await fs.mkdir(state,{recursive:true});
const secretsFile=path.join(state,'secrets.json');let secrets;
try{secrets=JSON.parse(await fs.readFile(secretsFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;secrets=Object.fromEntries(['RATE_LIMIT_SECRET','CONTACT_HASH_SECRET','ADMIN_CSRF_SECRET'].map(k=>[k,randomBytes(48).toString('hex')]));await fs.writeFile(secretsFile,JSON.stringify(secrets),{mode:0o600});}
if(typeof secrets.CUSTOMER_AUTH_SECRET!=='string'||secrets.CUSTOMER_AUTH_SECRET.length<32){secrets.CUSTOMER_AUTH_SECRET=randomBytes(48).toString('hex');await fs.writeFile(secretsFile,JSON.stringify(secrets),{mode:0o600});}
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local-only")}}',compatibilityDate:'2026-10-01',d1Databases:{DB:'exactmec-synthetic-local'},d1Persist:path.join(state,'d1')}));
const db=await mf.getD1Database('DB');
await db.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
for(const name of(await fs.readdir(path.join(root,'migrations'))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
 if(await db.prepare('SELECT name FROM local_migrations WHERE name=?').bind(name).first())continue;
 const sql=await fs.readFile(path.join(root,'migrations',name),'utf8');
 const statements=sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s));
 await db.batch([...statements,db.prepare('INSERT INTO local_migrations(name) VALUES(?)').bind(name)]);
}
const env={...secrets,DB:db,SITE_ORIGIN:origin,NOTICE_VERSION:'inquiry-copy-2026-10-25-draft',PRIVACY_VERSION:'privacy-policy-draft',PROCESSING_BASIS:'purpose_limited_consent_draft',WHATSAPP_NOTICE_VERSION:'inquiry-copy-2026-10-25-draft',NOTIFICATIONS_ENABLED:'false',CUSTOMER_SCHEMA_READY:'true'};
const api=createApiHandler({localSynthetic:true,authenticate:async()=>({id:'local-synthetic-admin',email:'admin@example.com'}),sendCustomerCode:async({email,code,expiresMinutes})=>{
 if(!/^[^@\s]+@example\.com$/i.test(email))throw new Error('synthetic_only');
 // Disposable local test outbox, never a real email service or public route.
 await fs.writeFile(path.join(state,'customer-code.json'),JSON.stringify({synthetic:true,email,code,expiresMinutes,at:new Date().toISOString()}),{mode:0o600});
 return {accepted:true};
}});
const assetRoot=path.join(root,'dist/public'),types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.xml':'application/xml','.txt':'text/plain','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'};
const assets={async fetch(request){const assetPath=path.resolve(assetRoot,'.'+new URL(request.url).pathname);if(!assetPath.startsWith(assetRoot+path.sep))return new Response('Missing',{status:404});try{return new Response(await fs.readFile(assetPath),{headers:{'Content-Type':types[path.extname(assetPath)]||'application/octet-stream'}});}catch{return new Response('Missing',{status:404});}}};
let vite;const pending=new Set();
const execution={waitUntil(p){pending.add(p);p.catch(()=>{}).finally(()=>pending.delete(p));}};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!==`127.0.0.1:${port}`){req.resume();res.writeHead(403);res.end('Local host only.');return;}
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/')){
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413,{'Content-Type':'application/json'});res.end('{"error":"body_too_large"}');return;}chunks.push(chunk);}
   const headers=new Headers(Object.entries(req.headers).filter(([,v])=>typeof v==='string'));
   headers.set('CF-Connecting-IP',req.socket.remoteAddress||'127.0.0.1');
   const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const response=await api(request,env,execution);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(url.pathname==='/admin/login'||url.pathname==='/admin/login/'){
   const response=await publicWorker.fetch(new Request('https://exactmec.com'+url.pathname,{method:req.method}),{...env,ASSETS:assets,SITE_ORIGIN:'https://exactmec.com',RELEASE:'false'});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(url.pathname==='/admin'||url.pathname.startsWith('/admin/')){
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   if(url.pathname==='/admin'){res.writeHead(308,{Location:'/admin/leads/'});res.end();return;}
   const preview=url.pathname.match(/^\/admin\/content\/([a-z0-9]+(?:-[a-z0-9]+)*)\/preview\/?$/);
   if(preview){
    const draft=await loadContentPreview({...env,CMS_ENABLED:'true'},preview[1]);if(!draft){res.writeHead(409);res.end('Saved draft unavailable.');return;}
    const file=draft.originalPath==='/'?'index.html':draft.originalPath.replace(/^\//,'').replace(/\/$/,'')+'/index.html';
    const shell=await fs.readFile(path.join(assetRoot,file),'utf8').catch(()=>fs.readFile(path.join(assetRoot,'about/index.html'),'utf8'));
    const response=renderPublishedHtml(shell,draft.page.path,{...env,SITE_ORIGIN:'https://exactmec.com'},draft.bundle,draft.page,draft.originalPath);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow'});res.end(await response.text());return;
   }
   const source=await fs.readFile(path.join(root,'admin.html'),'utf8');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer'});
   res.end(await vite.transformIndexHtml(req.url,source));return;
  }
  // Exercise the actual published-snapshot Worker on localhost. The special
  // RFQ integration entry below alone can submit example.com synthetic forms.
  if(['GET','HEAD'].includes(req.method)&&!url.pathname.startsWith('/request-a-quote')&&!/^\/(?:src|local|node_modules|@)/.test(url.pathname)){
   const response=await publicWorker.fetch(new Request('https://exactmec.com'+url.pathname+url.search,{method:req.method}),{...env,ASSETS:assets,SITE_ORIGIN:'https://exactmec.com',CMS_ENABLED:'true',RELEASE:'false',LEGAL_APPROVED:'false'});
   if(url.pathname==='/account'||url.pathname.startsWith('/account/')){
    // This loopback-only host enables the UI against its injected synthetic
    // transport. The production API still has its independent release gates.
    const html=(await response.text()).replace('{"available":false}','{"available":true}');
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(req.method==='HEAD'?'':html);return;
   }
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  vite.middlewares(req,res,()=>{res.writeHead(404);res.end('Not found.');});
 }catch{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"local_service_unavailable"}');}
});
vite=await createViteServer({root,configFile:false,plugins:[react(),publicDevPlugin({entry:'/local/entry-integration.jsx'})],server:{middlewareMode:true,hmr:{server}},appType:'custom'});
server.listen(port,'127.0.0.1',()=>console.log(`Synthetic integration: ${origin}/request-a-quote/\nLocal admin: ${origin}/admin/leads/\nExample.com fixtures only; no real contacts, email delivery or deployment.`));
async function close(){server.close();await Promise.allSettled([...pending]);await vite.close();await mf.dispose();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);

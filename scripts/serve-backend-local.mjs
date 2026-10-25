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

const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.LOCAL_BACKEND_PORT||4176);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid local port.');
const origin=`http://127.0.0.1:${port}`,state=path.join(root,'.wrangler/backend-local');
await fs.mkdir(state,{recursive:true});
const secretsFile=path.join(state,'secrets.json');let secrets;
try{secrets=JSON.parse(await fs.readFile(secretsFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;secrets=Object.fromEntries(['RATE_LIMIT_SECRET','CONTACT_HASH_SECRET','ADMIN_CSRF_SECRET'].map(k=>[k,randomBytes(48).toString('hex')]));await fs.writeFile(secretsFile,JSON.stringify(secrets),{mode:0o600});}
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local-only")}}',compatibilityDate:'2026-10-01',d1Databases:{DB:'exactmec-synthetic-local'},d1Persist:path.join(state,'d1')}));
const db=await mf.getD1Database('DB');
await db.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
for(const name of(await fs.readdir(path.join(root,'migrations'))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
 if(await db.prepare('SELECT name FROM local_migrations WHERE name=?').bind(name).first())continue;
 const sql=await fs.readFile(path.join(root,'migrations',name),'utf8');
 const statements=sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s));
 await db.batch([...statements,db.prepare('INSERT INTO local_migrations(name) VALUES(?)').bind(name)]);
}
const env={...secrets,DB:db,SITE_ORIGIN:origin,NOTICE_VERSION:'inquiry-copy-2026-10-25-draft',PRIVACY_VERSION:'privacy-policy-draft',PROCESSING_BASIS:'purpose_limited_consent_draft',WHATSAPP_NOTICE_VERSION:'inquiry-copy-2026-10-25-draft',NOTIFICATIONS_ENABLED:'false'};
const api=createApiHandler({localSynthetic:true,authenticate:async()=>({id:'local-synthetic-admin',email:'admin@example.com'})});
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
  if(url.pathname==='/admin'||url.pathname.startsWith('/admin/')){
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   if(url.pathname==='/admin'){res.writeHead(308,{Location:'/admin/leads/'});res.end();return;}
   const source=await fs.readFile(path.join(root,'admin.html'),'utf8');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer'});
   res.end(await vite.transformIndexHtml(req.url,source));return;
  }
  vite.middlewares(req,res,()=>{res.writeHead(404);res.end('Not found.');});
 }catch{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"local_service_unavailable"}');}
});
vite=await createViteServer({root,configFile:false,plugins:[react(),publicDevPlugin({entry:'/local/entry-integration.jsx'})],server:{middlewareMode:true,hmr:{server}},appType:'custom'});
server.listen(port,'127.0.0.1',()=>console.log(`Synthetic integration: ${origin}/request-a-quote/\nLocal admin: ${origin}/admin/leads/\nExample.com fixtures only; no real contacts, email delivery or deployment.`));
async function close(){server.close();await Promise.allSettled([...pending]);await vite.close();await mf.dispose();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);

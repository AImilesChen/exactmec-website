import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../cloudflare/worker.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist/public');
const port=Number(process.env.PORT||4174);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.xml':'application/xml','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'};
const assets={async fetch(request){
 const url=new URL(request.url);let target;
 try{target=path.resolve(root,'.'+decodeURIComponent(url.pathname));}catch{return new Response('Not found',{status:404});}
 if(!target.startsWith(root+path.sep))return new Response('Not found',{status:404});
 try{const bytes=await fs.readFile(target);return new Response(bytes,{headers:{'Content-Type':types[path.extname(target)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}
}};
const server=http.createServer(async(req,res)=>{
 try{
  req.resume();
  const request=new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers:req.headers});
  const response=await worker.fetch(request,{ASSETS:assets,RELEASE:'false',LEGAL_APPROVED:'false'});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500,{'Content-Type':'text/plain'});res.end('Preview unavailable.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Frontend preview: http://127.0.0.1:${port}/ (staging, no real inquiry storage)`));

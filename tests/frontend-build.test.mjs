import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../cloudflare/worker.mjs';
import {PUBLIC_ROUTES,resolvePublicRoute} from '../src/seo/route-contract.mjs';
import {createSiteConfig,releaseBlockers} from '../src/site-config.mjs';

const root=fileURLToPath(new URL('../dist/public/',import.meta.url));
const read=p=>fs.readFile(path.join(root,p),'utf8');
const exists=async p=>!!await fs.stat(path.join(root,p)).catch(()=>false);
const fileFor=route=>route.id==='404'?'404.html':route.path==='/'?'index.html':route.path.replace(/^\//,'').replace(/\/$/,'')+'/index.html';
const pages=async()=>Promise.all(PUBLIC_ROUTES.map(async route=>({...route,html:await read(fileFor(route))})));

test('actual static build has one H1/title/robots and substantive HTML on all 24 routes',async()=>{
 const titles=new Set();
 for(const page of await pages()){
  assert.equal((page.html.match(/<h1(?:\s|>)/g)||[]).length,1,page.path);
  assert.equal((page.html.match(/<title>/g)||[]).length,1,page.path);
  assert.equal((page.html.match(/<meta name="robots"/g)||[]).length,1,page.path);
  assert.match(page.html,/<meta name="robots" content="noindex,nofollow"/);
  assert.ok(page.html.split('<main id="main-content">')[1]?.split('</main>')[0].length>(page.kind==='system'?100:500),page.path);
  assert.doesNotMatch(page.html,/<link rel="canonical"|application\/ld\+json/);
  titles.add(page.html.match(/<title>(.*?)<\/title>/)[1]);
 }
 assert.equal(titles.size,24);
});

test('every rendered local image/style/script and CSS background is packaged',async()=>{
 for(const page of await pages())for(const [,url]of page.html.matchAll(/<(?:img|script|link)\b[^>]*?(?:src|href)="(\/[^"#]+)"/g)){
  assert.ok(await exists(url.split('?')[0].slice(1)),page.path+': '+url);
 }
 for(const file of await fs.readdir(path.join(root,'assets')))if(file.endsWith('.css')){
  for(const [,url]of(await read('assets/'+file)).matchAll(/url\(["']?(\/[^)"']+)/g))assert.ok(await exists(url.slice(1)),url);
 }
});

test('all static internal links reach a public page and an existing target anchor',async()=>{
 const lookup=new Map((await pages()).map(p=>[p.path,p.html]));
 for(const page of await pages())for(const [,href]of page.html.matchAll(/<a\b[^>]*href="([^"?]+)"/g)){
  if(!href.startsWith('/')&&!href.startsWith('#'))continue;
  const [base,hash]=href.split('#'),route=resolvePublicRoute(base||page.path);
  assert.equal(route.status,!base&&page.id==='404'?404:200,page.path+': '+href);
  if(hash)assert.ok(lookup.get(route.path)?.includes('id="'+hash+'"'),page.path+': missing '+href);
 }
});

test('read-only Worker serves real built HTML, 308 aliases and hard 404 without private artifacts',async()=>{
 const env={RELEASE:'false',ASSETS:{async fetch(req){const p=new URL(req.url).pathname.slice(1);try{return new Response(await fs.readFile(path.join(root,p)),{headers:{'Content-Type':p.endsWith('.html')?'text/html':'application/octet-stream'}})}catch{return new Response('Missing',{status:404})}}}};
 for(const [pathname,status]of[['/',200],['/request-a-quote/',200],['/privacy-policy',308],['/products',308],['/unknown-path/',404],['/admin/leads/',404],['/design-system/',404],['/downloads/ExactMec-UI-v3.2.zip',404],['/api/inquiries',503]]){
  const response=await worker.fetch(new Request('https://preview.invalid'+pathname),env);
  assert.equal(response.status,status,pathname);assert.equal(response.headers.get('X-Robots-Tag'),'noindex,nofollow');
  if(status===404)assert.match(await response.text(),/<h1/);
 }
 assert.equal(await exists('design-system'),false);assert.equal(await exists('downloads'),false);
 assert.equal(await read('robots.txt'),'User-agent: *\nDisallow: /\n');
 assert.doesNotMatch(await read('sitemap.xml'),/<url>/);
});

test('unconfigured public inquiry has confirmed manual WhatsApp and cannot be enabled by one flag',async()=>{
 const html=await read('request-a-quote/index.html');
 assert.match(html,/https:\/\/wa\.me\/8615990661727/);
 assert.doesNotMatch(html,/wa\.me\/8615990661727\?/);
 assert.equal(createSiteConfig({inquiryEnabled:true}).inquiryEnabled,false);
 assert.ok(releaseBlockers(createSiteConfig()).length>=4);
 assert.throws(()=>createSiteConfig({origin:'https://example.com'}));
});

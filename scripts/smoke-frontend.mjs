import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PUBLIC_ROUTES} from '../src/seo/route-contract.mjs';
const base=new URL(process.argv[2]||'http://127.0.0.1:4174');
if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||!['http:','https:'].includes(base.protocol))throw new Error('Supply an HTTP(S) origin only.');
const records=[],assets=new Set();
async function check(path,status){
 const response=await fetch(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,status,path);
 assert.equal(response.headers.get('x-robots-tag'),'noindex,nofollow',path);
 const html=await response.text();
 if(status===200&&response.headers.get('content-type')?.includes('text/html')){
  assert.match(html,/<h1(?:\s|>)/,path);
  for(const [,url]of html.matchAll(/<(?:img|link|script)\b[^>]*?(?:src|href)="(\/[^"#]+)"/g))assets.add(url);
 }
 records.push({path,status:response.status});
 return {response,html};
}
for(const route of PUBLIC_ROUTES)await check(route.path,route.id==='404'?404:200);
for(const pathname of ['/unregistered-page/','/admin/leads/','/design-system/','/downloads/ExactMec-UI-v3.2.zip'])await check(pathname,404);
for(const [from,to]of [['/products','/products/'],['/privacy-policy','/privacy']]){
 const {response}=await check(from,308);assert.equal(response.headers.get('location'),to,from);
}
await check('/api/inquiries',503);
for(const url of assets){const response=await fetch(new URL(url,base),{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200,url);assert.doesNotMatch(response.headers.get('content-type')||'',/text\/html/,url);records.push({path:url,status:response.status});await response.arrayBuffer();}
const report={checkedAt:new Date().toISOString(),origin:base.origin,mode:'staging',requests:records.length,passed:true,records};
await fs.writeFile(fileURLToPath(new URL('../dist/http-smoke-report.json',import.meta.url)),JSON.stringify(report,null,2));
console.log(`HTTP smoke passed: ${records.length} read-only requests; no submissions, deployment or messages.`);

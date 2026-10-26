import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';

const staticRobots='User-agent: *\nDisallow: /\n';
function environment(extra={}){
 return {SITE_ORIGIN:'https://exactmec.com',RELEASE:'false',COLLECTION_ENABLED:'false',ASSETS:{fetch:async request=>new Response(new URL(request.url).pathname==='/robots.txt'?staticRobots:'<html><head><meta name="robots" content="noindex,nofollow"></head><body>Review</body></html>',{headers:{'Content-Type':new URL(request.url).pathname==='/robots.txt'?'text/plain':'text/html'}})},...extra};
}
const request=(path,env,init)=>worker.fetch(new Request('https://exactmec.com'+path,init),env);

test('Ahrefs review exception names SiteAudit only and preserves private exclusions and the general block',async()=>{
 const env=environment({AHREFS_AUDIT_ENABLED:'true'}),r=await request('/robots.txt',env);
 assert.equal(r.status,200);assert.match(r.headers.get('Content-Type'),/text\/plain/);assert.equal(r.headers.get('Cache-Control'),'no-store');
 const text=await r.text(),groups=text.trim().split(/\n\s*\n/);
 assert.equal(groups.length,2);assert.equal(groups[0],'User-agent: *\nDisallow: /');
 assert.match(groups[1],/^User-agent: AhrefsSiteAudit\nAllow: \/\n/);assert.doesNotMatch(text,/User-agent: (?:AhrefsBot|Googlebot|bingbot)/i);
 for(const path of ['/api','/admin','/account','/customer','/design-system','/inquiry-received'])assert.ok(groups[1].includes('Disallow: '+path+'\n'));
 assert.match(text,/Crawl-delay: 2/);
 const head=await request('/robots.txt',env,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await request('/robots.txt',env,{method:'POST'})).status,405);
});

test('the explicit audit flag does not alter default or released robots assets, indexing, collection or admin access',async()=>{
 for(const extra of [{},{AHREFS_AUDIT_ENABLED:'false'},{AHREFS_AUDIT_ENABLED:'true',RELEASE:'true'}])assert.equal(await(await request('/robots.txt',environment(extra))).text(),staticRobots);
 const env=environment({AHREFS_AUDIT_ENABLED:'true'}),home=await request('/',env);
 assert.equal(home.headers.get('X-Robots-Tag'),'noindex,nofollow');assert.match(await home.text(),/content="noindex,nofollow"/);
 assert.equal((await request('/admin/leads/',env)).status,404);
 assert.equal((await request('/api/inquiries',env,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,503);
});

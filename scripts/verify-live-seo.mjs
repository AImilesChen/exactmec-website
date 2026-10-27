import assert from 'node:assert/strict';

const origin='https://exactmec.com';
const get=async path=>{
 const response=await fetch(origin+path,{redirect:'manual'});
 return {response,body:await response.text()};
};

const robots=await get('/robots.txt');
assert.equal(robots.response.status,200);
assert.match(robots.body,/^User-agent: \*\nAllow: \//);
for(const path of ['/api/','/admin/','/account/','/design-system/'])assert.ok(robots.body.includes('Disallow: '+path));
assert.ok(robots.body.includes(`Sitemap: ${origin}/sitemap.xml`));

const sitemap=await get('/sitemap.xml');
assert.equal(sitemap.response.status,200);
const urls=[...sitemap.body.matchAll(/<loc>(https:\/\/exactmec\.com\/[^<]*)<\/loc>/g)].map(match=>match[1]);
assert.equal(urls.length,18,'Expected the 18 approved marketing pages in the sitemap');
assert.ok(urls.includes(origin+'/aluminum-die-casting-molds/'));
for(const privatePath of ['/admin/','/account/','/api/','/privacy','/inquiry-received/'])assert.ok(!sitemap.body.includes(privatePath));

for(const url of urls){
 const path=new URL(url).pathname;
 const {response,body}=await get(path);
 assert.equal(response.status,200,path);
 assert.equal(response.headers.get('x-robots-tag'),'index,follow',path);
 assert.ok(body.includes('<meta name="robots" content="index,follow"/>'),path);
 assert.ok(body.includes(`<link rel="canonical" href="${url}"/>`),path);
 assert.equal((body.match(/<h1(?:\s|>)/g)||[]).length,1,path);
}

const core=await get('/aluminum-die-casting-molds/');
assert.ok(core.body.includes('Custom Aluminum Die Casting Molds for Your Part'));
for(const stem of ['hero','design','lighting','motor','electronics','trial'])assert.ok(core.body.includes(`/assets/core-mold-${stem}-v1.webp`),stem);

const legal=await get('/privacy');
assert.equal(legal.response.headers.get('x-robots-tag'),'noindex,follow');
const confirmation=await get('/inquiry-received/');
assert.equal(confirmation.response.headers.get('x-robots-tag'),'noindex,nofollow');

console.log(`Live SEO verified: ${urls.length} indexable marketing pages, private/legal exclusions, canonical core page, and six distinct service images.`);

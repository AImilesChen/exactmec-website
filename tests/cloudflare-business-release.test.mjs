import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';
import {createSiteConfig} from '../src/site-config.mjs';
import {getPageMeta} from '../src/seo/metadata.mjs';
import {publicRuntimeConfig,renderPublishedHtml} from '../cloudflare/cms-response.mjs';

const complete={origin:'https://exactmec.com',release:true,legalApproved:true,backendVerified:true,contactEmailVerified:true,inquiryEnabled:true};
const env={SITE_ORIGIN:'https://exactmec.com',RELEASE:'true',LEGAL_APPROVED:'true',BACKEND_VERIFIED:'true',CONTACT_EMAIL_VERIFIED:'true',COLLECTION_ENABLED:'true',SEO_INDEXING_ENABLED:'false',AHREFS_AUDIT_ENABLED:'true',ASSETS:{fetch:async request=>new Response(new URL(request.url).pathname==='/sitemap.xml'?'<urlset><url><loc>https://exactmec.com/should-not-leak/</loc></url></urlset>':'<html><head><title>Home</title><meta name="robots" content="index,follow"/></head><body><!--exactmec:root:start--><div id="root"></div><!--exactmec:root:end--></body></html>',{headers:{'Content-Type':new URL(request.url).pathname.endsWith('.xml')?'application/xml':'text/html'}})}};
test('business release opens a configured guest inquiry while search remains explicitly closed',()=>{
 const config=createSiteConfig(complete);assert.equal(config.inquiryEnabled,true);assert.equal(config.seoIndexingEnabled,false);
 const meta=getPageMeta('/',{origin:config.origin,release:config.release,indexingEnabled:config.seoIndexingEnabled});
 assert.equal(meta.robots,'noindex,nofollow');assert.equal(meta.jsonLd,null);assert.equal(meta.canonical,'https://exactmec.com/');
 assert.equal(createSiteConfig({...complete,seoIndexingEnabled:true}).seoIndexingEnabled,true);
 assert.equal(createSiteConfig({...complete,release:false,seoIndexingEnabled:true}).seoIndexingEnabled,false);
 assert.equal(getPageMeta('/',{origin:config.origin,release:false,indexingEnabled:true}).robots,'noindex,nofollow');
});
test('Worker release headers, robots and sitemap keep indexing closed without losing SiteAudit exception',async()=>{
 const request=path=>worker.fetch(new Request('https://exactmec.com'+path),env);
 assert.equal((await request('/')).headers.get('X-Robots-Tag'),'noindex,nofollow');
 const robots=await request('/robots.txt'),text=await robots.text();assert.equal(robots.status,200);assert.equal(robots.headers.get('Cache-Control'),'no-store');
 assert.ok(text.startsWith('User-agent: *\nDisallow: /\n'));assert.match(text,/User-agent: AhrefsSiteAudit/);assert.doesNotMatch(text,/User-agent: AhrefsBot/);
 const sitemap=await request('/sitemap.xml');assert.equal(sitemap.status,200);assert.doesNotMatch(await sitemap.text(),/<url>/);
 for(const path of ['/account/login/','/admin/login/'])assert.equal((await request(path)).headers.get('X-Robots-Tag'),'noindex,nofollow');
});
test('CMS runtime and SSR preserve noindex during enabled inquiry release, and preview cannot enable search',async()=>{
 const bundle={pages:[],withdrawn:[],routes:{},settings:{}};
 const config=publicRuntimeConfig(env,bundle);assert.equal(config.inquiryEnabled,true);assert.equal(config.seoIndexingEnabled,false);
 const shell=await env.ASSETS.fetch(new Request('https://exactmec.com/index.html'));
 const response=renderPublishedHtml(await shell.text(),'/',env,bundle,undefined,'/'),html=await response.text();
 assert.match(html,/<meta name="robots" content="noindex,nofollow"/);assert.doesNotMatch(html,/id="page-schema"/);
 const data=JSON.parse(html.match(/id="site-bootstrap">([\s\S]*?)<\/script>/)[1]);assert.equal(data.config.inquiryEnabled,true);assert.equal(data.config.seoIndexingEnabled,false);
 const preview=publicRuntimeConfig({...env,SEO_INDEXING_ENABLED:'true'},{...bundle,preview:true});assert.equal(preview.seoIndexingEnabled,false);assert.equal(preview.inquiryEnabled,false);
});

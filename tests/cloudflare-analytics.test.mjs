import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';
import {publicRuntimeConfig} from '../cloudflare/cms-response.mjs';
import {createSiteConfig} from '../src/site-config.mjs';

const env={SITE_ORIGIN:'https://exactmec.com',RELEASE:'false',LEGAL_APPROVED:'false',COLLECTION_ENABLED:'false',EXTERNAL_ANALYTICS_ENABLED:'true',ASSETS:{fetch:async()=>new Response('<html>review</html>',{headers:{'Content-Type':'text/html'}})}};
const response=path=>worker.fetch(new Request('https://exactmec.com'+path),env);
test('opt-in vendor CSP is scoped to marketing pages without opening inquiry or private pages',async()=>{
 for(const path of ['/','/about/']){
  const r=await response(path),csp=r.headers.get('Content-Security-Policy');
  assert.match(csp,/www\.googletagmanager\.com/);assert.match(csp,/scripts\.clarity\.ms/);assert.match(csp,/plausible\.shipsolo\.io/);assert.match(csp,/analytics\.ahrefs\.com/);
  assert.doesNotMatch(csp,/unsafe-eval|script-src[^;]*unsafe-inline/);
  assert.equal(r.headers.get('X-Robots-Tag'),'noindex,nofollow');
 }
 for(const path of ['/request-a-quote/','/inquiry-received/','/privacy','/cookies','/account/login/','/admin/login/','/api/inquiries','/unknown/']){
  const r=await response(path),csp=r.headers.get('Content-Security-Policy');
  assert.doesNotMatch(csp,/googletagmanager|google-analytics|clarity|bing\.com|shipsolo|analytics\.ahrefs\.com/ ,path);
  if(['/request-a-quote/','/inquiry-received/'].includes(path))assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');
 }
});
test('external measurement does not enable business collection or authenticated CMS preview measurement',()=>{
 const c=createSiteConfig({origin:'https://exactmec.com',externalAnalyticsEnabled:true});
 assert.equal(c.externalAnalyticsEnabled,true);assert.equal(c.release,false);assert.equal(c.inquiryEnabled,false);assert.equal(c.analyticsEnabled,false);
 assert.equal(createSiteConfig({origin:'https://preview.invalid',externalAnalyticsEnabled:true}).externalAnalyticsEnabled,false);
 assert.equal(publicRuntimeConfig(env,{preview:true}).externalAnalyticsEnabled,false);
 assert.equal(publicRuntimeConfig(env,{preview:false}).externalAnalyticsEnabled,true);
});

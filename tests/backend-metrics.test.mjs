import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handleMetrics} from '../backend/metrics.mjs';
let mf,DB;
before(async()=>{mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("synthetic")}}',compatibilityDate:'2026-10-01',d1Databases:{DB:'metrics-synthetic'}}));DB=await mf.getD1Database('DB');for(const file of ['0001_inquiries.sql','0005_metrics.sql']){const sql=await fs.readFile(new URL('../migrations/'+file,import.meta.url),'utf8');await DB.batch(sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>DB.prepare(s)));}});
after(async()=>{await mf?.dispose();});
const req=body=>new Request('https://exactmec.com/api/events',{method:'POST',body:JSON.stringify(body)});
const event={event:'pageview',payload:{route:'/about/'},choice:'allow'};
test('optional metrics fail closed and reject personal/unknown payloads',async()=>{
 assert.equal((await handleMetrics(req(event),{DB},{localSynthetic:true})).status,503);
 for(const bad of [{...event,choice:'deny'},{...event,payload:{route:'/about/',email:'synthetic@example.com'}},{...event,event:'arbitrary'},{...event,payload:{route:'https://other.example/private'}}])assert.equal((await handleMetrics(req(bad),{DB,METRICS_ENABLED:true},{localSynthetic:true})).status,422);
 assert.equal((await DB.prepare('SELECT count(*) AS n FROM metric_counts').first()).n,0);
});
test('daily aggregation strips query, stores no visitor and is admin-only',async()=>{
 for(let i=0;i<2;i++)assert.equal((await handleMetrics(req({...event,payload:{route:'/about/?email=synthetic@example.com'}}),{DB,METRICS_ENABLED:true},{localSynthetic:true})).status,204);
 const rows=(await DB.prepare('SELECT * FROM metric_counts').all()).results;
 assert.equal(rows.length,1);assert.equal(rows[0].count,2);assert.equal(rows[0].route,'/about/');
 assert.doesNotMatch(JSON.stringify(rows),/synthetic@example|visitor|referrer|user_agent|ip_address/);
 const read=new Request('https://exactmec.com/api/admin/metrics');
 assert.equal((await handleMetrics(read,{DB})).status,403);
 const result=await(await handleMetrics(read,{DB},{actor:{id:'synthetic'}})).json();assert.equal(result.items[0].count,2);
});
test('production metrics require release, configured anti-abuse secret and limited buckets',async()=>{
 assert.equal((await handleMetrics(req(event),{DB,METRICS_ENABLED:true})).status,503);
 assert.equal((await handleMetrics(req(event),{DB,METRICS_ENABLED:true,RELEASE:true})).status,503);
 const env={DB,METRICS_ENABLED:true,RELEASE:true,RATE_LIMIT_SECRET:'synthetic-only-secret-not-for-production'.repeat(2)};
 const request=()=>new Request(req(event),{headers:{'CF-Connecting-IP':'192.0.2.12'}});
 assert.equal((await handleMetrics(request(),env)).status,204);
 const bucket=await DB.prepare('SELECT bucket_hash FROM rate_buckets').first();
 assert.match(bucket.bucket_hash,/^[a-f0-9]{64}$/);assert.ok(!bucket.bucket_hash.includes('192.0.2.12'));
 await DB.prepare('UPDATE rate_buckets SET attempts=120').run();
 assert.equal((await handleMetrics(request(),env)).status,429);
});
test('consented page views aggregate approximate geography without storing identifiers',async()=>{
 const env={DB,METRICS_ENABLED:true};
 assert.equal((await handleMetrics(req(event),env,{localSynthetic:true,geo:{country:'US',city:'New York'}})).status,204);
 assert.equal((await handleMetrics(req(event),env,{localSynthetic:true,geo:{country:'US',city:'New York'}})).status,204);
 const rows=(await DB.prepare("SELECT placement AS country,status AS city,count AS views FROM metric_counts WHERE event='geo_pageview'").all()).results;
 assert.deepEqual(rows,[{country:'US',city:'New York',views:2}]);
 assert.equal((await handleMetrics(req({...event,payload:{route:'/request-a-quote/'}}),env,{localSynthetic:true,geo:{country:'GB',city:'London'}})).status,204);
 assert.equal((await DB.prepare("SELECT count(*) AS n FROM metric_counts WHERE event='geo_pageview'").first()).n,1);
 const report=await(await handleMetrics(new Request('https://exactmec.com/api/admin/metrics'),env,{actor:{id:'synthetic'}})).json();
 assert.equal(report.locations[0].views,2);
 assert.deepEqual(report.inquiries,[]);
});

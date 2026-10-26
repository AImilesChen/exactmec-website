import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handleBusiness,getNotificationJob} from '../backend/business.mjs';
import {deliverNotification,notificationMessage} from '../backend/notifications.mjs';
import {initialValues,buildInquiryPayload} from '../src/inquiry/model.mjs';
let mf,env;
before(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-01',d1Databases:{DB:'synthetic-notification-tests'}}));
 const DB=await mf.getD1Database('DB');const sql=await fs.readFile(new URL('../migrations/0001_inquiries.sql',import.meta.url),'utf8');await DB.batch(sql.split(';').map(x=>x.trim()).filter(Boolean).map(x=>DB.prepare(x)));
 env={DB,SITE_ORIGIN:'https://exactmec.com',RATE_LIMIT_SECRET:'synthetic-rate-secret-not-production-0000',CONTACT_HASH_SECRET:'synthetic-contact-secret-not-production-0000',NOTICE_VERSION:'inquiry-copy-2026-10-25-draft',PRIVACY_VERSION:'privacy-policy-draft',PROCESSING_BASIS:'purpose_limited_consent_draft',WHATSAPP_NOTICE_VERSION:'inquiry-copy-2026-10-25-draft',NOTIFY_FROM:'test@example.com',NOTIFY_TO:'internal@example.com'};
});
after(async()=>mf?.dispose());
async function create(){const payload=buildInquiryPayload({...initialValues(),name:'Synthetic Private Name',company:'Synthetic Private Company',email:'buyer@example.com',phone:'+1 202 555 0140',country:'Malaysia',city:'Synthetic City',component:'Synthetic confidential component',description:'Synthetic private project body',drawing_status:'Clear 2D part drawings',processing:true});const r=await handleBusiness(new Request('https://exactmec.com/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID(),'CF-Connecting-IP':crypto.randomUUID()},body:JSON.stringify(payload)}),env,{localSynthetic:true});assert.equal(r.status,201);return(await r.json()).reference;}
test('unconfigured notifications never invoke transport or turn a pending job into sent',async()=>{const ref=await create();let calls=0;const r=await deliverNotification({...env,EMAIL:{send(){calls++}}},ref);assert.equal(r.state,'disabled');assert.equal(calls,0);assert.equal((await getNotificationJob(env.DB,ref)).state,'pending');});
test('confirmed transport accepts only a minimal reference and protected link, with no customer data',async()=>{const ref=await create();let message,calls=0;const configured={...env,NOTIFICATIONS_ENABLED:'true',EMAIL:{async send(value){message=value;calls++;return {messageId:'synthetic-message-id'}}}};assert.equal((await deliverNotification(configured,ref)).state,'sent');assert.match(message.text,/https:\/\/exactmec\.com\/admin\/leads\//);assert.doesNotMatch(JSON.stringify(message),/Synthetic Private|buyer@|1202555|confidential component|private project/);assert.equal(message.to,'internal@example.com');await deliverNotification(configured,ref);assert.equal(calls,1);});
test('failure and timeout retain the saved inquiry and provide a bounded manual retry state',async()=>{for(const sender of [async()=>{throw new Error('private-provider-detail')},()=>new Promise(()=>{})]){const ref=await create();const r=await deliverNotification({...env,NOTIFICATIONS_ENABLED:'true',EMAIL:{send:sender}},ref,{timeoutMs:10});assert.equal(r.state,'failed');assert.equal((await getNotificationJob(env.DB,ref)).errorCode,'delivery_unconfirmed');assert.ok(await env.DB.prepare('SELECT reference FROM leads WHERE reference=?').bind(ref).first());assert.doesNotMatch(JSON.stringify(r),/private-provider-detail/);}});

test('simultaneous notification attempts claim the outbox once',async()=>{
 const ref=await create();let calls=0;
 const configured={...env,NOTIFICATIONS_ENABLED:'true',EMAIL:{async send(){calls++;return {messageId:'synthetic-concurrent-id'};}}};
 const results=await Promise.all(Array.from({length:6},()=>deliverNotification(configured,ref)));
 assert.equal(calls,1);assert.ok(results.every(r=>['sent','pending'].includes(r.state)));
 const job=await getNotificationJob(env.DB,ref);assert.equal(job.state,'sent');assert.equal(job.attempts,1);
});

test('unconfirmed provider acceptance stays retryable without resubmitting the inquiry',async()=>{
 const ref=await create();let calls=0;
 const configured={...env,NOTIFICATIONS_ENABLED:'true',EMAIL:{async send(){calls++;return calls===1?{messageId:''}:{messageId:'synthetic-retry-id'};}}};
 assert.equal((await deliverNotification(configured,ref)).state,'failed');
 assert.equal((await deliverNotification(configured,ref)).state,'sent');
 assert.equal((await getNotificationJob(env.DB,ref)).attempts,2);
 assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM leads WHERE reference=?').bind(ref).first()).n,1);
 await deliverNotification(configured,ref);assert.equal(calls,2);
});

test('invalid addresses, origins and references cannot create email content',()=>{
 for(const invalid of [{...env,NOTIFY_TO:'sales@example.com\r\nBcc:other@example.com'},{...env,NOTIFY_FROM:'bad'},{...env,SITE_ORIGIN:'http://exactmec.com'},{...env,SITE_ORIGIN:'https://exactmec.com/other'},{...env,SITE_ORIGIN:'https://user:password@exactmec.com'}])assert.equal(notificationMessage(invalid,'EM_safe_reference'),null);
 for(const ref of ['bad','EM_reference\r\nInjected','../private','EM_?email=buyer@example.com'])assert.equal(notificationMessage(env,ref),null);
});

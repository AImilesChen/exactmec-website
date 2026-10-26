import noticeVersions from '../src/data/notice-versions.json' with {type:'json'};
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handleBusiness} from '../backend/business.mjs';
import {buildInquiryPayload,initialValues} from '../src/inquiry/model.mjs';
import {customerEmailAvailable,sendCustomerLoginCode} from '../backend/portal-email.mjs';

test('owner dashboard sees customer supplements and stops contact actions only for withdrawn project',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("synthetic")}}',compatibilityDate:'2026-10-01',d1Databases:{DB:'portal-admin-isolated'}}));
  try{
    const db=await mf.getD1Database('DB');
    for(const name of ['0001_inquiries.sql','0006_customer_portal.sql'])await db.batch(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
    const env={DB:db,SITE_ORIGIN:'https://exactmec.com',CUSTOMER_SCHEMA_READY:'true',RATE_LIMIT_SECRET:'synthetic-rate-secret-more-than-32-characters',CONTACT_HASH_SECRET:'synthetic-contact-secret-more-than-32-characters',NOTICE_VERSION: noticeVersions.notice_version,PRIVACY_VERSION: noticeVersions.privacy_version,PROCESSING_BASIS: noticeVersions.privacy_processing_basis,WHATSAPP_NOTICE_VERSION: noticeVersions.whatsapp_choice_text_version};
    const actor={id:'synthetic-owner',email:'owner@example.invalid'},context={actor,localSynthetic:true};
    const request=(path,method='GET',body,extra={})=>new Request('https://exactmec.com'+path,{method,headers:{'Content-Type':'application/json',...extra},...(method!=='GET'?{body:JSON.stringify(body)}:{})});
    const payload=buildInquiryPayload({...initialValues(),name:'Synthetic buyer',company:'Synthetic company',email:'buyer@example.invalid',phone:'+12025550140',country:'United States',city:'Synthetic city',component:'Synthetic housing',description:'Synthetic portal test only.',drawing_status:'A physical sample',processing:true,whatsapp:true});
    const refs=[];
    for(let i=0;i<2;i++){
      const response=await handleBusiness(request('/api/inquiries','POST',payload,{'Idempotency-Key':crypto.randomUUID(),'CF-Connecting-IP':'192.0.2.'+(10+i)}),env,context);
      assert.equal(response.status,201);refs.push((await response.json()).reference);
    }
    const at=new Date().toISOString();
    await db.batch([
      db.prepare('INSERT INTO customer_inquiry_state(reference,revision,withdrawn_at,updated_at) VALUES(?,2,?,?)').bind(refs[0],at,at),
      db.prepare('INSERT INTO customer_supplements(id,reference,note,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),refs[0],'Customer supplied synthetic clarification.',at),
    ]);
    const get=async reference=>(await(await handleBusiness(request('/api/admin/leads/'+reference),env,context)).json()).lead;
    const withdrawn=await get(refs[0]),other=await get(refs[1]);
    assert.equal(withdrawn.customer.withdrawn,true);
    assert.equal(withdrawn.customer.supplements[0].note,'Customer supplied synthetic clarification.');
    assert.equal(withdrawn.contact.email_allowed,false);
    assert.equal(withdrawn.contact.whatsapp_allowed,false);
    assert.equal(withdrawn.contact.withdrawal_requested,true);
    assert.equal(withdrawn.review.status,'New');assert.equal(withdrawn.revision,1);
    assert.equal(other.customer.withdrawn,false);assert.equal(other.contact.email_allowed,true);assert.equal(other.contact.whatsapp_allowed,true);
    const csv=await(await handleBusiness(request('/api/admin/leads/export','POST',{}),env,context)).text();
    assert.match(csv,/customer_withdrawn/);
    const deleted=await handleBusiness(request('/api/admin/leads/'+refs[0],'DELETE',{revision:withdrawn.revision,confirmation:refs[0]}),env,context);
    assert.equal(deleted.status,204);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM customer_inquiry_state WHERE reference=?').bind(refs[0]).first()).n,0);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM customer_supplements WHERE reference=?').bind(refs[0]).first()).n,0);
  }finally{await mf.dispose();}
});

test('customer OTP uses a separate explicitly enabled sender binding and never the internal sales notification binding',async()=>{
  let calls=0,captured;
  const env={CUSTOMER_EMAIL_ENABLED:'true',CUSTOMER_EMAIL_FROM:'sales@exactmec.com',CUSTOMER_EMAIL:{async send(message){calls++;captured=message;return {messageId:'synthetic-message-id'};}},EMAIL:{async send(){throw new Error('must not use internal binding');}}};
  assert.equal(customerEmailAvailable({...env,CUSTOMER_EMAIL_ENABLED:'false'}),false);
  await assert.rejects(()=>sendCustomerLoginCode({...env,CUSTOMER_EMAIL_ENABLED:'false'},{email:'buyer@example.invalid',code:'123456',expiresMinutes:10}));
  assert.equal(calls,0);
  assert.deepEqual(await sendCustomerLoginCode(env,{email:'buyer@example.invalid',code:'123456',expiresMinutes:10}),{accepted:true});
  assert.equal(calls,1);assert.equal(captured.to,'buyer@example.invalid');assert.equal(captured.from,'sales@exactmec.com');
  assert.match(captured.text,/123456/);assert.doesNotMatch(captured.text,/reference|budget|company/i);
  await assert.rejects(()=>sendCustomerLoginCode(env,{email:'bad\r\nBcc:other@example.invalid',code:'123456',expiresMinutes:10}));
  await assert.rejects(()=>sendCustomerLoginCode({...env,CUSTOMER_EMAIL:{async send(){return {};}}},{email:'buyer@example.invalid',code:'123456',expiresMinutes:10}));
});

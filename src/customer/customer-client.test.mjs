import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerClient,CustomerApiError,customerInquiry} from './client.mjs';
const reference='EM_SYNTHETIC_12345678';
const challenge='synthetic_random_challenge_123456789';
const now=()=>new Date().toISOString();
const session=()=>({authenticated:true,csrfToken:'synthetic-customer-csrf',expiresAt:new Date(Date.now()+3600000).toISOString()});
const inquiry=(extra={})=>({reference,revision:1,created_at:now(),updated_at:now(),status:'received',submitted:{name:'Synthetic Customer',company:'Synthetic Company',email:'customer@example.invalid',component:'Synthetic motor housing',description:'Synthetic requirements',mold_sets:1,mold_sets_unsure:false,budget_min:null,budget_max:null},supplements:[],withdrawn:false,withdrawn_at:null,...extra});
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
const kind=expected=>cause=>cause instanceof CustomerApiError&&cause.kind===expected;

test('email challenge is private memory; unknown-email acceptance uses the same schema without claiming delivery',async()=>{
 const calls=[];const client=createCustomerClient({fetchImpl:async(url,init)=>{calls.push({url,init});return url.endsWith('/request-code')?json({accepted:true,challenge},202):json(session());}});
 const accepted=await client.requestCode(' customer@example.invalid ');assert.deepEqual(accepted,{accepted:true,retryAfter:60});assert.equal(accepted.challenge,undefined);
 const signedIn=await client.verifyCode('123456');assert.equal(signedIn.authenticated,true);assert.equal(signedIn.csrfToken,undefined);
 assert.deepEqual(calls.map(x=>x.url),['/api/customer/auth/request-code','/api/customer/auth/verify-code']);
 assert.deepEqual(JSON.parse(calls[0].init.body),{email:'customer@example.invalid'});assert.deepEqual(JSON.parse(calls[1].init.body),{challenge,code:'123456'});
 for(const{init}of calls){assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.referrerPolicy,'no-referrer');assert.equal(init.headers['X-CSRF-Token'],undefined);}
 await assert.rejects(client.verifyCode('123456'),kind('invalid'));
});

test('closed503 does not produce a challenge or fake verification success; bad response schemas also fail closed',async()=>{
 let calls=0;const client=createCustomerClient({fetchImpl:async()=>{calls++;return json({error:'portal_unavailable',message:'private provider detail'},503);}});
 await assert.rejects(client.requestCode('customer@example.invalid'),cause=>cause.kind==='unavailable'&&!cause.message.includes('private'));await assert.rejects(client.verifyCode('123456'),kind('invalid'));assert.equal(calls,1);
 for(const response of [()=>json({accepted:true,challenge},200),()=>json({accepted:true,challenge:'<script>'},202),()=>new Response('<html>Login</html>',{status:200,headers:{'Content-Type':'text/html'}})]){const malformed=createCustomerClient({fetchImpl:async()=>response()});await assert.rejects(malformed.requestCode('customer@example.invalid'),kind('invalid_response'));}
});

test('failed code and rate limits are fixed safe states; retries require another explicit method call',async()=>{
 let calls=0;const client=createCustomerClient({fetchImpl:async url=>{calls++;return url.endsWith('/request-code')?json({accepted:true,challenge},202):json({error:'invalid_code',message:'raw code detail'},400);}});
 await client.requestCode('customer@example.invalid');await assert.rejects(client.verifyCode('123456'),cause=>cause.kind==='invalid_code'&&!cause.message.includes('raw'));assert.equal(calls,2);
 const limited=createCustomerClient({fetchImpl:async()=>json({error:'rate_limited'},429,{'Retry-After':'91'})});await assert.rejects(limited.requestCode('customer@example.invalid'),cause=>cause.kind==='rate_limit'&&cause.retryAfter===91);
});

test('protected writes use in-memory CSRF, exact bodies and immutable customer projection',async()=>{
 const calls=[];const client=createCustomerClient({fetchImpl:async(url,init)=>{calls.push({url,init});if(url.endsWith('/session'))return json(session());if(url.endsWith('/supplements'))return json({inquiry:inquiry({revision:2,supplements:[{id:'supplement_one',note:'Synthetic clarification.',created_at:now(),actor:'internal-editor'}]})},201);if(url.endsWith('/withdraw'))return json({inquiry:inquiry({revision:3,status:'withdrawn',withdrawn:true,withdrawn_at:now()})});return json({inquiry:inquiry()});}});
 await assert.rejects(client.supplement(reference,{revision:1,note:'Synthetic clarification.'}),kind('csrf'));assert.equal(calls.length,0);
 const auth=await client.session();assert.equal(auth.csrfToken,undefined);
 const added=await client.supplement(reference,{revision:1,note:' Synthetic clarification. ',email:'other@example.invalid'});assert.equal(added.revision,2);assert.deepEqual(Object.keys(added.supplements[0]),['id','note','created_at']);
 assert.deepEqual(JSON.parse(calls[1].init.body),{revision:1,note:'Synthetic clarification.'});assert.equal(calls[1].init.headers['X-CSRF-Token'],'synthetic-customer-csrf');
 const withdrawn=await client.withdraw(reference,{revision:2,note:'not sent'});assert.equal(withdrawn.withdrawn,true);assert.deepEqual(JSON.parse(calls[2].init.body),{revision:2});
 assert.doesNotMatch(calls.map(x=>x.url).join(' '),/customer@example|Synthetic clarification|123456\?|csrf/);
});

test('invalid references, revisions and notes are rejected before transmission',async()=>{
 let calls=0;const client=createCustomerClient({fetchImpl:async()=>{calls++;return json(session());}});await client.session();
 for(const value of ['../other','EM_X?email=someone','https://example.invalid','short'])await assert.rejects(client.get(value),kind('invalid'));
 for(const input of [{revision:0,note:'Note'},{revision:1,note:''},{revision:1,note:'x'.repeat(4001)},{revision:1,note:'bad\u0000note'}])await assert.rejects(client.supplement(reference,input),kind('invalid'));
 await assert.rejects(client.requestCode('not an email'),kind('invalid'));assert.equal(calls,1);
});

test('customer responses never expose internal review/notes/sources; wrong references and malformed records fail',async()=>{
 const projected=customerInquiry(inquiry({review:{priority:'A'},notes:['INTERNAL_ONLY'],source:{utm_campaign:'PRIVATE_SOURCE'},submitted:{...inquiry().submitted,internal_score:10},supplements:[{id:'safe-id',note:'Customer-owned information',created_at:now(),internal_comment:'SECRET'}]}));
 assert.doesNotMatch(JSON.stringify(projected),/INTERNAL_ONLY|PRIVATE_SOURCE|internal_score|SECRET|priority/);
 const client=createCustomerClient({fetchImpl:async()=>json({inquiry:inquiry({reference:'EM_OTHER_CUSTOMER_12345'})})});await assert.rejects(client.get(reference),kind('invalid_response'));
 for(const patch of [{status:'Qualified'},{revision:0},{withdrawn:'true'},{created_at:'yesterday'},{supplements:[{id:'bad',note:'x',created_at:'invalid'}]}])assert.throws(()=>customerInquiry(inquiry(patch)),kind('invalid_response'));
});

test('list is bounded and uses the fixed URL without search/contact data',async()=>{
 const calls=[];const client=createCustomerClient({fetchImpl:async(url,init)=>{calls.push({url,init});return json({items:[inquiry()],total:1,limit:50,adminExportUrl:'/admin/private/'});}});
 const result=await client.list();assert.equal(result.items.length,1);assert.equal(result.adminExportUrl,undefined);assert.equal(calls[0].url,'/api/customer/inquiries');assert.equal(calls[0].init.method,'GET');
 const bad=createCustomerClient({fetchImpl:async()=>json({items:Array(51).fill(inquiry()),total:51,limit:50})});await assert.rejects(bad.list(),kind('invalid_response'));
});

test('expired sessions clear CSRF; conflicts/withdrawal/outages do not replay a write',async()=>{
 for(const[status,error,expected]of [[409,'revision_conflict','conflict'],[409,'withdrawn','withdrawn'],[503,'portal_unavailable','unavailable'],[401,'unauthorized','expired']]){
  let calls=0;const client=createCustomerClient({fetchImpl:async url=>{calls++;return url.endsWith('/session')?json(session()):json({error,message:'raw private detail'},status);}});await client.session();await assert.rejects(client.supplement(reference,{revision:1,note:'Synthetic note'}),cause=>cause.kind===expected&&!cause.message.includes('private'));assert.equal(calls,2);
  if(status===401){await assert.rejects(client.withdraw(reference,{revision:1}),kind('csrf'));assert.equal(calls,2);}
 }
});

test('simultaneous mutations cannot transmit twice and uncertain network/timeout results are never success',async()=>{
 let release;let calls=0;const client=createCustomerClient({fetchImpl:async url=>{calls++;return url.endsWith('/session')?json(session()):new Promise(resolve=>{release=()=>resolve(json({inquiry:inquiry({revision:2})},201));});}});await client.session();const pending=client.supplement(reference,{revision:1,note:'Synthetic note'});await assert.rejects(client.supplement(reference,{revision:1,note:'Synthetic note'}),kind('busy'));release();await pending;assert.equal(calls,2);
 const timeout=createCustomerClient({timeoutMs:5,fetchImpl:async(url,init)=>url.endsWith('/session')?json(session()):new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('private network text')),{once:true}))});await timeout.session();await assert.rejects(timeout.supplement(reference,{revision:1,note:'Synthetic note'}),kind('timeout'));
 const broken=createCustomerClient({fetchImpl:async()=>{throw new Error('private network text');}});await assert.rejects(broken.list(),cause=>cause.kind==='network'&&!cause.message.includes('private'));
});

test('logout clears credentials only after confirmed response; destruction prevents all future requests',async()=>{
 const calls=[];const client=createCustomerClient({fetchImpl:async(url,init)=>{calls.push({url,init});return url.endsWith('/session')?json(session()):new Response(null,{status:204});}});await client.session();await client.logout();assert.equal(calls[1].url,'/api/customer/logout');assert.equal(calls[1].init.headers['X-CSRF-Token'],'synthetic-customer-csrf');await assert.rejects(client.withdraw(reference,{revision:1}),kind('csrf'));client.destroy();await assert.rejects(client.session(),kind('unavailable'));assert.equal(calls.length,2);
});


test('changing email or route invalidates pending challenge/verification responses',async()=>{
 let finish;const client=createCustomerClient({fetchImpl:async()=>new Promise(resolve=>{finish=()=>resolve(json({accepted:true,challenge},202));})});
 const pending=client.requestCode('customer@example.invalid');client.resetChallenge();finish();await assert.rejects(pending,kind('invalid_code'));await assert.rejects(client.verifyCode('123456'),kind('invalid'));
 let finishVerify;const verifying=createCustomerClient({fetchImpl:async url=>url.endsWith('/request-code')?json({accepted:true,challenge},202):new Promise(resolve=>{finishVerify=()=>resolve(json(session()));})});
 await verifying.requestCode('customer@example.invalid');const attempt=verifying.verifyCode('123456');verifying.resetChallenge();finishVerify();await assert.rejects(attempt,kind('invalid_code'));await assert.rejects(verifying.withdraw(reference,{revision:1}),kind('csrf'));
});

test('backend CSRF-required and note-limit codes have safe distinct states',async()=>{
 for(const[status,error,expected]of[[403,'csrf_required','csrf'],[409,'supplement_limit','supplement_limit']]){
  let calls=0;const client=createCustomerClient({fetchImpl:async url=>{calls++;return url.endsWith('/session')?json(session()):json({error},status);}});await client.session();await assert.rejects(client.supplement(reference,{revision:1,note:'Synthetic note'}),kind(expected));assert.equal(calls,2);
  if(expected==='csrf'){await assert.rejects(client.withdraw(reference,{revision:1}),kind('csrf'));assert.equal(calls,2);}
 }
});

test('supplemental drawing uses bounded multipart and preserves the server-projected file list',async()=>{
 const calls=[];const id='123e4567-e89b-42d3-a456-426614174000';
 const client=createCustomerClient({fetchImpl:async(url,init)=>{calls.push({url,init});return url.endsWith('/session')?json(session()):json({inquiry:inquiry({revision:2,extra_files:[{id,name:'revision.step',size:5,extension:'step',created_at:now(),internal_note:'SECRET'}]})},201);}});
 await client.session();const saved=await client.uploadFile(reference,{revision:1,file:new File(['hello'],'revision.step')});
 assert.equal(saved.extra_files[0].name,'revision.step');assert.equal(saved.extra_files[0].internal_note,undefined);
 assert.equal(calls[1].url,`/api/customer/inquiries/${reference}/files`);assert.equal(calls[1].init.headers['Content-Type'],undefined);assert.equal(calls[1].init.headers['X-CSRF-Token'],'synthetic-customer-csrf');assert.equal(calls[1].init.body.get('revision'),'1');
 await assert.rejects(client.uploadFile(reference,{revision:2,file:new File(['hello'],'bad'.repeat(60)+'.step')}),kind('invalid'));
});

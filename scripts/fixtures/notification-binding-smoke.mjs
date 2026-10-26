// Explicit, short-lived remote-dev fixture. Never imported by the site Worker.
// No D1 binding and no customer records. Run only with the private smoke config.
import {notificationMessage} from '../../backend/notifications.mjs';
let sent=false;
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow'}});
async function sendTest(env,reference){
 if(env.NOTIFY_FROM!=='sales@exactmec.com'||env.NOTIFY_TO!=='sales@exactmec.com'||env.SITE_ORIGIN!=='https://exactmec.com'||env.DB)throw new Error('unsafe_fixture_configuration');
 const message=notificationMessage(env,reference);
 if(!message)throw new Error('invalid_message');
 message.subject='[TEST] '+message.subject+' ('+reference+')';
 message.text='Technical notification test only. This is not a customer inquiry.\n\n'+message.text;
 const result=await env.EMAIL.send(message);
 if(!result?.messageId)throw new Error('acceptance_unconfirmed');
 return {accepted:true,reference,messageId:result.messageId,recipient:message.to,containsCustomerData:false};
}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET')return reply({fixture:true,mailConfigured:!!env.EMAIL?.send});
  if(path!=='/send-test'||request.method!=='POST')return reply({error:'not_found'},404);
  if(!env.SMOKE_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.SMOKE_TOKEN}`)return reply({error:'unauthorized'},403);
  if(env.NOTIFY_FROM!=='sales@exactmec.com'||env.NOTIFY_TO!=='sales@exactmec.com'||env.SITE_ORIGIN!=='https://exactmec.com'||env.DB)return reply({error:'unsafe_fixture_configuration'},503);
  if(sent)return reply({error:'test_already_attempted'},409);
  sent=true;
  const reference='EM_NOTIFICATION_TEST_'+crypto.randomUUID().replace(/-/g,'');
  try{
   return reply(await sendTest(env,reference));
  }catch(error){return reply({error:'email_test_failed',providerCode:/^[A-Z_]{1,80}$/.test(error.code||'')?error.code:'unconfirmed',reference},502);}
 },
 async scheduled(event,env,ctx){
  const expected=Number(env.SMOKE_SCHEDULED_AT);
  if(!Number.isSafeInteger(expected)||event.scheduledTime!==expected||Math.abs(Date.now()-expected)>120000)return;
  ctx.waitUntil(sendTest(env,env.SMOKE_REFERENCE).then(result=>console.log(JSON.stringify(result))).catch(error=>console.log(JSON.stringify({accepted:false,providerCode:/^[A-Z_]{1,80}$/.test(error.code||'')?error.code:'unconfirmed'}))));
 },
};

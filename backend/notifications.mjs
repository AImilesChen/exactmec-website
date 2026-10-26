import {getNotificationJob,claimNotification,finishNotification} from './business.mjs';
import {validReference} from './domain.mjs';

const email=value=>typeof value==='string'&&value.length<=254&&/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);
export function notificationMessage(env,reference) {
 if(!email(env.NOTIFY_TO)||!email(env.NOTIFY_FROM)||!validReference(reference))return null;
 let origin;try{const u=new URL(env.SITE_ORIGIN);if(u.protocol!=='https:'||u.origin!==env.SITE_ORIGIN)throw new Error();origin=u.origin;}catch{return null;}
 // Only the opaque reference and protected URL belong in an email. The
 // recipient and sender are fixed server settings, never submission fields.
 return {to:env.NOTIFY_TO,from:env.NOTIFY_FROM,subject:'EXACTMEC: inquiry awaiting review',text:`A mold inquiry is ready for review.\nReference: ${reference}\nOpen the protected dashboard: ${origin}/admin/leads/${encodeURIComponent(reference)}/\n`};
}
export async function deliverNotification(env,reference,{timeoutMs=15000}={}) {
 const job=await getNotificationJob(env.DB,reference);
 if(!job)return {state:'missing'};
 if(job.state==='sent')return {state:'sent',attempts:job.attempts};
 const message=notificationMessage(env,reference);
 if(env.NOTIFICATIONS_ENABLED!=='true'||!env.EMAIL?.send||!message)return {state:'disabled',attempts:job.attempts,errorCode:'not_configured'};
 const claimed=await claimNotification(env.DB,reference);if(!claimed)return {state:'pending'};
 let timer;
 try{
  const result=await Promise.race([env.EMAIL.send(message),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('unconfirmed')),timeoutMs)})]);
  if(!result||typeof result.messageId!=='string'||!result.messageId)throw new Error('unconfirmed');
  await finishNotification(env.DB,reference,{state:'sent',errorCode:null,attempts:claimed.attempts});return {state:'sent'};
 }catch{
  await finishNotification(env.DB,reference,{state:'failed',errorCode:'delivery_unconfirmed',attempts:claimed.attempts});return {state:'failed',errorCode:'delivery_unconfirmed'};
 }finally{clearTimeout(timer);}
}

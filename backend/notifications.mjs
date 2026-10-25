import {getNotificationJob,claimNotification,finishNotification} from './business.mjs';

const email=value=>typeof value==='string'&&value.length<=254&&/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);
export async function deliverNotification(env,reference,{timeoutMs=15000}={}) {
 const job=await getNotificationJob(env.DB,reference);
 if(!job)return {state:'missing'};
 if(job.state==='sent')return {state:'sent',attempts:job.attempts};
 if(env.NOTIFICATIONS_ENABLED!=='true'||!env.EMAIL?.send||!email(env.NOTIFY_TO)||!email(env.NOTIFY_FROM))return {state:'disabled',attempts:job.attempts,errorCode:'not_configured'};
 let origin;try{const u=new URL(env.SITE_ORIGIN);if(u.protocol!=='https:'||u.origin!==env.SITE_ORIGIN)throw new Error();origin=u.origin;}catch{return {state:'disabled',errorCode:'not_configured'};}
 const claimed=await claimNotification(env.DB,reference);if(!claimed)return {state:'pending'};
 let timer;
 try{
  // This outbox contains no customer contact or project body. Recipients and
  // senders come from approved server configuration, never the inquiry payload.
  const message={to:env.NOTIFY_TO,from:env.NOTIFY_FROM,subject:'EXACTMEC: inquiry awaiting review',text:`A mold inquiry is ready for review.\nReference: ${reference}\nOpen the protected dashboard: ${origin}/admin/leads/${encodeURIComponent(reference)}/\n`};
  const result=await Promise.race([env.EMAIL.send(message),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('unconfirmed')),timeoutMs)})]);
  if(!result||typeof result.messageId!=='string'||!result.messageId)throw new Error('unconfirmed');
  await finishNotification(env.DB,reference,{state:'sent',errorCode:null,attempts:claimed.attempts});return {state:'sent'};
 }catch{
  await finishNotification(env.DB,reference,{state:'failed',errorCode:'delivery_unconfirmed',attempts:claimed.attempts});return {state:'failed',errorCode:'delivery_unconfirmed'};
 }finally{clearTimeout(timer);}
}

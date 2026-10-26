import {authenticateAccess,issueCsrf,verifyCsrf} from './auth.mjs';
import {handleBusiness} from './business.mjs';
import {handleContent} from './content.mjs';
import {deliverNotification} from './notifications.mjs';
import {handleMetrics} from './metrics.mjs';

export const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}});
export function secureApi(response) {
 const headers=new Headers(response.headers);
 for(const [key,value]of Object.entries({'Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}))headers.set(key,value);
 headers.delete('Access-Control-Allow-Origin');headers.delete('Set-Cookie');
 return new Response(response.body,{status:response.status,headers});
}

export function writeOriginAllowed(request,env,{localSynthetic=false}={}) {
 try{
  const site=new URL(env.SITE_ORIGIN);
  if(site.origin!==env.SITE_ORIGIN||site.username||site.password||site.pathname!=='/'||(!localSynthetic&&site.protocol!=='https:'))return false;
  if(localSynthetic&&!['127.0.0.1','localhost'].includes(site.hostname))return false;
  const actual=new URL(request.url);
  return actual.origin===site.origin&&request.headers.get('Origin')===site.origin&&request.headers.get('Sec-Fetch-Site')!=='cross-site';
 }catch{return false;}
}

async function boundedJsonRequest(request) {
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return {error:json({error:'json_required'},415)};
 const claimed=Number(request.headers.get('Content-Length')||0);if(claimed>65536)return {error:json({error:'body_too_large'},413)};
 const reader=request.body?.getReader();let size=0;const chunks=[];
 if(reader){for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return {error:json({error:'body_too_large'},413)}}chunks.push(value);}}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();}catch{return {error:json({error:'invalid_json'},400)}}
 return {request:new Request(request.url,{method:request.method,headers:request.headers,body:text})};
}

// The production Worker calls this factory with no options. Local synthetic mode
// is only injected by the separate Node test host, never by a binding or header.
export function createApiHandler({authenticate=authenticateAccess,localSynthetic=false}={}) {
 return async function handleApi(request,env={},execution={}) {
  try{
   const path=new URL(request.url).pathname;
   if(!path.startsWith('/api/'))return null;
   if(!env.DB)return secureApi(json({error:'service_unavailable'},503));
   if(!['GET','POST','PATCH','DELETE'].includes(request.method))return secureApi(json({error:'method_not_allowed'},405,{Allow:'GET, POST, PATCH, DELETE'}));
   const admin=path.startsWith('/api/admin/');let actor=null;
   if(admin){actor=await authenticate(request,env);if(!actor)return secureApi(json({error:'unauthorized'},403));}
   if(request.method!=='GET'){
    if(!writeOriginAllowed(request,env,{localSynthetic}))return secureApi(json({error:'origin_denied'},403));
    if(admin&&!await verifyCsrf(request.headers.get('X-CSRF-Token'),actor,env))return secureApi(json({error:'csrf_required'},403));
    const body=await boundedJsonRequest(request);if(body.error)return secureApi(body.error);request=body.request;
    if(localSynthetic&&path==='/api/inquiries'){
     const fixture=await request.clone().json();
     if(!/^[^@\s]+@example\.com$/i.test(fixture.email||'')||String(fixture.phone||'').replace(/\D/g,'')!=='12025550140')return secureApi(json({errors:{email:'synthetic_only',phone:'synthetic_only'}},422));
    }
   }
   if(path==='/api/admin/session'&&request.method==='GET'){
    const csrfToken=await issueCsrf(actor,env);if(!csrfToken)return secureApi(json({error:'service_unavailable'},503));
    return secureApi(json({user:{email:actor.email},csrfToken,localSynthetic}));
   }
   const notify=reference=>deliverNotification(env,reference);
   const context={actor,localSynthetic,notify,waitUntil:execution.waitUntil?.bind(execution)};
   const response=path==='/api/events'||path==='/api/admin/metrics'?await handleMetrics(request,env,context):path.startsWith('/api/admin/content')?await handleContent(request,env,context):await handleBusiness(request,env,context);
   return secureApi(response||json({error:'not_found'},404));
  }catch{return secureApi(json({error:'service_unavailable'},503));}
 };
}

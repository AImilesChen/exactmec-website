import {ANALYTICS_EVENTS,sanitizeAnalyticsPayload} from '../src/analytics/index.mjs';
import {hmac} from './domain.mjs';

const enabled=value=>value===true||value==='true';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
const stmt=(db,sql,...values)=>db.prepare(sql).bind(...values);

// First-party daily totals only: no visitor identifier, URL query, referrer,
// contact value, inquiry reference, user-agent or IP enters this table.
export async function handleMetrics(request,env,{actor,localSynthetic=false}={}){
 const path=new URL(request.url).pathname;
 if(path==='/api/admin/metrics'&&request.method==='GET'){
  if(!actor)return json({error:'unauthorized'},403);
  const since=new Date(Date.now()-29*86400000).toISOString().slice(0,10);
  const rows=await stmt(env.DB,'SELECT day,event,route,placement,status,count FROM metric_counts WHERE day>=? ORDER BY day DESC,event,route LIMIT 10000',since).all();
  return json({enabled:enabled(env.METRICS_ENABLED),since,items:rows.results||[],definition:'Opt-in events, not unique visitors or messages sent.'});
 }
 if(path!=='/api/events')return null;
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(!enabled(env.METRICS_ENABLED)||!localSynthetic&&!enabled(env.RELEASE))return json({error:'measurement_disabled'},503);
 const body=await request.json();
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['event','payload','choice'].includes(k))||body.choice!=='allow'||!ANALYTICS_EVENTS.includes(body.event))return json({error:'invalid_event'},422);
 const safe=sanitizeAnalyticsPayload(body.payload);
 if(!safe||Object.keys(body.payload).some(k=>!['route','placement','status'].includes(k)))return json({error:'invalid_event'},422);
 if(!localSynthetic){
  if(typeof env.RATE_LIMIT_SECRET!=='string'||env.RATE_LIMIT_SECRET.length<32)return json({error:'service_unavailable'},503);
  const ip=request.headers.get('CF-Connecting-IP');
  if(!ip)return json({error:'service_unavailable'},503);
  const start=Math.floor(Date.now()/600000)*600000;
  const bucket=await hmac(env.RATE_LIMIT_SECRET,'metrics:'+start+':'+ip);
  const row=await stmt(env.DB,'INSERT INTO rate_buckets(bucket_hash,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket_hash) DO UPDATE SET attempts=attempts+1 RETURNING attempts',bucket,start+600000).first();
  if(row.attempts>120)return json({error:'rate_limited'},429);
 }
 const day=new Date().toISOString().slice(0,10);
 await stmt(env.DB,'INSERT INTO metric_counts(day,event,route,placement,status,count) VALUES(?,?,?,?,?,1) ON CONFLICT(day,event,route,placement,status) DO UPDATE SET count=MIN(count+1,1000000000)',day,body.event,safe.route,safe.placement||'',safe.status||'').run();
 return new Response(null,{status:204});
}

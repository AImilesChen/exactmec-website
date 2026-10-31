import {ANALYTICS_EVENTS,isMarketingRoute,sanitizeAnalyticsPayload} from '../src/analytics/index.mjs';
import {hmac} from './domain.mjs';

const enabled=value=>value===true||value==='true';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
const stmt=(db,sql,...values)=>db.prepare(sql).bind(...values);
const safeCountry=value=>typeof value==='string'&&/^[A-Z]{2}$/.test(value)?value:'Unknown';
const safeCity=value=>typeof value==='string'&&value.length<=80&&/^[\p{L}\p{M}\p{N} .,'()/-]+$/u.test(value)?value.trim()||'Unknown':'Unknown';

// First-party daily totals only: no visitor identifier, URL query, referrer,
// contact value, inquiry reference, user-agent or IP enters this table.
export async function handleMetrics(request,env,{actor,localSynthetic=false,geo=null}={}){
 const path=new URL(request.url).pathname;
 if(path==='/api/admin/metrics'&&request.method==='GET'){
  if(!actor)return json({error:'unauthorized'},403);
  const since=new Date(Date.now()-29*86400000).toISOString().slice(0,10);
  const [rows,inquiries]=await Promise.all([
   stmt(env.DB,'SELECT day,event,route,placement,status,count FROM metric_counts WHERE day>=? ORDER BY day DESC,event,route LIMIT 10000',since).all(),
   stmt(env.DB,'SELECT substr(created_at,1,10) AS day,count(*) AS count FROM leads WHERE created_at>=? GROUP BY substr(created_at,1,10) ORDER BY day DESC',since).all(),
  ]);
  const items=rows.results||[];
  const locations=items.filter(row=>row.event==='geo_pageview').map(row=>({day:row.day,country:row.placement,city:row.status,views:row.count}));
  return json({enabled:enabled(env.METRICS_ENABLED),since,timezone:'UTC',items:items.filter(row=>row.event!=='geo_pageview'),locations,inquiries:inquiries.results||[],definition:'Consent-based page views, not unique visitors. Country and city are approximate network locations.'});
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
 if(body.event==='pageview'&&isMarketingRoute(safe.route)&&geo){
  // Internal aggregate uses the existing count table; placement/status hold
  // country/city only for geo_pageview, and never a visitor identifier.
  await stmt(env.DB,'INSERT INTO metric_counts(day,event,route,placement,status,count) VALUES(?,?,?,?,?,1) ON CONFLICT(day,event,route,placement,status) DO UPDATE SET count=MIN(count+1,1000000000)',day,'geo_pageview',safe.route,safeCountry(geo.country),safeCity(geo.city)).run();
 }
 return new Response(null,{status:204});
}

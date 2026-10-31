import React,{useEffect,useMemo,useState} from 'react';
import {isMarketingRoute} from '../analytics/index.mjs';

const format=n=>new Intl.NumberFormat('zh-CN').format(n||0);
const countryNames=new Intl.DisplayNames(['zh-CN'],{type:'region'});
const countryLabel=code=>code==='Unknown'?'未知地区':countryNames.of(code)||code;
const today=()=>new Date().toISOString().slice(0,10);
const dayOffset=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);

export function TrafficDashboard(){
 const [report,setReport]=useState(null),[error,setError]=useState(false),[period,setPeriod]=useState(7),[refreshed,setRefreshed]=useState(0);
 useEffect(()=>{const controller=new AbortController();setError(false);
  fetch('/api/admin/metrics',{headers:{Accept:'application/json','X-Requested-With':'XMLHttpRequest'},credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal})
   .then(response=>{if(!response.ok)throw Error();return response.json();}).then(setReport).catch(cause=>{if(cause.name!=='AbortError')setError(true);});
  return()=>controller.abort();
 },[refreshed]);
 const summary=useMemo(()=>{
  const first=dayOffset(period-1),days=Array.from({length:period},(_,index)=>dayOffset(period-1-index));
  const visits=new Map(days.map(day=>[day,0])),inquiries=new Map(days.map(day=>[day,0]));
  const countries=new Map(),cities=new Map();
  for(const row of report?.items||[])if(row.event==='pageview'&&isMarketingRoute(row.route)&&row.day>=first&&visits.has(row.day))visits.set(row.day,visits.get(row.day)+Number(row.count||0));
  for(const row of report?.inquiries||[])if(row.day>=first&&inquiries.has(row.day))inquiries.set(row.day,Number(row.count||0));
  for(const row of report?.locations||[])if(row.day>=first){
   const country=row.country||'Unknown',city=row.city||'Unknown',count=Number(row.views||0);
   countries.set(country,(countries.get(country)||0)+count);
   const key=country+'|'+city;cities.set(key,(cities.get(key)||0)+count);
  }
  const totalVisits=[...visits.values()].reduce((a,b)=>a+b,0),totalInquiries=[...inquiries.values()].reduce((a,b)=>a+b,0);
  return {days,visits,inquiries,totalVisits,totalInquiries,countries:[...countries].sort((a,b)=>b[1]-a[1]).slice(0,10),cities:[...cities].sort((a,b)=>b[1]-a[1]).slice(0,15)};
 },[report,period]);
 const max=Math.max(1,...summary.visits.values());
 return <section className="traffic-dashboard" aria-label="网站访问与询价概览">
  <div className="traffic-heading"><div><h2>网站访问与询价</h2><p>日期按 UTC 统计。访问量仅包含同意站内统计的公开页面浏览，不是独立访客数。</p></div><div className="traffic-actions"><div role="group" aria-label="统计周期"><button type="button" aria-pressed={period===7} onClick={()=>setPeriod(7)}>7 天</button><button type="button" aria-pressed={period===30} onClick={()=>setPeriod(30)}>30 天</button></div><button type="button" onClick={()=>setRefreshed(n=>n+1)}>刷新</button></div></div>
  {error?<p className="admin-notice is-error" role="status">统计读取失败，请稍后刷新。询价管理仍可使用。</p>:!report?<p role="status">正在读取统计…</p>:<>
   {!report.enabled&&<p className="admin-notice">站内访问统计尚未启用，历史访问无法补计。下方询价数量仍来自真实保存的表单。</p>}
   <div className="traffic-cards"><article><span>今日页面访问</span><strong>{report.enabled?format(summary.visits.get(today())):'—'}</strong></article><article><span>近 {period} 天页面访问</span><strong>{report.enabled?format(summary.totalVisits):'—'}</strong></article><article><span>近 {period} 天新询价</span><strong>{format(summary.totalInquiries)}</strong><small>以已保存的询单为准</small></article><article><span>近 {period} 天覆盖国家</span><strong>{report.enabled?format(summary.countries.filter(([name])=>name!=='Unknown').length):'—'}</strong></article></div>
   <div className="traffic-grid"><section className="traffic-panel"><h3>每日变化</h3><div className="traffic-chart" role="img" aria-label="最近每日页面访问柱状图">{summary.days.map(day=><div className="traffic-day" key={day} title={`${day}：访问 ${summary.visits.get(day)}，询价 ${summary.inquiries.get(day)}`}><span className="traffic-bar" style={{height:`${Math.max(2,summary.visits.get(day)/max*100)}%`}}/><span>{period===7?day.slice(5):day.slice(8)}</span></div>)}</div><p className="traffic-caption">蓝色：已同意统计的页面浏览。将鼠标移至柱形查看当日数值；询价为独立保存记录。</p></section><section className="traffic-panel"><h3>访问国家／地区</h3>{!summary.countries.length?<p className="admin-muted">暂无可用地区数据。</p>:<ol className="traffic-list">{summary.countries.map(([name,count])=><li key={name}><span>{countryLabel(name)}</span><strong>{format(count)}</strong></li>)}</ol>}</section><section className="traffic-panel"><h3>访问城市</h3>{!summary.cities.length?<p className="admin-muted">暂无可用城市数据。</p>:<ol className="traffic-list">{summary.cities.map(([name,count])=>{const [country,city]=name.split('|');return <li key={name}><span>{city==='Unknown'?'未知城市':city} · {countryLabel(country)}</span><strong>{format(count)}</strong></li>})}</ol>}</section></div>
   <p className="traffic-note">地区按访问请求的网络位置估算，可能与客户实际所在地不同；重复浏览会重复计数。需要跨设备去重的访客数，可在现有 GA4 报表查看，接入本后台需单独授权 GA4 Data API。</p>
  </>}
 </section>;
}

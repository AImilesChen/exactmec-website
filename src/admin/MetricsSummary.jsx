import React,{useEffect,useState} from 'react';
export function MetricsSummary(){
 const [data,setData]=useState(null),[error,setError]=useState(false);
 useEffect(()=>{const controller=new AbortController();fetch('/api/admin/metrics',{headers:{Accept:'application/json','X-Requested-With':'XMLHttpRequest'},credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(true);});return()=>controller.abort();},[]);
 if(error)return <p role="status">访问统计暂不可用，不影响询盘管理。</p>;
 if(!data)return <p role="status">正在读取统计…</p>;
 const totals=new Map();for(const row of data.items||[])totals.set(row.event,(totals.get(row.event)||0)+row.count);
 return <section className="admin-panel"><h2>最近 30 天站内汇总</h2><p>{data.enabled?'仅统计同意测量的访问。':'测量当前未启用。'}数字为事件次数，不是独立客户数；WhatsApp 点击不代表已发消息。</p><dl>{[...totals].map(([event,count])=><div key={event}><dt>{event}</dt><dd>{count}</dd></div>)}</dl>{!totals.size&&<p>尚无统计记录。</p>}</section>;
}

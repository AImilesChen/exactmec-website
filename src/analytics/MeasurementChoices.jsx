import React,{useEffect,useId,useState} from 'react';
import {browserStorage,MEASUREMENT_CHOICE_KEY,readSavedMeasurementChoice,saveMeasurementChoice} from './transport.mjs';
import manifest from '../data/site-manifest.json';

const marketingRoutes = new Set(manifest.routes.filter(item => item.include_in_p0_plan && !['legal','system'].includes(item.kind) && item.id !== 'rfq').map(item => item.path));
const panelStyle = {position:'fixed',bottom:16,right:16,zIndex:90,width:'calc(100% - 32px)',maxWidth:420,maxHeight:'calc(100dvh - 32px)',boxSizing:'border-box',overflowY:'auto',margin:0,padding:20,background:'#fff',border:'1px solid #cbd7df',borderRadius:8,boxShadow:'0 8px 32px #19394f20',color:'#2d4657'};
const copyStyle = {fontSize:14,lineHeight:1.55,margin:'8px 0 0',color:'#4f6675'};
const buttonStyle = {minHeight:44,minWidth:0,flex:'1 1 0',margin:0,padding:'10px 12px',fontSize:14,fontWeight:500,lineHeight:1.5,borderRadius:4,cursor:'pointer'};

/** The saved refusal must reach storage before a controller may stop SDKs and reload. */
export function applyMeasurementChoice({storage,analytics,route,previousChoice},allow){
 const saved=saveMeasurementChoice(storage,allow)===true;
 analytics?.setConsent?.(allow);
 if(allow&&previousChoice!=='allow'&&marketingRoutes.has(route))analytics?.track?.('pageview',{route});
 return {choice:allow?'allow':'deny',saved};
}

export function MeasurementPanel({id,choice,onChoose,storageWarning=false}){
 return <section id={id} className="measurement-panel" style={panelStyle} aria-label="Optional analytics and session recording choices" data-clarity-mask="true">
  <h2 style={{fontSize:18,lineHeight:1.35,margin:0,color:'#273f50'}}>Analytics preferences</h2>
  <p style={copyStyle}>We use optional cookies and masked session recordings on marketing pages. Your choice won’t affect inquiries.</p>
  <details style={{marginTop:10,fontSize:13,lineHeight:1.55}}>
   <summary style={{cursor:'pointer',color:'#315a74'}}>Services &amp; privacy details</summary>
   <p style={{...copyStyle,fontSize:13}}>With your permission, we use Google Analytics 4, Microsoft Clarity (session recordings and heatmaps), and ShipSolo-hosted analytics (Plausible) on public marketing pages.</p>
   <p style={{...copyStyle,fontSize:13}}>These services may use cookies and process technical data such as device, IP address, and network information. Inquiry forms, customer accounts, and admin pages are excluded; inquiry fields are not sent.</p>
  </details>
  <p style={{...copyStyle,fontSize:13}}><a href="/cookies" style={{color:'#315a74',textDecoration:'underline',textUnderlineOffset:3}}>Cookie Policy</a>{' · '}<a href="/privacy" style={{color:'#315a74',textDecoration:'underline',textUnderlineOffset:3}}>Privacy Policy</a>{choice&&<span style={{display:'block',marginTop:4}}>Current permission: {choice==='allow'?'allowed':'rejected'}</span>}</p>
  {storageWarning&&<p role="status" style={{...copyStyle,fontSize:13}}>We could not save this preference. Your choice applies to this page; you may need to choose again on a future visit.</p>}
  <div role="group" aria-label="Optional tracking permission" style={{display:'flex',gap:10,marginTop:14}}>
   <button type="button" onClick={()=>onChoose(false)} aria-label="Reject optional tracking" aria-pressed={choice==='deny'} data-clarity-mask="true" style={{...buttonStyle,background:'#fff',border:'1px solid #93a9b9',color:'#294c63'}}>Reject</button>
   <button type="button" onClick={()=>onChoose(true)} aria-label="Allow analytics and recordings" aria-pressed={choice==='allow'} data-clarity-mask="true" style={{...buttonStyle,background:'#c94035',border:'1px solid #c94035',color:'#fff'}}>Allow</button>
  </div>
 </section>;
}

export function MeasurementChoices({enabled=false,analytics,route}){
 const [ready,setReady]=useState(false),[open,setOpen]=useState(false),[choice,setChoice]=useState(null),[storageWarning,setStorageWarning]=useState(false);
 const id='measurement-panel-'+useId().replaceAll(':','');
 useEffect(()=>{
  if(!enabled){setReady(false);return;}
  const sync=()=>{const stored=readSavedMeasurementChoice(browserStorage());setChoice(stored);analytics?.setConsent?.(stored==='allow');setOpen(stored===null);setReady(true);};
  sync();
  const storageChanged=event=>{if(event.key===MEASUREMENT_CHOICE_KEY||event.key===null)sync();};
  globalThis.addEventListener?.('storage',storageChanged);
  return()=>globalThis.removeEventListener?.('storage',storageChanged);
 },[enabled,analytics]);
 if(!enabled||!ready)return null;
 const choose=allow=>{
  const currentRoute=route||(typeof location!=='undefined'?location.pathname:'');
  const result=applyMeasurementChoice({storage:browserStorage(),analytics,route:currentRoute,previousChoice:choice},allow);
  setChoice(result.choice);setStorageWarning(!result.saved);setOpen(!result.saved);
 };
 return <div className="measurement-choices" data-clarity-mask="true"><button type="button" className="measurement-toggle" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls={id} data-clarity-mask="true">Measurement choices</button>{open&&<MeasurementPanel id={id} choice={choice} onChoose={choose} storageWarning={storageWarning}/>}</div>;
}


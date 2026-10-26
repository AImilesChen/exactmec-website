import React,{useEffect,useId,useState} from 'react';
import {browserStorage,MEASUREMENT_CHOICE_KEY,readSavedMeasurementChoice,saveMeasurementChoice} from './transport.mjs';
import manifest from '../data/site-manifest.json';

const marketingRoutes = new Set(manifest.routes.filter(item => item.include_in_p0_plan && !['legal','system'].includes(item.kind) && item.id !== 'rfq').map(item => item.path));
const panelStyle = {position:'fixed',bottom:16,left:'max(16px, calc((100vw - 1080px)/2))',right:'max(16px, calc((100vw - 1080px)/2))',zIndex:90,maxWidth:1080,maxHeight:'calc(100dvh - 32px)',overflowY:'auto',margin:0,padding:'clamp(20px, 3vw, 30px)',background:'#fff',border:'1px solid #cbd7df',borderRadius:6,boxShadow:'0 12px 52px #19394f26',color:'#2d4657'};
const copyStyle = {fontSize:14,lineHeight:1.75,margin:'12px 0 0',maxWidth:940,color:'#4f6675'};
const buttonStyle = {minHeight:48,flex:'1 1 240px',margin:0,padding:'12px 20px',fontSize:14,fontWeight:500,lineHeight:1.5,borderRadius:4,cursor:'pointer'};

/** The saved refusal must reach storage before a controller may stop SDKs and reload. */
export function applyMeasurementChoice({storage,analytics,route,previousChoice},allow){
 const saved=saveMeasurementChoice(storage,allow)===true;
 analytics?.setConsent?.(allow);
 if(allow&&previousChoice!=='allow'&&marketingRoutes.has(route))analytics?.track?.('pageview',{route});
 return {choice:allow?'allow':'deny',saved};
}

export function MeasurementPanel({id,choice,onChoose,storageWarning=false}){
 return <section id={id} className="measurement-panel" style={panelStyle} aria-label="Optional analytics and session recording choices" data-clarity-mask="true">
  <h2 style={{fontSize:22,lineHeight:1.35,margin:0,color:'#273f50'}}>Your choice about optional tracking</h2>
  <p style={copyStyle}>With your permission, we use Google Analytics 4, Microsoft Clarity (session recordings and heatmaps), and ShipSolo-hosted analytics (Plausible) on public marketing pages.</p>
  <p style={copyStyle}>These services may use cookies and process technical data such as device, IP address, and network information. Inquiry forms, customer accounts, and admin pages are excluded; inquiry fields are not sent. Your choice does not affect submitting an inquiry.</p>
  <p style={{...copyStyle,fontSize:13}}><a href="/cookies" style={{color:'#315a74',textDecoration:'underline',textUnderlineOffset:3}}>Cookie Policy</a>{' · '}<a href="/privacy" style={{color:'#315a74',textDecoration:'underline',textUnderlineOffset:3}}>Privacy Policy</a>{choice&&<span>{' · '}Current permission: {choice==='allow'?'allowed':'rejected'}</span>}</p>
  {storageWarning&&<p role="status" style={{...copyStyle,fontSize:13}}>We could not save this preference. Your choice applies to this page; you may need to choose again on a future visit.</p>}
  <div role="group" aria-label="Optional tracking permission" style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:22}}>
   <button type="button" onClick={()=>onChoose(false)} aria-pressed={choice==='deny'} data-clarity-mask="true" style={{...buttonStyle,background:'#fff',border:'1px solid #93a9b9',color:'#294c63'}}>Reject optional tracking</button>
   <button type="button" onClick={()=>onChoose(true)} aria-pressed={choice==='allow'} data-clarity-mask="true" style={{...buttonStyle,background:'#c94035',border:'1px solid #c94035',color:'#fff'}}>Allow analytics and recordings</button>
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

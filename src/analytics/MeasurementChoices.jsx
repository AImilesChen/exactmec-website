import React,{useEffect,useState} from 'react';
import {browserStorage,saveMeasurementChoice} from './transport.mjs';
export function MeasurementChoices({enabled=false,analytics,route}){
 const [open,setOpen]=useState(false),[choice,setChoice]=useState(null);
 useEffect(()=>{if(!enabled)return;let stored;try{stored=browserStorage()?.getItem('exactmec_measurement_choice');}catch{}const allow=stored==='allow';setChoice(stored||null);analytics.setConsent(allow);if(!stored)setOpen(true);},[enabled,analytics]);
 if(!enabled)return null;
 const choose=allow=>{saveMeasurementChoice(browserStorage(),allow);analytics.setConsent(allow);if(allow&&choice!=='allow')analytics.track('pageview',{route:route||location.pathname});setChoice(allow?'allow':'deny');setOpen(false);};
 return <div className="measurement-choices"><button type="button" className="measurement-toggle" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="measurement-panel">Measurement choices</button>{open&&<section id="measurement-panel" className="measurement-panel" aria-label="Optional website measurement"><h2>Help us improve this website?</h2><p>With your choice, we count page views and button actions on this website. No advertising pixels or visitor identifiers. Inquiry details are excluded. Your choice does not affect inquiries.</p><p><a href="/cookies">Cookie Policy</a>{choice&&<> · Current choice: {choice==='allow'?'allowed':'declined'}</>}</p><div><button type="button" onClick={()=>choose(false)}>Decline</button><button type="button" onClick={()=>choose(true)}>Allow measurement</button></div></section>}</div>;
}

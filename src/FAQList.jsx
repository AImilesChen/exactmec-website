import React,{useId,useState} from 'react';
import {Minus,Plus} from '@phosphor-icons/react';

export function FAQList({faqs,firstOpen=false}){
 const [open,setOpen]=useState(firstOpen?0:null);
 const uid=useId();
 return <div className="faq-list">{faqs.map(({q,a},i)=><div className="faq-item" key={q}><h3><button onClick={()=>setOpen(open===i?null:i)} aria-expanded={open===i} aria-controls={uid+'-'+i}>{q}{open===i?<Minus size={20} aria-hidden="true"/>:<Plus size={20} aria-hidden="true"/>}</button></h3><div id={uid+'-'+i} hidden={open!==i}><p>{a}</p></div></div>)}</div>;
}

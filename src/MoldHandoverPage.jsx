import React from 'react';
import {CheckCircle,MapPin,Truck,Package,ArrowRight} from '@phosphor-icons/react';
import {Link} from './Navigation.jsx';
import {Media} from './Media.jsx';
import {business} from './site-config.mjs';

export function MoldHandoverPage({page,Action,FAQList}){
 const sections=Object.fromEntries((page.sections||[]).map(s=>[s.id,s]));
 return <div className="handover-page">
  <header className="handover-hero"><div className="container">
   <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span>Mold Handover</span></nav>
   <div className="handover-hero-grid"><div><p className="eyebrow">AFTER SAMPLE APPROVAL</p><h1>{page.h1}</h1><p className="handover-lead">{page.intro}</p><div className="handover-actions"><Action href="#delivery-checklist">Before Mold Shipment</Action><Action href="/quality-control/" secondary>Sample Approval</Action></div></div><Media file="process-handover-packing-v1" priority alt="Illustrative completed die casting mold beside a protective shipping crate being prepared for packing" caption="Illustrative packing scene · Not a customer shipment"/></div>
  </div></header>

  <section className="handover-checklist container" id="delivery-checklist"><div className="handover-heading"><p className="eyebrow">READY TO HAND OVER</p><h2>Three confirmations before the mold leaves</h2></div><div className="handover-check-grid">{[
   {Icon:CheckCircle,title:'Samples accepted',text:'Your team has tested the trial samples and confirmed acceptance.'},
   {Icon:MapPin,title:'Recipient confirmed',text:'We confirm the recipient, delivery address and contact details with you.'},
   {Icon:Truck,title:'Transport agreed',text:'We discuss the shipping method, cost, responsibilities and timing for your project.'}
  ].map(({Icon,title,text},i)=><article key={title}><div className="handover-card-top"><Icon size={30} weight="light" aria-hidden="true"/><span>0{i+1}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div></section>

  <section className="handover-packing"><div className="container handover-packing-grid"><Media file="handover-protective-packing-v1" alt="Illustrative close view of protective cushioning and a steel mold on a timber shipping base" caption="Illustrative packaging detail · Packing agreed for each project"/><div><p className="eyebrow">PACKING & DISPATCH</p><h2>{sections.packing?.heading}</h2><p>{sections.packing?.paragraphs?.[0]}</p><ul><li>Discuss protection and packing for the mold and transport route.</li><li>Confirm the receiving details before dispatch.</li><li>Communicate the agreed shipment information with you.</li></ul><p className="handover-small">Packing and transport arrangements are confirmed individually.</p></div></div></section>

  <section className="handover-roles container"><div className="handover-heading"><p className="eyebrow">A CLEAR HANDOVER</p><h2>{sections.responsibilities?.heading}</h2><p>{sections.responsibilities?.paragraphs?.[0]}</p></div><div className="handover-role-grid"><article><span>EXACTMEC</span><h3>We coordinate the handover</h3><ul><li>Review sample acceptance with you.</li><li>Coordinate the agreed packing and dispatch.</li><li>Communicate shipment details for your project.</li></ul></article><article><span>YOUR TEAM</span><h3>You confirm and receive</h3><ul><li>Provide the recipient and delivery information.</li><li>Confirm the agreed transport arrangements.</li><li>Receive the mold and report any arrival concern promptly.</li></ul></article></div><aside className="handover-scope"><Package size={25} weight="light" aria-hidden="true"/><p>The finished mold is the main deliverable. Any accompanying items or documents are confirmed within your agreed project scope.</p></aside></section>

  <section className="handover-questions"><div className="container handover-faq-grid"><div><p className="eyebrow">DELIVERY QUESTIONS</p><h2>Mold shipment, explained</h2><p>For the earlier project stages, explore the <Link href="/mold-development-process/">full mold development process <ArrowRight size={16} aria-hidden="true"/></Link>.</p></div><FAQList faqs={page.faqs||[]}/></div></section>

  <section className="handover-contact container"><div><p className="eyebrow">KEEP IN TOUCH</p><h2>Planning a delivery or a new mold?</h2><p>For an existing project, contact your EXACTMEC contact person to confirm handover details. For a new mold, start with your product drawings or a physical sample.</p></div><div className="handover-contact-actions"><Action href={'https://wa.me/'+business.whatsappNumber}>Discuss on WhatsApp</Action><Action href="/request-a-quote/" secondary>Request a Mold Quote</Action></div></section>
 </div>;
}

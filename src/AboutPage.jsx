import React from 'react';
import {ArrowRight,ChatCircleDots,CheckCircle,Factory,FileText,Package} from '@phosphor-icons/react';
import {Link} from './Navigation.jsx';
import {Media} from './Media.jsx';
import {business} from './site-config.mjs';

const facts=[
 ['10+','Years of mold-making experience'],
 ['50+','Countries served'],
 ['500+','Manufacturing partners & sites'],
 ['1000+','Component types'],
 ['99%','On-time delivery'],
];
const steps=[
 ['01','Share your part', 'Send clear 2D or 3D part drawings, or tell us about a physical sample.'],
 ['02','Confirm the mold design','After payment, review and approve the 3D mold design before manufacturing begins.'],
 ['03','Test trial samples','The mold is trialed and sample parts are sent to you for testing.'],
 ['04','Receive your mold','After you approve the samples, we arrange shipment of the finished mold.'],
];

export function AboutPage({page,Action}){
 const heading=page.h1==='A Clear Contact Point for Your Mold Project'?'Custom Mold Supply. One Clear Contact.':page.h1;
 const summary=page.intro?.startsWith('ExactMec focuses on custom aluminum die casting molds.')?'Custom aluminum die casting molds, from one set. One contact for your quotation, design approval, trial samples and mold delivery.':page.intro;
 return <div className="about-page">
  <header className="about-hero"><div className="container">
   <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span>About ExactMec</span></nav>
   <div className="about-hero-grid"><div className="about-hero-copy"><p className="eyebrow">ABOUT EXACTMEC</p><h1>{heading}</h1><p>{summary}</p><div className="about-hero-actions"><Action>Request a Mold Quote</Action><Link className="text-link" href="#how-we-work">How We Work <ArrowRight size={18} aria-hidden="true"/></Link></div><p className="about-hero-note">Custom aluminum die casting molds · From one mold set</p></div>
    <Media file="how-we-work-hero-v1" alt="Illustrative mold project discussion with part drawing, steel mold and CAD model" caption="Illustrative project scene · Not a customer project" priority className="about-hero-media"/></div>
  </div></header>

  <section className="about-intro container" id="focus"><div><p className="eyebrow">WHAT WE DELIVER</p><h2>Custom tooling, built around your component.</h2></div><div><p>EXACTMEC supplies custom aluminum die casting molds for industrial parts. We handle sales, quotations and customer communication. Production factories carry out mold design, manufacturing and trials as part of the service we deliver.</p><p>Send your part drawings or an assessable sample to start. We accept projects from <strong>one mold set</strong>; this website does not offer ongoing cast-part mass production.</p><Link className="text-link" href="/aluminum-die-casting-molds/">Explore our mold service <ArrowRight size={18} aria-hidden="true"/></Link></div></section>

  <section className="about-capability" id="partners"><div className="container"><div className="about-section-heading"><p className="eyebrow">MANUFACTURING CAPABILITY</p><h2>A manufacturing network behind every mold project.</h2><p>Our sales team connects your requirements with the production capacity needed to make, trial and deliver the agreed mold.</p></div><div className="about-facts" aria-label="Manufacturing network figures">{facts.map(([value,label])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><p className="about-facts-note">Figures describe experience, reach and performance across the manufacturing network serving our projects.</p></div></section>

  <section className="about-roles container" id="operator"><div className="about-section-heading"><p className="eyebrow">ONE PROJECT, CLEAR RESPONSIBILITIES</p><h2>Know who does what.</h2></div><div className="about-roles-grid"><article><ChatCircleDots size={34} weight="light" aria-hidden="true"/><h3>EXACTMEC</h3><p>Sales, quotation, customer communication and follow-up through the mold project.</p></article><article><Factory size={34} weight="light" aria-hidden="true"/><h3>Production factories</h3><p>Mold design, manufacturing and trials to the agreed project requirements.</p></article><article><CheckCircle size={34} weight="light" aria-hidden="true"/><h3>Your team</h3><p>Confirm the design before production and test trial samples before mold shipment.</p></article></div></section>

  <section className="about-work" id="how-we-work"><span id="working" className="about-anchor" aria-hidden="true"/><div className="container about-work-grid"><div><p className="eyebrow">HOW WE WORK</p><h2>From your part to a finished mold.</h2><p>There are two important customer decisions: approving the 3D mold design before manufacturing and approving trial samples before shipment.</p><ol className="about-steps">{steps.map(([number,title,description])=><li key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol><Link className="text-link" href="/mold-development-process/">See the full development process <ArrowRight size={18} aria-hidden="true"/></Link></div><Media file="menu-about-v1" alt="Illustrative finished mold secured in a shipping crate" caption="Illustrative mold handover scene · Not a customer project" className="about-work-media"/></div></section>

  <section className="about-contact container" id="buyers"><div className="about-contact-copy"><p className="eyebrow">START A CONVERSATION</p><h2>Have a part that needs a mold?</h2><p>Upload a clear STEP/STP model or dimensioned 2D drawing, or tell us about your physical sample. We review your information and follow up by email; WhatsApp is available if you prefer.</p><div className="about-contact-actions"><Action>Request a Mold Quote</Action><a className="text-link" href={'mailto:'+business.contactEmail}>{business.contactEmail} <ArrowRight size={18} aria-hidden="true"/></a></div></div><aside className="about-company"><div><FileText size={30} weight="light" aria-hidden="true"/><span>WEBSITE OPERATOR</span></div><h3 lang="zh-CN">{business.operator}</h3><address>{business.correspondenceAddress}</address><p>EXACTMEC is the brand used for this mold supply website.</p><Link href="/project-information" className="text-link">Company & project information <ArrowRight size={18} aria-hidden="true"/></Link></aside></section>
 </div>;
}

import React,{useId,useRef,useState} from 'react';
import {ArrowRight,CheckCircle,WhatsappLogo} from '@phosphor-icons/react';
import {CmsHome,CmsImage,useCmsPage} from './cms/Rendering.jsx';
import {Link} from './Navigation.jsx';
import {FAQList,pages} from './EditorialPages.jsx';
import {business} from './site-config.mjs';
import {homeCards,homeHeroMedia} from './cms/home-content.mjs';

const QUOTE='/request-a-quote/';
const applications=[
 {title:'Automotive & Two-Wheelers',image:'/assets/home-v2-automotive.webp',alt:'Illustrative aluminum automotive bracket',href:'/industries/#industry-automotive'},
 {title:'LED Lighting',image:'/assets/home-v2-led.webp',alt:'Illustrative finned aluminum lighting housing and LED lamp',href:'/industries/led-lighting/'},
 {title:'Motors, Pumps & Transmission',image:'/assets/home-v2-motor.webp',alt:'Illustrative aluminum motor end cover beside an electric motor',href:'/industries/motor-pump-transmission/'},
 {title:'Electronics & Telecom',image:'/assets/home-v2-electronics.webp',alt:'Illustrative aluminum electronics enclosure',href:'/industries/#industry-electronics-telecommunications'},
 {title:'Energy & Power Equipment',image:'/assets/energy-application-scene-v3.webp',alt:'Illustrative aluminum power equipment enclosure in an equipment setting',href:'/industries/#industry-energy-power'},
 {title:'Industrial Equipment & Automation',image:'/assets/industrial-application-scene-v3.webp',alt:'Illustrative aluminum industrial housing in an automation setting',href:'/industries/#industry-industrial-automation'},
];
const guides=[
 {title:'What to Prepare for a Mold Quote',image:'/assets/home-v2-guide-quotation.webp',alt:'Illustrative part drawing and three-dimensional enclosure model',href:'/resources/die-casting-mold-quotation-requirements/'},
 {title:'What Determines Mold Cost?',image:'/assets/home-v2-guide-cost.webp',alt:'Illustrative exploded mold base, core inserts and slides',href:'/resources/die-casting-mold-cost/'},
 {title:'From Design Approval to Shipment',image:'/assets/home-v2-guide-approval.webp',alt:'Illustrative trial samples, engineering drawing and inspection caliper',href:'/resources/die-casting-mold-development-process/'},
];
const stages=[
 {label:'Drawings & quotation',title:'Start With Your Part',text:'Clear 2D or 3D part drawings, or a physical sample, give us the basis for a formal mold quotation.',image:guides[0].image,alt:guides[0].alt},
 {label:'Payment & mold design',title:'From Payment to Mold Design',text:'We confirm the quotation and payment arrangements with you, then prepare the 3D mold design for your review.',image:guides[1].image,alt:guides[1].alt},
 {label:'Approval & manufacturing',title:'Your Design Approval Comes First',text:'After payment, we prepare the 3D mold design for your confirmation. Manufacturing starts after you approve the design.',image:'/assets/design-review-scene-v3.webp',alt:'Illustrative workstation displaying a three-dimensional mold design for review'},
 {label:'Mold trial',title:'Trial the Completed Mold',text:'The completed mold is trialled to produce samples for your assessment before final mold delivery.',image:'/assets/mold-trial-scene-v3.webp',alt:'Illustrative mold trial setup with aluminum sample components'},
 {label:'Sample testing',title:'Test the Trial Samples',text:'We send the trial samples to you for testing. Your feedback and approval are confirmed before mold shipment.',image:guides[2].image,alt:guides[2].alt},
 {label:'Mold shipment',title:'Your Approval. Then Shipment.',text:'After you approve the trial samples, we arrange shipment of the finished mold. Delivery details are agreed for your project.',image:'/assets/mold-sample-detail-v3.webp',alt:'Illustrative aluminum trial sample components'},
];
function TextLink({href,children,className=''}) {
 return <Link href={href} className={'home-v2-link '+className}>{children}<ArrowRight size={20} aria-hidden="true"/></Link>;
}
function QuoteButton() {
 return <Link href={QUOTE} className="button primary home-v2-quote">Request a Mold Quote<ArrowRight size={21} aria-hidden="true"/></Link>;
}
function StageContent({stage}) {
 return <><figure><CmsImage src={stage.image} alt={stage.alt} width="1440" height="960" loading="lazy"/><figcaption>Illustrative project scene</figcaption></figure>
  <div className="home-v2-process-copy"><h3>{stage.title}</h3><p>{stage.text}</p><TextLink href="/mold-development-process/">View the full process</TextLink></div></>;
}
function HomeProcess({heading}) {
 const [active,setActive]=useState(2),tabs=useRef([]),uid=useId();
 function navigate(event,index) {
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?stages.length-1:(index+(event.key==='ArrowRight'?1:stages.length-1))%stages.length;
  setActive(next);tabs.current[next]?.focus();
 }
 return <section className="home-v2-process" id="process"><div className="container">
  <p className="home-v2-eyebrow">YOUR MOLD PROJECT</p><h2>{heading}</h2>
  <div className="home-v2-desktop-process">
   <div className="home-v2-stages" role="tablist" aria-label="Mold project stages">
    {stages.map((item,index)=><button key={item.label} ref={node=>{tabs.current[index]=node;}} role="tab" id={uid+'-stage-'+index} aria-controls={uid+'-panel'} aria-selected={active===index} tabIndex={active===index?0:-1} onClick={()=>setActive(index)} onKeyDown={event=>navigate(event,index)}>
     <span className="home-v2-stage-number">{String(index+1).padStart(2,'0')}</span><span>{item.label}</span>
    </button>)}
   </div>
   <div className="home-v2-process-panel" id={uid+'-panel'} role="tabpanel" aria-labelledby={uid+'-stage-'+active} tabIndex={0}><StageContent stage={stages[active]}/></div>
  </div>
  <div className="home-v2-mobile-process">{stages.map((stage,index)=><details key={stage.label} open={index===2}><summary><span className="home-v2-stage-number">{String(index+1).padStart(2,'0')}</span>{stage.label}<ArrowRight size={19} aria-hidden="true"/></summary><div className="home-v2-process-panel"><StageContent stage={stage}/></div></details>)}</div>
 </div></section>;
}
export function LightHome() {
 const source=pages.find(page=>page.id==='home'),page=useCmsPage(source);
 const hero=homeHeroMedia(page),applicationCards=homeCards(page,source,'applications',applications),guideCards=homeCards(page,source,'guides',guides);
 const heading=(id,fallback)=>{
  const original=source.sections.find(section=>section.id===id),current=page.sections.find(section=>section.id===id);
  return current?.heading&&current.heading!==original?.heading?current.heading:fallback;
 };
 return <CmsHome page={page} className="light-home home-v2">
  <section className="home-v2-hero" aria-labelledby="home-v2-title">
   <picture className="home-v2-hero-picture">{hero.src==='/assets/home-v2-hero.webp'&&<source media="(max-width:900px)" srcSet="/assets/home-v2-hero-mobile.webp"/>}<CmsImage className="home-v2-hero-image" src={hero.src} alt={hero.alt} width="1912" height="823" loading="eager" fetchPriority="high"/></picture>
   <div className="container"><div className="home-v2-hero-copy">
    <p className="home-v2-eyebrow">Custom aluminum die casting molds</p>
    <h1 id="home-v2-title">{page.h1===source.h1?<>Custom <span>Die Casting<br/>Molds</span> for Your Part</>:page.h1}</h1>
    <p className="home-v2-intro">{page.intro===source.intro?'Share clear 2D or 3D part drawings, or a physical sample, to start your mold quotation.':page.intro}</p>
    <div className="home-v2-actions"><QuoteButton/><TextLink href="/aluminum-die-casting-molds/">Explore Mold Tooling</TextLink></div>
    <p className="home-v2-reassurance">No sign-in required.</p>
   </div></div><p className="home-v2-hero-caption">{hero.caption}</p>
  </section>
  <section className="home-v2-facts" id="project-facts" aria-label="Mold project rules"><div className="container">
   <dl className="home-v2-fact-grid">{[['1 Set','Minimum Mold Order','One mold set accepted.'],['30–40 Days','Typical Project Schedule','From payment; confirmed for each project.'],['2 Approvals','Before Final Delivery','Mold design and trial samples.']].map(([value,label,note])=><div key={value}><dt>{label}</dt><dd>{value}</dd><p>{note}</p></div>)}</dl>
   <p className="home-v2-schedule-note">The project schedule covers the agreed scope and approval stages; it is not a guaranteed arrival date. <Link href="/mold-development-process/">See the process</Link>.</p>
  </div></section>
  <section className="home-v2-applications container" id="applications">
   <div className="home-v2-section-heading"><div><p className="home-v2-eyebrow">APPLICATIONS</p><h2>{heading('applications','Die Casting Molds for Your Application')}</h2><p className="home-v2-section-intro">Explore component types for your custom mold project.</p></div><TextLink href="/industries/">View all applications</TextLink></div>
   <div className="home-v2-application-grid">{applicationCards.map(item=><article key={item.href}><Link href={item.href} className="home-v2-picture-link">
    <div className="home-v2-image-frame"><CmsImage src={item.image} alt={item.alt} width="960" height="720" loading="lazy"/></div><h3>{item.title}<ArrowRight size={21} aria-hidden="true"/></h3>
   </Link></article>)}</div><p className="home-v2-caption">Illustrative applications · Custom mold inquiries, not finished-part production</p>
  </section>
  <section className="home-v2-manufacturing" id="resources"><div className="container">
   <div className="home-v2-manufacturing-grid"><figure><CmsImage src="/assets/mold-machining-scene-v3.webp" alt="Illustrative CNC machining of a mold cavity" width="1440" height="960" loading="lazy"/><figcaption>Manufacturing illustration · Not a partner-factory photograph</figcaption></figure>
    <div><p className="home-v2-eyebrow">OUR MANUFACTURING NETWORK</p><h2>{heading('resources','Manufacturing Partners. One Clear Contact.')}</h2><p className="home-v2-section-intro">Connect your mold project with an experienced manufacturing partner network in China, serving customers across dozens of countries.</p>
     <ul className="home-v2-manufacturing-points">{['Established mold-making experience','A mature manufacturing and trial process','Coordinated design, samples and mold handover'].map(text=><li key={text}><CheckCircle size={21} aria-hidden="true"/>{text}</li>)}</ul><TextLink href="/manufacturing/">Explore manufacturing resources</TextLink></div>
   </div>
   <dl className="home-v2-network-stats" aria-label="Partner manufacturing network figures">{[['10+','Years of Mold-Making Experience'],['Dozens','Countries Served'],['500+','Partner Factories & Production Sites'],['Hundreds','Component Types'],['99%','On-Time Delivery']].map(([value,label])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
   <p className="home-v2-network-note">Experience, reach and performance across our manufacturing partner network.</p>
  </div></section>
  <HomeProcess heading={heading('process','From Your Part to Your Finished Mold')}/>
  <section className="home-v2-quality container" id="sample-approval">
   <div className="home-v2-quality-copy"><p className="home-v2-eyebrow">TRIAL & APPROVAL</p><h2>Test the Samples Before Mold Shipment</h2><p className="home-v2-section-intro">We trial the completed mold and send samples for your testing. The finished mold is shipped after your sample approval.</p>
    <ol className="home-v2-approval-steps">{['Mold trial','Your sample testing','Mold shipment'].map((text,index)=><li key={text}><span>{String(index+1).padStart(2,'0')}</span>{text}</li>)}</ol>
    <TextLink href="/quality-control/">See the trial & approval process</TextLink>
   </div><figure><CmsImage src="/assets/home-v2-guide-approval.webp" alt="Illustrative trial samples, drawing and caliper used to explain sample review" width="1440" height="960" loading="lazy"/><figcaption>Illustrative sample review · Not a delivered project</figcaption></figure>
  </section>
  <section className="home-v2-guides" id="guides"><div className="container">
   <div className="home-v2-section-heading"><div><p className="home-v2-eyebrow">BUYER RESOURCES</p><h2>{heading('guides','Die Casting Mold Guides')}</h2></div><TextLink href="/resources/">Explore resources</TextLink></div>
   <div className="home-v2-guide-grid">{guideCards.map(item=><article key={item.href}><Link href={item.href} className="home-v2-picture-link">
    <div className="home-v2-image-frame"><CmsImage src={item.image} alt={item.alt} width="960" height="540" loading="lazy"/></div><h3>{item.title}</h3><span className="home-v2-read-guide">Read guide<ArrowRight size={20} aria-hidden="true"/></span>
   </Link></article>)}</div><p className="home-v2-caption">Illustrative guide imagery</p>
  </div></section>
  <section className="home-v2-faq container" id="home-faq"><div><p className="home-v2-eyebrow">COMMON QUESTIONS</p><h2>Before You Request a Mold Quote</h2><TextLink href="/faq/">View all FAQs</TextLink></div><FAQList faqs={page.faqs||source.faqs}/></section>
  <section className="home-v2-contact" id="start-your-project">
   <CmsImage src="/assets/home-v2-cta.webp" alt="" aria-hidden="true" width="1440" height="360" loading="lazy"/>
   <div className="container"><h2>{page.final_cta?.heading!==source.final_cta?.heading?page.final_cta?.heading:'Ready to Discuss Your Mold?'}</h2><p className="home-v2-section-intro">Tell us about your part and the drawings or sample you have available.</p>
    <div className="home-v2-actions"><QuoteButton/><a href={'https://wa.me/'+business.whatsappNumber} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="home-v2-link home-v2-whatsapp"><WhatsappLogo size={27} weight="fill" aria-hidden="true"/>Chat on WhatsApp<ArrowRight size={21} aria-hidden="true"/></a></div>
   </div>
  </section>
 </CmsHome>;
}

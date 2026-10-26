import React,{useId,useRef,useState} from 'react';
import {ArrowRight,Cube,FileText,GearSix,WhatsappLogo} from '@phosphor-icons/react';
import {CmsHome,CmsImage,useCmsPage} from './cms/Rendering.jsx';
import {Link} from './Navigation.jsx';
import {pages} from './EditorialPages.jsx';
import {business} from './site-config.mjs';
import {homeCards,homeHeroMedia} from './cms/home-content.mjs';

const QUOTE='/request-a-quote/';
const applications=[
 {title:'LED Lighting',image:'/assets/home-v2-led.webp',alt:'Illustrative finned aluminum lighting housing with an LED lamp',href:'/industries/led-lighting/'},
 {title:'Motors & Pumps',image:'/assets/home-v2-motor.webp',alt:'Illustrative round aluminum motor end cover beside a blue electric motor',href:'/industries/motor-pump-transmission/'},
 {title:'Electronics',image:'/assets/home-v2-electronics.webp',alt:'Illustrative rectangular aluminum electronics enclosure',href:'/industries/#industry-electronics-telecommunications'},
 {title:'Automotive',image:'/assets/home-v2-automotive.webp',alt:'Illustrative aluminum structural bracket in an automotive setting',href:'/industries/#industry-automotive'},
];
const guides=[
 {title:'Quotation Checklist',image:'/assets/home-v2-guide-quotation.webp',alt:'Illustrative product drawing and three-dimensional enclosure model',href:'/resources/die-casting-mold-quotation-requirements/'},
 {title:'Mold Cost Factors',image:'/assets/home-v2-guide-cost.webp',alt:'Illustrative exploded steel mold base, core inserts and slides',href:'/resources/die-casting-mold-cost/'},
 {title:'Approval Stages',image:'/assets/home-v2-guide-approval.webp',alt:'Illustrative trial samples, engineering drawing and inspection caliper',href:'/resources/die-casting-mold-development-process/'},
];
const stages=[
 {label:'Reference',title:'Start With Your Part',text:'Clear 2D or 3D part drawings, or a physical sample, give us the basis for a formal quotation.',image:guides[0].image,alt:guides[0].alt,href:guides[0].href},
 {label:'Quote & payment',title:'Agree the Project Scope',text:'We discuss your mold requirements and quotation. Payment arrangements are confirmed during your project conversation.',image:guides[1].image,alt:guides[1].alt,href:'/how-we-work/'},
 {label:'Design approval',title:'Approve Before We Make',text:'After payment, we design the mold for your approval before manufacturing.',image:'/assets/home-v2-process.webp',alt:'Illustrative CNC mold machining and a workstation displaying a three-dimensional mold assembly',href:'/mold-development-process/'},
 {label:'Make & trial',title:'Make and Trial Your Mold',text:'After design approval, the mold is manufactured and trial samples are produced.',image:'/assets/mold-machining-scene-v3.webp',alt:'Illustrative CNC machining of a steel mold cavity',href:'/mold-development-process/#manufacture'},
 {label:'Samples & shipment',title:'Test Before Mold Shipment',text:'Trial samples are sent for your testing. The completed mold is shipped after your sample approval.',image:guides[2].image,alt:guides[2].alt,href:'/quality-control/'},
];
function TextLink({href,children,className=''}) {
 return <Link href={href} className={'home-v2-link '+className}>{children}<ArrowRight size={20} aria-hidden="true"/></Link>;
}
function QuoteButton() {
 return <Link href={QUOTE} className="button primary home-v2-quote">Request a Mold Quote<ArrowRight size={21} aria-hidden="true"/></Link>;
}
function HomeProcess({heading}) {
 const [active,setActive]=useState(2),tabs=useRef([]),uid=useId(),stage=stages[active];
 function navigate(event,index) {
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?4:(index+(event.key==='ArrowRight'?1:4))%5;
  setActive(next);tabs.current[next]?.focus();
 }
 return <section className="home-v2-process" id="process">
  <div className="container"><h2>{heading}</h2>
   <div className="home-v2-stages" role="tablist" aria-label="Mold project stages">
    {stages.map((item,index)=><button key={item.label} ref={node=>{tabs.current[index]=node;}} role="tab" id={uid+'-stage-'+index} aria-controls={uid+'-panel'} aria-selected={active===index} tabIndex={active===index?0:-1} onClick={()=>setActive(index)} onKeyDown={event=>navigate(event,index)}>
     <span className="home-v2-stage-number">{String(index+1).padStart(2,'0')}</span><span>{item.label}</span>
    </button>)}
   </div>
  </div>
  <div className="home-v2-process-panel" id={uid+'-panel'} role="tabpanel" aria-labelledby={uid+'-stage-'+active}>
   <figure><CmsImage src={stage.image} alt={stage.alt} width="1440" height="960" loading="lazy"/><figcaption>Illustrative design and manufacturing scenes</figcaption></figure>
   <div className="home-v2-process-copy"><h3>{active===2?<>Approve Before<br/>We Make</>:stage.title}</h3><p>{stage.text}</p><TextLink href="/mold-development-process/">See the full process</TextLink></div>
  </div>
 </section>;
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
   <picture className="home-v2-hero-picture">{hero.src==='/assets/home-v2-hero.webp'&&<source media="(max-width:900px)" srcSet="/assets/home-v2-hero-mobile.webp"/>}<CmsImage className="home-v2-hero-image" src={hero.src} alt={hero.alt} width="1440" height="620" loading="eager" fetchPriority="high"/></picture>
   <div className="container"><div className="home-v2-hero-copy">
    <p className="home-v2-eyebrow">Custom aluminum die casting molds</p>
    <h1 id="home-v2-title">{page.h1===source.h1?<>Custom <span>Die Casting</span><br/><span>Molds</span> for Your Part</>:page.h1}</h1>
    <p className="home-v2-intro">{page.intro===source.intro?'Start with clear 2D or 3D drawings, or a physical sample.':page.intro}</p>
    <div className="home-v2-actions"><QuoteButton/><TextLink href="/aluminum-die-casting-molds/">Explore Mold Tooling</TextLink></div>
    <p className="home-v2-reassurance">No sign-in required.</p>
   </div></div><p className="home-v2-hero-caption">{hero.caption}</p>
  </section>
  <section className="home-v2-facts" id="project-facts" aria-label="Mold project facts"><div className="container">
   {[[Cube,'One mold set accepted'],[FileText,'Design approval first'],[GearSix,'Trial samples before shipment']].map(([Icon,text])=><div key={text}><Icon size={50} weight="light" aria-hidden="true"/><p>{text}</p></div>)}
  </div></section>
  <section className="home-v2-applications container" id="applications">
   <div className="home-v2-section-heading"><h2>{heading('applications','A Mold for Your Component')}</h2><TextLink href="/industries/">All applications</TextLink></div>
   <div className="home-v2-application-grid">{applicationCards.map(item=><article key={item.title}><Link href={item.href} className="home-v2-picture-link">
    <CmsImage src={item.image} alt={item.alt} width="800" height="700" loading="lazy"/><h3>{item.title}<ArrowRight size={21} aria-hidden="true"/></h3>
   </Link></article>)}</div><p className="home-v2-caption">Illustrative applications</p>
  </section>
  <HomeProcess heading={heading('process','Your Part. Your Mold. Clear Steps.')}/>
  <section className="home-v2-guides container" id="guides">
   <h2>{heading('guides','Before You Enquire')}</h2>
   <div className="home-v2-guide-grid">{guideCards.map(item=><article key={item.title}><Link href={item.href} className="home-v2-picture-link">
    <CmsImage src={item.image} alt={item.alt} width="960" height="540" loading="lazy"/><h3>{item.title}<ArrowRight size={21} aria-hidden="true"/></h3>
   </Link></article>)}</div><p className="home-v2-caption">Illustrative guide imagery</p>
   <p className="home-v2-faq-link">More questions? <TextLink href="/faq/">View FAQ</TextLink></p>
  </section>
  <section className="home-v2-contact" id="start-your-project">
   <CmsImage src="/assets/home-v2-cta.webp" alt="" aria-hidden="true" width="1440" height="360" loading="lazy"/>
   <div className="container"><h2>{page.final_cta?.heading!==source.final_cta?.heading?page.final_cta?.heading:"Let's Discuss Your Mold Project"}</h2>
    <div className="home-v2-actions"><QuoteButton/><a href={'https://wa.me/'+business.whatsappNumber} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="home-v2-link home-v2-whatsapp"><WhatsappLogo size={27} weight="fill" aria-hidden="true"/>Continue on WhatsApp<ArrowRight size={21} aria-hidden="true"/></a></div>
   </div>
  </section>
 </CmsHome>;
}

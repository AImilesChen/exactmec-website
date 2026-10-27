import React,{useEffect,useId,useState} from 'react';
import {CmsPageScope,useCmsMedia,useCmsPage,useCmsOrderedCards} from './cms/Rendering.jsx';
import {ArrowRight,Plus,Minus,FileText,Cube,Package,CheckCircle,ArrowDown} from '@phosphor-icons/react';
import {Link} from './Navigation.jsx';
import pages from './data/site-content.json';
import {ComposedSections} from './PageCompositions.jsx';
import {Media,FullCopy,scenes,guideImage} from './Media.jsx';
import {PhaseExplorer} from './PhaseExplorer.jsx';
export {pages};
export const quotePath='/request-a-quote/';
export function Action({href=quotePath,children='Request a Mold Quote',secondary=false}){return <Link className={secondary?'text-link':'button primary'} href={href}>{children}{secondary&&<ArrowRight size={19} aria-hidden="true"/>}</Link>}
export function Table({table}){return <div className="data-table-wrap"><table className="data-table"><thead><tr>{table.columns.map(c=><th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{table.rows.map((r,i)=><tr key={i}>{r.map((c,j)=>j===0?<th scope="row" data-label={table.columns[j]} key={j}>{c}</th>:<td data-label={table.columns[j]} key={j}>{c}</td>)}</tr>)}</tbody></table></div>}
export function FAQList({faqs,firstOpen=false}){const [open,setOpen]=useState(firstOpen?0:null);const uid=useId();return <div className="faq-list">{faqs.map(({q,a},i)=><div className="faq-item" key={q}><h3><button onClick={()=>setOpen(open===i?null:i)} aria-expanded={open===i} aria-controls={uid+'-'+i}>{q}{open===i?<Minus size={20} aria-hidden="true"/>:<Plus size={20} aria-hidden="true"/>}</button></h3><div id={uid+'-'+i} hidden={open!==i}><p>{a}</p></div></div>)}</div>}

const imagery={
 'industry-led':['lighting-studio-v2.png','Illustrative aluminum LED lighting housing'],
 'industry-motor':['motor-studio-v2.png','Illustrative aluminum motor and transmission housing'],
 'industry-electronics':['electronics-studio-v3.png','Illustrative aluminum electronics enclosure'],
 'industry-automotive':['automotive-studio-v3.png','Illustrative automotive transmission housing'],
 'industry-motorcycle':['motorcycle-studio-v3.png','Illustrative motorcycle engine side cover'],
 'industry-energy':['energy-studio-v3.png','Illustrative power equipment enclosure'],
 'industry-industrial':['industrial-studio-v3.png','Illustrative industrial automation housing'],
 'industry-tools':['tools-studio-v3.png','Illustrative power tool gearbox housing'],
 'core-mold':['mold-studio-v2.png','Illustrative custom die casting mold and housing']
};
export function ProductFigure({id='core-mold',className='',context=false,priority=false,fileOverride}){const [file,alt]=imagery[id]||imagery['core-mold'];const image=useCmsMedia('/assets/'+(fileOverride||file.replace('.png','.webp')),{alt,caption:'Illustrative example · Not a delivered project'});if(context&&scenes[id])return <div className={'industry-context-image '+className}><Media file={scenes[id]} priority={priority} alt={'Illustrative '+id.replace('industry-','')+' application context'}/></div>;return <figure className={'product-figure '+className}><img src={image.src} alt={image.alt} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':undefined}/><figcaption>{image.caption}</figcaption></figure>}

function resourceCardImage(href=''){return href.includes('quotation')?'resource-quotation-v1':href.includes('cost')?'resource-cost-v1':'resource-process-v1'}

export function ContentCards({cards,industry=false,resources=false}){
 const candidates=useCmsOrderedCards(cards);const ordered=industry?[...candidates.filter(c=>!c.href?.includes('#')),...candidates.filter(c=>c.href?.includes('#'))]:candidates;
 return <div className={'copy-cards '+(industry?'industry-cards':resources?'guide-cards':'')}>{ordered.map((c,i)=>{
  const image=industry?({'industry-automotive':'industry-automotive','industry-motorcycle-e-mobility':'industry-motorcycle','industry-led-lighting':'industry-led','industry-motor-pump-transmission':'industry-motor','industry-electronics-telecommunications':'industry-electronics','industry-energy-power':'industry-energy','industry-industrial-automation':'industry-industrial','industry-power-tools-home-appliances':'industry-tools'}[c.anchor]):null;
  return <article className={'copy-card '+(image?'image-led':'')} key={c.title} id={c.anchor}>
   {image&&<ProductFigure id={image} context/>}{resources&&<Media file={resourceCardImage(c.href)} alt={c.title+' illustrative guide cover'} caption="Illustrative cover"/>}<div className="card-copy"><span className="card-number">{String(i+1).padStart(2,'0')}</span><h3>{c.title}</h3><p>{c.text}</p>{c.href&&<Action href={industry&&c.href.includes('#')?quotePath:c.href} secondary>{industry?(c.href.includes('#')?'Discuss Your Component':'Explore This Application'):resources?'Read the Guide':'Explore This Topic'}</Action>}</div>
  </article>;
 })}</div>
}

export function CopySection({section,index=0,article=false,variant=''}){
 const hasCollection=!!section.cards,wide=hasCollection||!!section.table;
 return <section id={section.id} className={'copy-section '+(article?'article-section':'editorial-module')+' '+(wide?'wide-module ':'')+variant}>
  <div className="module-title">{!article&&<p className="section-index">{String(index+1).padStart(2,'0')}</p>}<h2>{section.heading}</h2></div>
  <div className="copy-section-content">{section.paragraphs?.map((p,i)=><p key={i}>{p}</p>)}{section.bullets&&<ul className="content-bullets">{section.bullets.map(b=><li key={b}>{b}</li>)}</ul>}
   {hasCollection&&<ContentCards cards={section.cards} industry={section.id==='application-list'} resources={['start-here','guides'].includes(section.id)}/>}{section.table&&<Table table={section.table}/>} {section.cta&&<Action href={section.cta.href} secondary>{section.cta.label}</Action>}
  </div>
 </section>
}

const stageLabels=['Product information','Quotation & payment','3D design approval','Manufacturing','Samples & mold shipment'];
function StageOverview({page}){return <nav className="stage-overview" aria-label="Project stages">{page.sections.map((s,i)=><Link href={page.path+'#'+s.id} key={s.id}><span>{String(i+1).padStart(2,'0')}</span>{stageLabels[i]}<ArrowDown size={16} aria-hidden="true"/></Link>)}</nav>}
function DocumentRelationship(){return <div className="document-relationship"><article><FileText size={36} weight="light" aria-hidden="true"/><span>STARTING INFORMATION</span><h2>Your product reference</h2><p>Clear 2D / 3D part drawings<br/>or a physical sample</p></article><ArrowDown size={24} aria-hidden="true"/><article><Cube size={36} weight="light" aria-hidden="true"/><span>AFTER PAYMENT</span><h2>The 3D mold design</h2><p>Prepared for your approval<br/>before manufacturing</p></article></div>}
function Collaboration(){return <div className="collaboration-rail"><p className="eyebrow">A CLEAR CONTACT POINT</p><div><span>01</span><h2>Your project team</h2><p>Product information & approvals</p></div><div><span>02</span><h2>ExactMec</h2><p>Inquiry & project coordination</p></div><div><span>03</span><h2>Manufacturing partners</h2><p>Mold manufacturing & trials</p></div></div>}
function Acceptance(){return <div className="acceptance-rail">{[['Mold trial','Samples are produced'],['Customer testing','Review the agreed requirements'],['Mold shipment','After your sample approval']].map(([h,p],i)=><div key={h}><span>{String(i+1).padStart(2,'0')}</span><h2>{h}</h2><p>{p}</p>{i<2&&<ArrowDown size={20} aria-hidden="true"/>}</div>)}</div>}
function Communication(){return <div className="communication-rail"><p className="eyebrow">START WITH A BASIC INQUIRY</p>{[['Your details','Name, company and a way to reply'],['Your component','What needs a mold and what you have'],['A useful conversation','Quotation scope, drawings or a sample']].map(([h,p],i)=><div key={h}><span>{String(i+1).padStart(2,'0')}</span><h2>{h}</h2><p>{p}</p></div>)}</div>}
function CompanyIdentity(){return <div className="company-identity"><p className="eyebrow">WEBSITE OPERATOR</p><h2 lang="zh-CN">台州巽风贸易有限公司</h2><p>China</p><hr/><p>Custom aluminum die casting molds.<br/>A clear contact point for your project.</p><Link href="/how-we-work/" className="text-link">How We Work<ArrowRight size={19}/></Link></div>}

function introParts(page){const sentences=page.intro.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)||[page.intro];let count=0;const first=[],rest=[];for(const s of sentences){if(first.length===0||(count+s.trim().split(/\s+/).length<=30&&first.length<1)){first.push(s.trim());count+=s.trim().split(/\s+/).length}else rest.push(s.trim())}return [first.join(' '),rest.join(' ')]}
function headerType(page){if(page.kind==='article')return 'reading';if(imagery[page.id])return 'product';if(page.id==='mold-development-process')return 'process';if(page.id==='mold-design-review')return 'documents';if(page.id==='quality-control')return 'acceptance';if(page.id==='manufacturing')return 'collaboration';if(page.id==='how-we-work')return 'communication';if(page.id==='about')return 'company';return 'directory'}
function PageHeader({page}){
 const type=headerType(page),[firstSentence]=introParts(page),lead=page.id==='mold-design-review'?page.intro:firstSentence,isArticle=page.kind==='article',hero=useCmsMedia('/assets/mold-hero-roomy-v3.webp');
 const supporting=type==='product'?<ProductFigure id={page.id} priority/>:type==='documents'?<Media file="design-review-approval-v1" priority alt="Illustrative 3D mold design review beside a product drawing and sample" caption="Illustrative design review scene · Not a customer project"/>:type==='acceptance'?<Media file="mold-sample-detail-v3" priority alt="Illustrative aluminum trial samples"/>:type==='collaboration'?<Media file="manufacturing-hero-v1" priority alt="Illustrative mold assembly and manufacturing workshop"/>:type==='communication'?<Communication/>:type==='company'?<CompanyIdentity/>:page.id==='resource-quotation-requirements'?<Media file="quotation-reference-guide-v1" priority alt="Illustrative 2D part drawing, matching 3D product model and physical aluminum sample" caption="Illustrative product references · Not a customer project"/>:isArticle?<Media file={guideImage(page.path)} priority alt={page.h1+' illustrative cover'}/>:null;
 return <header className={'editorial-header header-'+type+' header-'+page.id} style={page.id==='core-mold'&&hero.src!=='/assets/mold-hero-roomy-v3.webp'?{backgroundImage:`url("${hero.src}")`}:undefined}>
  <div className="container"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span>{page.kind==='industry'?<Link href="/industries/">Applications</Link>:isArticle?<Link href="/resources/">Resources</Link>:<span>{page.eyebrow}</span>}</nav>
   <div className="editorial-header-grid"><div className="header-copy"><p className="eyebrow">{page.eyebrow}</p><h1>{page.h1}</h1><p className="page-intro">{lead}</p>{page.id==='resource-quotation-requirements'&&<><ul className="quote-guide-quick-list"><li><FileText size={21} aria-hidden="true"/>Clear 2D drawing</li><li><Cube size={21} aria-hidden="true"/>3D part model</li><li><Package size={21} aria-hidden="true"/>Assessable sample</li></ul><p className="quote-guide-quick-note">One clear product reference is enough to start.</p><Action href={quotePath}>Start Your Mold Inquiry</Action><p className="quote-guide-form-note">Upload drawings first, or choose the sample route. No sign-in required.</p></>}{isArticle&&(page.category||page.author||page.reviewer||page.updatedAt)&&<p className="article-editorial-meta">{[page.category,page.author?'By '+page.author:'',page.reviewer?'Reviewed by '+page.reviewer:'',page.updatedAt?'Updated '+page.updatedAt.slice(0,10):''].filter(Boolean).join(' · ')}</p>}{page.id==='mold-design-review'&&<div className="design-review-hero-actions"><Action href={quotePath}>Start a Mold Inquiry</Action><Action href="#approval-steps" secondary>See the Approval Steps</Action></div>}{type==='product'&&<Action/>}{['collaboration','communication'].includes(type)&&<Action secondary/>}</div>{supporting}</div>
   {type==='process'&&<StageOverview page={page}/>}
   {page.id==='core-mold'&&<div className="service-facts"><p>From one mold set</p><p>Part drawings or a sample</p><p>Sample approval before shipment</p></div>}
   {page.id==='faq'&&<nav className="topic-nav" aria-label="Question groups">{page.sections.map(s=><Link href={page.path+'#'+s.id} key={s.id}>{s.heading}<ArrowDown size={16}/></Link>)}</nav>}
  </div>
 </header>
}
export function AdaptiveContents({label='On this page',children}){const [expanded,setExpanded]=useState(false);useEffect(()=>{const query=window.matchMedia('(min-width:961px)');const sync=()=>setExpanded(query.matches);sync();query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync)},[]);return <details open={expanded} onToggle={e=>{if(e.target===e.currentTarget)setExpanded(e.currentTarget.open)}}><summary>{label}</summary>{children}</details>}
function ReadingTOC({page}){return <aside className="page-toc reading-toc"><AdaptiveContents><nav aria-label="On this page">{page.sections.map(s=><Link href={page.path+'#'+s.id} key={s.id}>{s.heading}</Link>)}{page.faqs?.length>0&&<Link href={page.path+'#questions'}>Project Questions</Link>}</nav></AdaptiveContents></aside>}
function PageEnd({page,hideFAQs=false}){return <>{page.source_urls?.length>0&&<section className="source-notes"><h2>Further Reading</h2><ul>{page.source_urls.map((s,i)=>{const url=typeof s==='string'?s:s.url;return <li key={i}><a href={url} target="_blank" rel="noreferrer">{typeof s==='string'?new URL(s).hostname:s.title||url}</a></li>})}</ul></section>}{!hideFAQs&&page.faqs?.length>0&&<section className="copy-faq" id="questions"><div><p className="eyebrow">BEFORE YOUR INQUIRY</p><h2>Project Questions</h2></div><FAQList faqs={page.faqs}/></section>}{page.related_links?.length>0&&<section className="related-links"><h2>Continue Exploring</h2><div>{page.related_links.map(l=><Action href={l.href} secondary key={l.href}>{l.label}</Action>)}</div></section>}</>}
export function PageCTA({page}){return page.final_cta?<section className="cta-section"><div className="container cta-inner"><div><p className="eyebrow">YOUR NEXT MOLD PROJECT</p><h2>{page.final_cta.heading}</h2><p>{page.final_cta.text}</p></div><Action href={page.final_cta.href}>{page.final_cta.label}</Action></div></section>:null}

const productExampleImages={
 '/industries/led-lighting/':'products-led-example-v1',
 '/industries/motor-pump-transmission/':'products-motor-example-v1',
 '/industries/#industry-electronics-telecommunications':'products-electronics-example-v1'
};
const productSteps=[
 ['01','Product reference','Share clear part drawings or discuss a physical sample.'],
 ['02','Quote & payment','Confirm the mold scope and project terms together.'],
 ['03','Design approval','Review the 3D mold design before manufacturing.'],
 ['04','Manufacture & trial','The mold is made and trial samples are prepared.'],
 ['05','Test & handover','Test the samples; the mold ships after your approval.']
];
function ProductsPage({page}){
 const sections=Object.fromEntries((page.sections||[]).map(section=>[section.id,section]));
 const examples=useCmsOrderedCards(sections.families?.cards||[]);
 const routes=sections.information?.table?.rows||[];
 return <div className="products-page">
  <header className="products-hero"><div className="container">
   <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span>Die Casting Molds</span></nav>
   <div className="products-hero-grid"><div className="products-hero-copy"><p className="eyebrow">CUSTOM MOLD TOOLING</p><h1>{page.h1}</h1><p className="products-intro">{page.intro}</p><div className="products-hero-actions"><Action href="/request-a-quote/">Upload Drawings for a Mold Quote</Action><Action href="/aluminum-die-casting-molds/" secondary>Explore the Mold Service</Action></div><p className="products-hero-note">One mold set welcome · No sign-in required</p></div><Media file="products-hero-v1" priority alt="Illustrative open aluminum die casting mold and an electric motor end cover" caption="Illustrative example · Not a delivered project" className="products-hero-image"/></div>
  </div></header>
  <section className="products-proof"><div className="container products-proof-grid"><article><Cube size={30} weight="light" aria-hidden="true"/><div><strong>1 mold set</strong><span>Custom tooling projects welcome</span></div></article><article><FileText size={30} weight="light" aria-hidden="true"/><div><strong>Drawings or sample</strong><span>The reference for a formal quote</span></div></article><article><CheckCircle size={30} weight="light" aria-hidden="true"/><div><strong>Your approval</strong><span>Before manufacturing and mold shipment</span></div></article></div></section>
  <section id="core" className="products-service container"><Media file="products-service-v1" alt="Illustrative close-up of a machined die casting mold cavity" caption="Illustrative mold image · Not a delivered project" className="products-service-image"/><div className="products-service-copy"><p className="eyebrow">OUR MAIN TOOLING SERVICE</p><h2>{sections.core?.heading||'Custom Aluminum Die Casting Molds'}</h2><p>{sections.core?.paragraphs?.[0]||'Custom molds are assessed against your component drawings or a physical sample.'}</p><ul><li><CheckCircle size={19} aria-hidden="true"/>One mold set can be considered</li><li><CheckCircle size={19} aria-hidden="true"/>3D mold design is sent for approval after payment</li><li><CheckCircle size={19} aria-hidden="true"/>Trial samples are sent for your testing</li></ul><Action href={sections.core?.cta?.href||'/aluminum-die-casting-molds/'}>Explore Aluminum Die Casting Molds</Action></div></section>
  <aside className="products-secondary container"><div><p className="eyebrow">ADDITIONAL PROJECT INQUIRIES</p><h2>Have an injection mold project?</h2><p>We can discuss it case by case. Aluminum die casting molds remain our main service.</p></div><Action href="/request-a-quote/" secondary>Discuss an Injection Mold</Action></aside>
  <section id="families" className="products-applications"><div className="container"><div className="products-section-heading"><div><p className="eyebrow">APPLICATION EXAMPLES</p><h2>{sections.families?.heading||'Explore Mold Applications'}</h2><p>Different components call for different mold discussions. These images illustrate possible applications, not completed customer projects.</p></div><Action href="/industries/" secondary>View All Applications</Action></div><div className="products-example-grid">{examples.map((card,index)=><article className="products-example" key={card.title}><Media file={productExampleImages[card.href]||Object.values(productExampleImages)[index%3]} alt={'Illustrative '+card.title.toLowerCase()+' aluminum component'} caption="Illustrative application example"/><div className="products-example-copy"><h3>{card.title}</h3><p>{card.text}</p><Action href={card.href||'/industries/'} secondary>Explore Application</Action></div></article>)}</div></div></section>
  <section id="process" className="products-process"><div className="container"><div className="products-section-heading"><div><p className="eyebrow">FROM REFERENCE TO HANDOVER</p><h2>Clear Steps for Your Mold Project</h2><p>You approve the design before manufacturing and test trial samples before the mold is shipped.</p></div><Action href="/mold-development-process/" secondary>See the Full Process</Action></div><ol className="products-process-grid">{productSteps.map(([number,title,description])=><li key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></li>)}</ol><p className="products-process-note">A typical project is approximately 30–40 days from payment; scope and milestones are confirmed for each project. This is not a guaranteed arrival date.</p></div></section>
  <section id="information" className="products-preparation container"><div><p className="eyebrow">START WITH WHAT YOU HAVE</p><h2>{sections.information?.heading||'What to Prepare for a Mold Quote'}</h2><p>Clear product information helps us assess the mold request. Formal quotation requires clear part drawings or an assessable physical sample.</p><Action href="/request-a-quote/">Start a Mold Inquiry</Action></div><div className="products-reference-list">{routes.map(([label,description],index)=><article key={label}><span>{String(index+1).padStart(2,'0')}</span><div><h3>{label}</h3><p>{description}</p></div></article>)}</div></section>
  <aside id="scope" className="products-scope"><div className="container"><Package size={30} weight="light" aria-hidden="true"/><div><h2>{sections.scope?.heading||'What You Are Requesting'}</h2><p>The inquiry is for a custom mold. Trial castings support sample testing; we do not currently offer ongoing die-cast parts production.</p></div><Action href={sections.scope?.cta?.href||'/resources/die-casting-mold-quotation-requirements/'} secondary>Quotation Requirements</Action></div></aside>
  {page.faqs?.length>0&&<section className="products-faq container" id="questions"><div><p className="eyebrow">BEFORE YOU INQUIRE</p><h2>Frequently Asked Questions</h2><p>Find the right starting point for your project.</p></div><FAQList faqs={page.faqs}/></section>}
  <PageCTA page={page}/>
 </div>
}

function MotorIndustryPage({page}){
 const sections=Object.fromEntries((page.sections||[]).map(section=>[section.id,section]));
 const applications=useCmsOrderedCards(sections.applications?.cards||[]);
 const featureDescriptions=[
  'Show where the component meets other parts and how it is mounted.',
  'Identify openings and bearing-related features your team will review.',
  'Describe project-specific passage, joint or sealing requirements.',
  'Separate the current part version from later machining or changes.'
 ];
 const briefItems=[
  ['01','Current part reference','Clear 2D / 3D drawings or an assessable physical sample.'],
  ['02','Assembly context','Related parts, relevant interfaces and intended use.'],
  ['03','Receiving requirements','Mold connection or machine information, if applicable.']
 ];
 const steps=[
  ['01','Product reference','Share drawings or discuss an assessable sample.'],
  ['02','Quote & payment','Agree the custom mold scope and project terms.'],
  ['03','Design approval','Confirm the 3D mold design before manufacturing.'],
  ['04','Trial & testing','Review the trial samples mailed to your team.'],
  ['05','Mold handover','The finished mold ships after sample approval.']
 ];
 return <div className="motor-industry-page">
  <header className="motor-hero"><div className="container">
   <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/industries/">Applications</Link><span>/</span><span>Motors, Pumps & Gearboxes</span></nav>
   <div className="motor-hero-grid"><div className="motor-hero-copy"><p className="eyebrow">MOTOR · PUMP · GEARBOX TOOLING</p><h1>{page.h1}</h1><p>{page.intro}</p><div className="motor-hero-actions"><Action href={quotePath}>Upload Drawings for a Mold Quote</Action><Action href="#applications" secondary>Explore Applications</Action></div><p className="motor-hero-note">One mold set welcome · No sign-in required</p></div><ProductFigure id="industry-motor" priority className="motor-hero-image"/></div>
  </div></header>
  <section className="motor-essentials" aria-label="Service scope"><div className="container motor-essential-grid"><div><Cube size={28} weight="light" aria-hidden="true"/><p><strong>Custom mold tooling</strong><span>Built around your component</span></p></div><div><FileText size={28} weight="light" aria-hidden="true"/><p><strong>Drawings or sample</strong><span>For a formal mold quotation</span></p></div><div><Package size={28} weight="light" aria-hidden="true"/><p><strong>Mold-only service</strong><span>Trial samples support your testing</span></p></div></div></section>
  <section id="applications" className="motor-applications"><div className="container"><div className="motor-section-intro"><p className="eyebrow">APPLICATION EXAMPLES</p><h2>{sections.applications?.heading}</h2><p>{sections.applications?.paragraphs?.[0]}</p></div><div className="motor-application-grid">{applications.map(card=><article key={card.title}><Media file={card.image} alt={'Illustrative aluminum '+card.title.toLowerCase()+' component'} caption="Illustrative application · Not a customer case"/><div><h3>{card.title}</h3><p>{card.text}</p></div></article>)}</div><p className="motor-application-note">These images show component types that can start a mold discussion. Project suitability is confirmed from your requirements.</p></div></section>
  <section id="interfaces" className="motor-interfaces"><div className="container motor-interfaces-grid"><div className="motor-interfaces-copy"><p className="eyebrow">ENGINEERING CONTEXT</p><h2>{sections.interfaces?.heading}</h2>{sections.interfaces?.paragraphs?.map((paragraph,i)=><p key={i}>{paragraph}</p>)}</div><ol className="motor-feature-grid">{sections.interfaces?.bullets?.map((feature,i)=><li key={feature}><span>{String(i+1).padStart(2,'0')}</span><h3>{feature}</h3><p>{featureDescriptions[i]}</p></li>)}</ol></div></section>
  <section id="project-brief" className="motor-brief"><div className="container motor-brief-grid"><div><p className="eyebrow">PREPARE YOUR INQUIRY</p><h2>{sections['project-brief']?.heading}</h2>{sections['project-brief']?.paragraphs?.map((paragraph,i)=><p key={i}>{paragraph}</p>)}<Action href={quotePath}>Start With Your Drawings</Action></div><ol>{briefItems.map(([number,title,text])=><li key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></div></section>
  <section id="example-brief" className="motor-example"><div className="container motor-example-grid"><div><p className="eyebrow">ILLUSTRATIVE INQUIRY SCENARIO</p><h2>{sections['example-brief']?.heading}</h2>{sections['example-brief']?.paragraphs?.map((paragraph,i)=><p key={i}>{paragraph}</p>)}</div><div className="motor-example-steps"><div><span>01</span><strong>Existing reference</strong><p>Current drawing or physical sample</p></div><div><span>02</span><strong>Points to clarify</strong><p>Related parts, passages and changes</p></div><div><span>03</span><strong>Customer review</strong><p>Agreed features on trial samples</p></div></div></div></section>
  <section id="process" className="motor-process"><div className="container"><div className="motor-section-intro"><p className="eyebrow">MOLD PROJECT STAGES</p><h2>{sections.process?.heading}</h2><p>{sections.process?.paragraphs?.[0]}</p></div><ol className="motor-process-grid">{steps.map(([number,title,text])=><li key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></li>)}</ol><p className="motor-process-note">{sections.process?.paragraphs?.[1]}</p><Action href="/mold-design-review/" secondary>How design approval works</Action></div></section>
  <div className="container motor-end-content"><PageEnd page={page}/></div><PageCTA page={page}/>
 </div>;
}

function CoreMoldPage({page}){
 const sections=Object.fromEntries((page.sections||[]).map(section=>[section.id,section]));
 const applications=useCmsOrderedCards(sections.components?.cards||[]);
 const applicationImages={
  '/industries/led-lighting/':'core-mold-lighting-v1',
  '/industries/motor-pump-transmission/':'core-mold-motor-v1',
  '/industries/':'core-mold-electronics-v1'
 };
 const steps=[
  ['01','Part reference','Share clear product drawings or discuss an assessable physical sample.'],
  ['02','Quote & payment','Agree the custom mold scope and project terms together.'],
  ['03','Design approval','Review the 3D mold design before manufacturing begins.'],
  ['04','Trial & handover','Test the trial samples; the mold ships after your approval.']
 ];
 return <div className="core-mold-page">
  <header className="core-mold-hero"><div className="container">
   <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/products/">Mold Tooling</Link><span>/</span><span>Aluminum Die Casting Molds</span></nav>
   <div className="core-mold-hero-grid"><div className="core-mold-hero-copy"><p className="eyebrow">CUSTOM ALUMINUM TOOLING</p><h1>{page.h1}</h1><p className="core-mold-lead">{page.intro}</p><div className="core-mold-hero-actions"><Action href={quotePath}>Upload Drawings for a Mold Quote</Action><Action href="#how-it-works" secondary>See How the Project Works</Action></div><p className="core-mold-hero-note">One mold set welcome · No sign-in required</p></div><Media file="core-mold-hero-v1" priority alt="Illustrative open aluminum die casting mold and ribbed aluminum housing" caption="Illustrative mold and component · Not a delivered project" className="core-mold-hero-image"/></div>
  </div></header>
  <section className="core-mold-proof" aria-label="Project essentials"><div className="container core-mold-proof-grid"><div><Cube size={29} weight="light" aria-hidden="true"/><p><strong>1 mold set</strong><span>Custom projects welcome</span></p></div><div><FileText size={29} weight="light" aria-hidden="true"/><p><strong>Drawings or sample</strong><span>The basis for a formal quote</span></p></div><div><CheckCircle size={29} weight="light" aria-hidden="true"/><p><strong>Your approval</strong><span>Before manufacturing and shipment</span></p></div></div></section>
  <section className="core-mold-deliver container" id="mold-service"><div className="core-mold-section-heading"><p className="eyebrow">MOLD-ONLY SERVICE</p><h2>Tooling Built Around Your Component</h2><p>We coordinate custom aluminum die casting mold projects through manufacturing partners. The deliverable is the mold; trial castings support your approval before handover.</p></div><div className="core-mold-deliver-grid"><article><Cube size={33} weight="light" aria-hidden="true"/><h3>Custom mold</h3><p>Define the tooling against your part geometry, intended use and agreed requirements.</p></article><article><FileText size={33} weight="light" aria-hidden="true"/><h3>3D design for approval</h3><p>After payment, review the mold design and confirm it before manufacturing starts.</p></article><article><Package size={33} weight="light" aria-hidden="true"/><h3>Trial samples & mold</h3><p>Test the samples first. The finished mold is shipped after your approval.</p></article></div></section>
  <section className="core-mold-reference" id="requirements"><div className="container core-mold-reference-grid"><div><p className="eyebrow">START WITH YOUR PART</p><h2>{sections.requirements?.heading||'Begin with the Part, Not a Standard Mold'}</h2><p>Clear 2D or 3D product drawings help us assess geometry and requirements. STEP/STP files are welcome. An assessable physical sample is another starting point for a formal quotation.</p><p>Photos alone can begin a preliminary discussion. We will discuss missing dimensions or details before a formal quote.</p><div className="core-mold-inline-actions"><Action href={quotePath}>Upload Product Drawings</Action><Action href="/resources/die-casting-mold-quotation-requirements/" secondary>What to Prepare</Action></div></div><div className="core-mold-reference-panel"><div><FileText size={38} weight="light" aria-hidden="true"/><span>01</span><strong>2D / 3D part drawings</strong><p>Clear dimensions and the product features that matter.</p></div><div><Cube size={38} weight="light" aria-hidden="true"/><span>02</span><strong>Physical sample</strong><p>Discuss how to send an assessable sample.</p></div><p className="core-mold-reference-foot">The product reference supports quotation. The 3D mold design is prepared after payment.</p></div></div></section>
  <section className="core-mold-applications" id="components"><div className="container"><div className="core-mold-section-heading"><p className="eyebrow">APPLICATION EXAMPLES</p><h2>{sections.components?.heading||'Molds for Housings, Covers and More'}</h2><p>Each component has its own geometry and mold requirements. These images show possible applications, not completed customer cases.</p></div><div className="core-mold-application-grid">{applications.map(card=><article key={card.title}><Media file={applicationImages[card.href]||'core-mold-electronics-v1'} alt={'Illustrative aluminum component for '+card.title.toLowerCase()} caption="Illustrative application · Not a customer case"/><div><h3>{card.title}</h3><p>{card.text}</p><Action href={card.href||'/industries/'} secondary>Explore Application</Action></div></article>)}</div></div></section>
  <section className="core-mold-design container" id="design"><Media file="core-mold-design-v1" alt="Illustrative CAD mold design review with product drawing and aluminum sample" caption="Illustrative design review scene"/><div><p className="eyebrow">DESIGN CONFIRMATION</p><h2>{sections.design?.heading||'Confirm the 3D Mold Design Before Manufacturing'}</h2><p>{sections.design?.paragraphs?.[0]}</p><p>The product drawing used for a quote and the mold design prepared after payment are different documents. We confirm the agreed revision before production.</p><Action href={sections.design?.cta?.href||'/mold-design-review/'} secondary>Understand Design Approval</Action></div></section>
  <section className="core-mold-trial" id="validation"><div className="container core-mold-trial-grid"><div><p className="eyebrow">TRIAL & HANDOVER</p><h2>{sections.validation?.heading||'Test Trial Samples Before Mold Shipment'}</h2><p>{sections.validation?.paragraphs?.[0]}</p><ol><li><strong>Mold trial</strong><span>Samples are produced for review.</span></li><li><strong>Customer testing</strong><span>You check the agreed fit and requirements.</span></li><li><strong>Mold shipment</strong><span>After you approve the samples.</span></li></ol><Action href={sections.validation?.cta?.href||'/quality-control/'} secondary>See Trial and Quality Stages</Action></div><Media file="core-mold-trial-v1" alt="Illustrative inspection of aluminum trial castings beside a die casting mold" caption="Illustrative inspection scene · Not a customer project"/></div></section>
  <section className="core-mold-process container" id="how-it-works"><div className="core-mold-section-heading"><p className="eyebrow">FROM REFERENCE TO HANDOVER</p><h2>Four Clear Project Stages</h2><p>We coordinate each stage with our manufacturing partners and keep your approvals in the process.</p></div><ol className="core-mold-steps">{steps.map(([number,title,description])=><li key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></li>)}</ol><p className="core-mold-time">Typical mold production is approximately <strong>30–40 days from payment</strong>. Scope, approval timing, testing and shipping are confirmed for each project; this is not a guaranteed arrival date.</p><Action href="/mold-development-process/" secondary>View the Full Mold Process</Action></section>
  <aside className="core-mold-scope" id="commercial"><div className="container"><div><p className="eyebrow">QUOTATION SCOPE</p><h2>Quote the Mold for Your Actual Part</h2><p>Structure, complexity, requirements and the agreed trial and delivery scope all affect cost. We review the drawings or sample with you before pricing.</p></div><div className="core-mold-scope-links"><Action href="/resources/die-casting-mold-cost/" secondary>Understand Cost Factors</Action><Action href="/resources/die-casting-mold-quotation-requirements/" secondary>Prepare Your Inquiry</Action></div></div></aside>
  {page.faqs?.length>0&&<section className="core-mold-faq container" id="questions"><div><p className="eyebrow">BEFORE YOUR INQUIRY</p><h2>Aluminum Die Casting Mold FAQs</h2><p>Answers about the quotation basis, timing and what we deliver.</p></div><FAQList faqs={page.faqs}/></section>}
  <PageCTA page={page}/>
 </div>
}

function FAQPageBody({page}){const groupIndices=[[0,1,2,3,4,8],[5,7,10],[6],[9,11]];return <div className="faq-group-list">{page.sections.map((s,i)=><section id={s.id} className="faq-group" key={s.id}><div className="faq-group-heading"><span className="section-index">{String(i+1).padStart(2,'0')}</span><h2>{s.heading}</h2></div><div><FAQList faqs={(groupIndices[i]||[]).map(j=>page.faqs[j]).filter(Boolean).concat(i===page.sections.length-1?page.faqs.slice(12):[])} firstOpen={i===0}/><div className="faq-context">{s.paragraphs.map(p=><p key={p}>{p}</p>)}{s.cta&&<Action secondary href={s.cta.href}>{s.cta.label}</Action>}</div></div></section>)}</div>}
export function ContentPage({page:sourcePage}){
 const page=useCmsPage(sourcePage);
 if(page.id==='products')return <CmsPageScope page={page}><ProductsPage page={page}/></CmsPageScope>;
 if(page.id==='core-mold')return <CmsPageScope page={page}><CoreMoldPage page={page}/></CmsPageScope>;
 if(page.id==='industry-motor')return <CmsPageScope page={page}><MotorIndustryPage page={page}/></CmsPageScope>;
 const article=page.kind==='article',[,rest]=introParts(page);const detail=page.id==='mold-development-process'?'timeline-page':page.id==='mold-design-review'?'document-page':page.id==='quality-control'?'quality-page':page.id==='resources'?'guide-index-page':page.id==='industries'?'application-index-page':page.id==='products'?'product-index-page':page.kind==='industry'?'industry-page':'';
 return <CmsPageScope page={page}><div className={'editorial-page page-'+page.id+' '+detail}>
  {page.phase==='P1-prepared'&&<div className="draft-strip">Prepared industry page · Internal design preview · P0 visitors use the application overview</div>}
  <PageHeader page={page}/>{page.id==='mold-development-process'&&<section className="full-process-feature"><div className="container"><PhaseExplorer full/></div></section>}<div className={'container editorial-body '+(article?'reading-layout':'')}>
   {article&&<ReadingTOC page={page}/>}
   <div className="page-body">{rest&&page.id!=='mold-design-review'&&(article?<p className="intro-continuation">{rest}</p>:<div className="intro-continuation"><FullCopy paragraphs={[rest]} label="More about this project"/></div>)}
    {page.id==='faq'?<FAQPageBody page={page}/>:<ComposedSections page={page} CopySection={CopySection} Cards={ContentCards} Table={Table} Action={Action} ProductFigure={ProductFigure}/>}<PageEnd page={page} hideFAQs={page.id==='faq'}/>
   </div>
  </div><PageCTA page={page}/>
 </div></CmsPageScope>
}

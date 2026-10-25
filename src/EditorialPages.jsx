import React,{useEffect,useId,useState} from 'react';
import {ArrowRight,Plus,Minus,FileText,Cube,CheckCircle,ArrowDown} from '@phosphor-icons/react';
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
export function ProductFigure({id='core-mold',className='',context=false,priority=false}){if(context&&scenes[id])return <div className={'industry-context-image '+className}><Media file={scenes[id]} priority={priority} alt={'Illustrative '+id.replace('industry-','')+' application context'}/></div>;const [file,alt]=imagery[id]||imagery['core-mold'];return <figure className={'product-figure '+className}><img src={'/assets/'+(id==='core-mold'?'mold-hero-roomy-v3.webp':file.replace('.png','.webp'))} alt={alt} loading="lazy"/><figcaption>Illustrative example · Not a delivered project</figcaption></figure>}

export function ContentCards({cards,industry=false,resources=false}){
 const ordered=industry?[...cards.filter(c=>!c.href?.includes('#')),...cards.filter(c=>c.href?.includes('#'))]:cards;
 return <div className={'copy-cards '+(industry?'industry-cards':resources?'guide-cards':'')}>{ordered.map((c,i)=>{
  const image=industry?({'industry-automotive':'industry-automotive','industry-motorcycle-e-mobility':'industry-motorcycle','industry-led-lighting':'industry-led','industry-motor-pump-transmission':'industry-motor','industry-electronics-telecommunications':'industry-electronics','industry-energy-power':'industry-energy','industry-industrial-automation':'industry-industrial','industry-power-tools-home-appliances':'industry-tools'}[c.anchor]):null;
  return <article className={'copy-card '+(image?'image-led':'')} key={c.title} id={c.anchor}>
   {image&&<ProductFigure id={image} context/>}{resources&&<Media file={guideImage(c.href)} alt={c.title+' illustrative guide cover'} caption="Illustrative cover"/>}<div className="card-copy"><span className="card-number">{String(i+1).padStart(2,'0')}</span><h3>{c.title}</h3><p>{c.text}</p>{c.href&&<Action href={industry&&c.href.includes('#')?quotePath:c.href} secondary>{industry?(c.href.includes('#')?'Discuss Your Component':'Explore This Application'):resources?'Read the Guide':'Explore This Topic'}</Action>}</div>
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
 const type=headerType(page),[lead]=introParts(page),isArticle=page.kind==='article';
 const supporting=type==='product'?<ProductFigure id={page.id} context={page.kind==='industry'} priority/>:type==='documents'?<Media file="design-review-scene-v3" priority alt="Illustrative 3D mold design review"/>:type==='acceptance'?<Media file="mold-sample-detail-v3" priority alt="Illustrative aluminum trial samples"/>:type==='collaboration'?<Media file="mold-machining-scene-v3" priority alt="Illustrative mold machining"/>:type==='communication'?<Communication/>:type==='company'?<CompanyIdentity/>:isArticle?<Media file={guideImage(page.path)} priority alt={page.h1+' illustrative cover'}/>:null;
 return <header className={'editorial-header header-'+type+' header-'+page.id}>
  <div className="container"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span>{page.kind==='industry'?<Link href="/industries/">Applications</Link>:isArticle?<Link href="/resources/">Resources</Link>:<span>{page.eyebrow}</span>}</nav>
   <div className="editorial-header-grid"><div className="header-copy"><p className="eyebrow">{page.eyebrow}</p><h1>{page.h1}</h1><p className="page-intro">{lead}</p>{type==='product'&&<Action/>}{['collaboration','communication'].includes(type)&&<Action secondary/>}</div>{supporting}</div>
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

function FAQPageBody({page}){const groupIndices=[[0,1,2,3,4,8],[5,7,10],[6],[9,11]];return <div className="faq-group-list">{page.sections.map((s,i)=><section id={s.id} className="faq-group" key={s.id}><div className="faq-group-heading"><span className="section-index">{String(i+1).padStart(2,'0')}</span><h2>{s.heading}</h2></div><div><FAQList faqs={groupIndices[i].map(j=>page.faqs[j])} firstOpen={i===0}/><div className="faq-context">{s.paragraphs.map(p=><p key={p}>{p}</p>)}{s.cta&&<Action secondary href={s.cta.href}>{s.cta.label}</Action>}</div></div></section>)}</div>}
export function ContentPage({page}){
 const article=page.kind==='article',[,rest]=introParts(page);const detail=page.id==='mold-development-process'?'timeline-page':page.id==='mold-design-review'?'document-page':page.id==='quality-control'?'quality-page':page.id==='resources'?'guide-index-page':page.id==='industries'?'application-index-page':page.id==='products'?'product-index-page':page.kind==='industry'?'industry-page':'';
 return <div className={'editorial-page page-'+page.id+' '+detail}>
  {page.phase==='P1-prepared'&&<div className="draft-strip">Prepared industry page · Internal design preview · P0 visitors use the application overview</div>}
  <PageHeader page={page}/>{page.id==='mold-development-process'&&<section className="full-process-feature"><div className="container"><PhaseExplorer full/></div></section>}<div className={'container editorial-body '+(article?'reading-layout':'')}>
   {article&&<ReadingTOC page={page}/>}
   <div className="page-body">{rest&&(article?<p className="intro-continuation">{rest}</p>:<div className="intro-continuation"><FullCopy paragraphs={[rest]} label="More about this project"/></div>)}
    {page.id==='faq'?<FAQPageBody page={page}/>:<ComposedSections page={page} CopySection={CopySection} Cards={ContentCards} Table={Table} Action={Action} ProductFigure={ProductFigure}/>}<PageEnd page={page} hideFAQs={page.id==='faq'}/>
   </div>
  </div><PageCTA page={page}/>
 </div>
}

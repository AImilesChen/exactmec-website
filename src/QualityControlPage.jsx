import React from 'react';
import {ArrowRight,CheckCircle,ChatCircleText,Cube,Package,Truck} from '@phosphor-icons/react';
import {Link} from './Navigation.jsx';
import {Media} from './Media.jsx';

const quotePath='/request-a-quote/';

const stages=[
 {number:'01',title:'Complete the mold',detail:'The custom mold is made for the agreed project.',icon:Cube},
 {number:'02',title:'Trial the mold',detail:'The completed mold is trialed and sample parts are produced.',icon:CheckCircle},
 {number:'03',title:'Send samples',detail:'Trial samples are shipped to you for testing.',icon:Package},
 {number:'04',title:'You test & respond',detail:'Your team tests the parts and tells us the result.',icon:ChatCircleText},
 {number:'05',title:'Ship the mold',detail:'The finished mold ships after you accept the samples.',icon:Truck}
];

export function QualityControlPage({page,Action,FAQList}){
 const sections=Object.fromEntries((page.sections||[]).map(section=>[section.id,section]));
 const trial=sections.trial||{},shipment=sections['sample-shipment']||{},testing=sections['customer-testing']||{},feedback=sections.feedback||{},release=sections.release||{};
 return <div className="quality-trial-page">
  <header className="quality-hero"><div className="container">
   <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span>Trial &amp; Sample Approval</span></nav>
   <div className="quality-hero-grid"><div className="quality-hero-copy"><p className="eyebrow">MOLD TRIAL &amp; SAMPLE APPROVAL</p><h1>{page.h1||'Test trial samples before your mold ships'}</h1><p>{page.intro||'After the mold is made, we trial it and send sample parts to you. Your team tests the samples and confirms acceptance before we ship the finished mold.'}</p><div className="quality-hero-actions"><Action href={quotePath}>Request a Mold Quote</Action><Action href="#sample-steps" secondary>See the Sample Steps</Action></div><small>Your team tests the samples · One mold set welcome</small></div>
    <Media file="quality-trial-samples-v1" priority alt="Illustrative assortment of aluminum trial components on a worktable" caption="Illustrative sample scene · Not a customer project"/></div>
  </div></header>

  <section className="quality-sequence" id="sample-steps"><div className="container"><div className="quality-section-heading"><p className="eyebrow">FROM MOLD TO HANDOVER</p><h2>Five clear steps before mold shipment</h2><p>The sample stage starts after mold manufacture. Testing and acceptance belong to your team.</p></div><ol className="quality-steps">{stages.map(({number,title,detail,icon:Icon})=><li key={number}><span className="quality-step-number">{number}</span><Icon size={28} weight="light" aria-hidden="true"/><h3>{title}</h3><p>{detail}</p></li>)}</ol></div></section>

  <section className="quality-feature container" id="trial"><Media file="mold-trial-scene-v3" alt="Illustrative aluminum casting mold with trial sample parts" caption="Illustrative mold trial scene · Not a partner factory or customer project"/><div><p className="eyebrow">MOLD TRIAL</p><h2>{trial.heading||'Trial the completed mold'}</h2><p>{trial.paragraphs?.[0]||'Once the custom mold is complete, it is trialed to produce sample parts. We prepare those samples for your testing.'}</p><div className="quality-inline-note"><CheckCircle size={23} weight="light" aria-hidden="true"/><span>Trial samples support mold acceptance. We do not currently offer cast-part mass production.</span></div><Action href="/manufacturing/" secondary>See Our Mold Manufacturing Scope</Action></div></section>

  <section className="quality-shipment" id="sample-shipment"><div className="container quality-shipment-grid"><div><p className="eyebrow">SAMPLES SENT TO YOU</p><h2>{shipment.heading||'Receive samples for your own testing'}</h2><p>{shipment.paragraphs?.[0]||'We send the trial samples to you. Your team can then test the parts in the way that matters for your product.'}</p><p className="quality-muted">Sample quantity, shipping details and any project-specific arrangements are discussed directly with you.</p></div><Media file="quality-sample-shipment-v1" alt="Illustrative aluminum trial samples in protective shipping packaging" caption="Illustrative sample shipment · Not an actual customer delivery"/></div></section>

  <section className="quality-customer container" id="customer-testing"><div className="quality-section-heading"><p className="eyebrow">YOUR TEST, YOUR DECISION</p><h2>{testing.heading||'Test the samples and tell us the result'}</h2><p>{testing.paragraphs?.[0]||'Your team checks whether the trial samples meet your product needs. The review depends on your component and project.'}</p></div><div className="quality-customer-grid"><article><span>01</span><h3>Test the samples</h3><p>Use the samples to assess the product requirements relevant to your project.</p></article><article><span>02</span><h3>Share your feedback</h3><p>Tell us if you accept the samples or if something needs discussion.</p></article><article><span>03</span><h3>Confirm acceptance</h3><p>Once you confirm the samples are acceptable, we arrange shipment of the finished mold.</p></article></div></section>

  <section className="quality-feedback" id="feedback"><div className="container quality-feedback-grid"><div><p className="eyebrow">IF A SAMPLE NEEDS ATTENTION</p><h2>{feedback.heading||'Tell us what needs to change'}</h2><p>{feedback.paragraphs?.[0]||'If a sample does not meet your needs, describe the issue and the sample concerned. We will discuss the next action with you before the mold is shipped.'}</p></div><aside><ChatCircleText size={34} weight="light" aria-hidden="true"/><h3>Useful feedback</h3><ul><li>Which sample or feature is involved?</li><li>What result did you observe?</li><li>Do you have a photo, measurement or other context to share?</li></ul><p>Any change to scope, cost or timing is discussed for the individual project.</p></aside></div></section>

  <section className="quality-release container" id="release"><div className="quality-release-icon"><Truck size={52} weight="light" aria-hidden="true"/></div><div><p className="eyebrow">AFTER YOUR APPROVAL</p><h2>{release.heading||'Your sample acceptance comes before mold shipment'}</h2><p>{release.paragraphs?.[0]||'We arrange shipment of the finished mold after you confirm the trial samples are acceptable.'}</p></div><Action href="/mold-handover/" secondary>Explore Mold Handover</Action></section>

  <section className="quality-end container" id="questions"><div><p className="eyebrow">BEFORE YOUR INQUIRY</p><h2>Trial sample questions</h2><div className="quality-related"><Link href="/mold-design-review/">Mold design approval <ArrowRight size={17} aria-hidden="true"/></Link><Link href="/how-we-work/">How we work together <ArrowRight size={17} aria-hidden="true"/></Link></div></div><FAQList faqs={page.faqs||[]}/></section>

  <section className="quality-final"><div className="container quality-final-grid"><div><p className="eyebrow">START YOUR MOLD PROJECT</p><h2>{page.final_cta?.heading||'Tell us about the part you need to make'}</h2><p>{page.final_cta?.text||'Share your product drawings or discuss a physical sample. We will review the mold project with you.'}</p></div><Action href={page.final_cta?.href||quotePath}>{page.final_cta?.label||'Request a Mold Quote'}</Action></div></section>
 </div>;
}

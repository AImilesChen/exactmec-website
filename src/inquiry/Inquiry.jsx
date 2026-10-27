import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle, UploadSimple } from '@phosphor-icons/react';
import copy from '../data/inquiry-copy.json';
import states from '../data/form-states.json';
import { Link } from '../Navigation.jsx';
import { buildInquiryPayload, countries, currencies, initialValues, moldQuantities, moldTypes, notifyInquiryEvent, validateInquiry, whatsappContactHref, whatsappHref } from './model.mjs';
import { createInquiryClient, sameOriginEndpoint } from './client.mjs';
import {checkInquiryFiles,fileExtension,MAX_FILES,MAX_FILE_BYTES,MAX_TOTAL_BYTES} from '../../backend/inquiry-files.mjs';
import {formatFileSize} from './file-size.mjs';

const TOOL = '/aluminum-die-casting-molds/';
const failureStates = ['failed', 'pending', 'rate_limit', 'invalid', 'unavailable'];

function TextLink({ href, children }) {
  return <Link href={href} className="text-link">{children}<ArrowRight size={21} aria-hidden="true" /></Link>;
}

export function Inquiry({ reviewMode = true, submitEnabled = false, endpoint = '/api/inquiries', whatsappNumber = '', onEvent = () => {}, initialData, startAtMaterials = false, getSourceSnapshot = () => undefined, sourceKnownPaths = [], heading, intro }) {
  const demo = reviewMode && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('demo') : null;
  const [values, setValues] = useState(() => ({...initialValues(),...initialData}));
  const [step, setStep] = useState(initialData && !startAtMaterials ? 'details' : 'materials');
  const [materialRoute, setMaterialRoute] = useState(initialData?.drawing_status === 'A physical sample' ? 'sample' : ['Photos / concept only','Not sure yet'].includes(initialData?.drawing_status) ? 'concept' : 'drawings');
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState('');
  const [errors, setErrors] = useState(() => demo === 'invalid' ? validateInquiry(initialValues(), copy.groups) : {});
  const [result, setResult] = useState({ state: demo === 'loading' ? 'submitting' : 'idle' });
  const [copyStatus, setCopyStatus] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [session, setSession] = useState(0);
  const formRef = useRef(null);
  const headingRef = useRef(null);
  const mounted = useRef(false);
  const submitting = useRef(false);
  const started = useRef(false);
  const sourceSnapshot = useRef(null);
  // The canonical relative endpoint must render consistently before hydration;
  // the client still validates the actual request origin before transmitting.
  const configured = !reviewMode && submitEnabled === true && (endpoint === '/api/inquiries' || !!sameOriginEndpoint(endpoint));
  const unavailable = !reviewMode && !configured;
  const client = useMemo(() => createInquiryClient({ endpoint, submitEnabled: !reviewMode && submitEnabled === true }), [endpoint, submitEnabled, reviewMode, session]);
  const busy = result.state === 'submitting';
  const confirmed = ['saved', 'duplicate'].includes(result.state);
  const dirty = files.length > 0 || JSON.stringify(values) !== JSON.stringify(initialValues());

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!dirty || confirmed) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, confirmed]);
  useEffect(() => {
    if (confirmed || result.state === 'review_complete') headingRef.current?.focus();
  }, [confirmed, result.state]);
  useEffect(() => {
    const tick = () => setWaitSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    if (!retryAt) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  function focusError() {
    requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
  }
  function update(key, value) {
    if (!started.current) {
      started.current = true;
      notifyInquiryEvent(onEvent, reviewMode, 'inquiry_started');
    }
    setValues(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: undefined }));
  }
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || busy || waitSeconds > 0) return;
    notifyInquiryEvent(onEvent, reviewMode, 'inquiry_submit_attempt');
    const found = validateInquiry(values, copy.groups);
    const checked=checkInquiryFiles(files,values.drawing_status);
    if(materialRoute==='drawings'&&checked.error){setStep('materials');setFileError('Add at least one product drawing before continuing. You can choose the sample or no-drawings path instead.');return;}
    if(checked.error){setStep('materials');setFileError('Check file type, count and size before submitting.');return;}
    setErrors(found);
    if (Object.keys(found).length) { notifyInquiryEvent(onEvent, reviewMode, 'inquiry_submit_failed', 'invalid'); focusError(); return; }
    if (!reviewMode && !configured) { setResult({ state: 'unavailable' }); return; }
    if (reviewMode) {
      setResult({ state: ['failed', 'pending', 'rate_limit'].includes(demo) ? demo : 'review_complete' });
      return;
    }
    submitting.current = true;
    setResult({ state: 'submitting' });
    // Freeze attribution on the first accepted attempt so manual retries use the
    // same body/idempotency key even if the address bar changes after a timeout.
    if (!sourceSnapshot.current) {
      try { sourceSnapshot.current = buildInquiryPayload(values, getSourceSnapshot(), sourceKnownPaths).source; }
      catch { sourceSnapshot.current = buildInquiryPayload(values).source; }
    }
    const next = await client.submit(buildInquiryPayload(values, sourceSnapshot.current, sourceKnownPaths),files);
    submitting.current = false;
    if (!mounted.current) return;
    setResult(next);
    if (['saved', 'duplicate'].includes(next.state)) notifyInquiryEvent(onEvent, reviewMode, 'inquiry_submit_success', next.state);
    else notifyInquiryEvent(onEvent, reviewMode, 'inquiry_submit_failed', next.state);
    if (next.state === 'rate_limit' && next.retryAfter) setRetryAt(Date.now() + next.retryAfter * 1000);
    if (next.state === 'invalid') {
      if(next.fields.includes('files')){setStep('materials');setFileError('The files could not be accepted. Check their format and size, then try again.');return;}
      if(next.fields.includes('mold_type')){setStep('materials');setFileError('Choose a mold type and try again.');return;}
      const allowed = new Set([...copy.groups.flatMap(group => group.fields.map(field => field.key)), 'country_other', 'mold_sets_other', 'currency_other', 'processing']);
      const mapped = Object.fromEntries(next.fields.filter(key => allowed.has(key)).map(key => [key, 'Please check this field and try again.']));
      setErrors(mapped);
      focusError();
    }
  }
  function reset() {
    started.current = false;
    sourceSnapshot.current = null;
    setValues(initialValues());setFiles([]);setStep('materials');setMaterialRoute('drawings');setFileError('');setErrors({}); setResult({ state: 'idle' }); setCopyStatus(''); setRetryAt(0); setSession(previous => previous + 1);
  }
  function chooseRoute(route){
    setMaterialRoute(route);setFiles([]);setFileError('');
    update('drawing_status',route==='sample'?'A physical sample':route==='concept'?'Not sure yet':'Clear 2D part drawings');
  }
  function chooseFiles(incoming){
    const selected=Array.from(incoming||[]);
    const checked=checkInquiryFiles(selected,materialRoute==='drawings'?'Clear 2D part drawings':materialRoute==='sample'?'A physical sample':'Photos / concept only');
    if(checked.error){setFileError(`Choose up to ${MAX_FILES} supported files, each under ${Math.round(MAX_FILE_BYTES/1048576)} MB and ${Math.round(MAX_TOTAL_BYTES/1048576)} MB total.`);return;}
    setFiles(selected);setFileError('');
    if(materialRoute==='drawings')update('drawing_status',drawingStatusFor(selected));
    else if(materialRoute==='concept')update('drawing_status',selected.length?'Photos / concept only':'Not sure yet');
  }
  function drawingStatusFor(selected){
    const kinds=new Set(selected.map(file=>['pdf','dwg','dxf'].includes(fileExtension(file.name))?'2d':'3d'));
    return kinds.size===2?'Both 2D and 3D part drawings':kinds.has('3d')?'3D part model / drawings':'Clear 2D part drawings';
  }
  function continueToDetails(){
    const checked=checkInquiryFiles(files,values.drawing_status);
    if(checked.error){setFileError(materialRoute==='drawings'?'Add a product drawing, or choose another route.':'Check the selected files and try again.');return;}
    setFileError('');setStep('details');requestAnimationFrame(()=>formRef.current?.scrollIntoView({block:'start'}));
  }
  async function copyReference() {
    try { await navigator.clipboard.writeText(result.reference); setCopyStatus(states.reference_copied); }
    catch { setCopyStatus(states.reference_copy_failed); }
  }

  function renderField(field) {
    const key = field.key;
    if (['budget_min', 'budget_max', 'currency'].includes(key) && values.budget_status !== 'I have an estimated budget') return null;
    const options = field.type === 'country_select' ? countries : key === 'mold_sets' ? moldQuantities : key === 'currency' ? currencies : field.options;
    const props = { id: key, name: key, value: values[key] ?? '', onChange: event => update(key, event.target.value), required: field.required, 'aria-invalid': !!errors[key], 'aria-describedby': [field.helper ? `${key}-helper` : null, errors[key] ? `${key}-error` : null].filter(Boolean).join(' ') || undefined, disabled: busy };
    const extra = (key === 'country' && values.country === 'Other country / region') || (key === 'mold_sets' && values.mold_sets === 'More than 5') || (key === 'currency' && values.currency === 'Other currency');
    return <React.Fragment key={key}>
      <div className={`field ${['website', 'description', 'requirements'].includes(key) ? 'full' : ''}`}>
        <label htmlFor={key}>{field.label}{field.required ? <span className="required"> *</span> : <span className="optional"> (optional)</span>}</label>
        {options ? <select {...props}><option value="">Please select</option>{options.map(option => <option key={option}>{option}</option>)}</select> : field.type === 'textarea' ? <textarea {...props} rows={key === 'description' ? 4 : 2} maxLength={4000} placeholder={field.placeholder} /> : <input {...props} type={field.type === 'decimal' ? 'number' : ['email', 'tel', 'url'].includes(field.type) ? field.type : 'text'} min={field.type === 'decimal' ? '0.01' : undefined} step={field.type === 'decimal' ? 'any' : undefined} maxLength={field.type === 'decimal' ? undefined : 240} autoComplete={{ name: 'name', company: 'organization', email: 'email', phone: 'tel', city: 'address-level2', website: 'url' }[key]} placeholder={field.placeholder} />}
        {field.helper && <p className="field-help" id={`${key}-helper`}>{field.helper}</p>}
        {errors[key] && <p className="field-error" id={`${key}-error`}>{errors[key]}</p>}
      </div>
      {extra && <div className="field"><label htmlFor={`${key}_other`}>{key === 'country' ? 'Your country / region' : key === 'currency' ? 'Currency code' : 'Exact number of mold sets'}<span className="required"> *</span></label><input id={`${key}_other`} name={`${key}_other`} value={values[`${key}_other`] ?? ''} onChange={event => update(`${key}_other`, event.target.value)} required disabled={busy} aria-invalid={!!errors[`${key}_other`]} aria-describedby={errors[`${key}_other`] ? `${key}_other-error` : undefined} type={key === 'mold_sets' ? 'number' : 'text'} min={key === 'mold_sets' ? 6 : undefined} step={key === 'mold_sets' ? 1 : undefined} maxLength={240} />{errors[`${key}_other`] && <p className="field-error" id={`${key}_other-error`}>{errors[`${key}_other`]}</p>}</div>}
    </React.Fragment>;
  }

  if (confirmed || result.state === 'review_complete') {
    const whatsapp = confirmed ? whatsappHref(whatsappNumber, result.reference) : null;
    return <section className="section confirmation"><div className="container confirmation-inner"><CheckCircle size={54} weight="light" aria-hidden="true" /><p className="eyebrow">{confirmed ? 'INQUIRY RECEIVED' : 'DESIGN PREVIEW'}</p><h1 ref={headingRef} tabIndex={-1}>{confirmed ? 'Your Inquiry Has Been Received.' : <>Your Inquiry Preview<br />Is Complete.</>}</h1>
      {confirmed ? <><p>{states[result.state].replace('{LEAD_ID}', result.reference)}</p><p>We will review your information and follow up about your project.</p><p><a className="inline-link" href="/account/login/">View or manage your inquiries</a> using the same email address.</p><button type="button" className="button" onClick={copyReference}>{states.reference_copy}</button><p role="status">{copyStatus}</p>{whatsapp ? <a className="button primary" href={whatsapp} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Continue on WhatsApp<ArrowRight size={21} aria-hidden="true" /></a> : <p>{states.whatsapp_unavailable}</p>}</> : <p>No inquiry has been saved or sent. On the live website, a successful submission will give you a reference and the option to continue on WhatsApp.</p>}
      <p>We can follow up by email about your inquiry even if you do not continue on WhatsApp.</p><button type="button" className="button primary" onClick={confirmed ? reset : () => setResult({ state: 'idle' })}>{confirmed ? 'Start Another Inquiry' : 'Return to the Form'}</button><TextLink href={TOOL}>Review the Mold Process</TextLink>
    </div></section>;
  }
  const statusMessage = result.state === 'unavailable' ? 'Online submission is not available yet. Your inquiry has not been sent.' : result.state === 'invalid' ? states.validation_summary : states[result.state];
  const manualContact = !reviewMode && !configured ? whatsappContactHref(whatsappNumber) : null;
  return <><section className="inquiry-hero"><div className="container"><Link href={TOOL} className="back-link"><ArrowLeft size={17} aria-hidden="true" />Mold Tooling</Link><p className="eyebrow">START A MOLD INQUIRY</p><h1>{heading||'Request a Custom Mold Quote'}</h1><p>{intro||'Upload clear 2D or 3D product drawings, or start with a physical sample. No sign in required.'}</p></div></section>
    <section className="section inquiry-section"><div className="container inquiry-layout" data-step={step}><form ref={formRef} onSubmit={submit} noValidate aria-label="Mold inquiry form" aria-busy={busy}>
      {reviewMode ? <p className="preview-note">Design preview · No information is sent.{demo && <> Preview scenario: {demo}.</>}</p> : !configured && <p className="preview-note" role="status">Online submission is not available yet. Your inquiry has not been sent.{manualContact && <> <a className="inline-link" href={manualContact} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Contact us on WhatsApp about your mold project.</a></>}</p>}
      {failureStates.includes(result.state) && <div className="error-summary" role="alert">{reviewMode && 'Design preview scenario · No information was sent. '}{statusMessage}{waitSeconds > 0 && <p>Try again in {waitSeconds} seconds.</p>}</div>}
      <div className="rfq-honeypot" aria-hidden="true"><label>Leave this field empty<input name="website_check" value={values.website_check||''} onChange={event=>update('website_check',event.target.value)} autoComplete="off" tabIndex={-1}/></label></div>
      <nav className="rfq-steps" aria-label="Inquiry steps"><span aria-current={step==='materials'?'step':undefined}>01 &nbsp; Drawings or sample</span><span aria-current={step==='details'?'step':undefined}>02 &nbsp; Project &amp; contact</span></nav>
      {step==='materials' ? <div className="rfq-material-step" data-route={materialRoute}><div className="rfq-mold-picker" role="group" aria-label="Mold type"><p>Choose your mold type</p><div>{moldTypes.map((type,index)=><button key={type} type="button" aria-pressed={values.mold_type===type} onClick={()=>update('mold_type',type)} disabled={busy}><strong>{type}</strong><small>{index===0?'Our main tooling service':'Project review available'}</small></button>)}</div></div>
        <h2>{materialRoute==='drawings'?'Start with your product drawings':materialRoute==='sample'?'Start with your physical sample':'Tell us about your project'}</h2><p>Clear product drawings or a physical sample help us review your mold request.</p>
        <div className="rfq-route-options" role="group" aria-label="Available project information">
          <button type="button" aria-pressed={materialRoute==='drawings'} onClick={()=>chooseRoute('drawings')} disabled={busy}><strong>Upload 2D or 3D drawings</strong><small>Best route for a mold quotation</small></button>
          <button type="button" aria-pressed={materialRoute==='sample'} onClick={()=>chooseRoute('sample')} disabled={busy}><strong>I have a physical sample</strong><small>We will discuss how to send it</small></button>
        </div>
        {materialRoute!=='sample' ? <div className="rfq-upload" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();chooseFiles(event.dataTransfer.files);}}><label htmlFor="inquiry-files"><UploadSimple size={36} weight="light" aria-hidden="true"/><strong>{materialRoute==='drawings'?'Upload your product drawings':'Add reference photos (optional)'}</strong><span>Drag files here or choose from your device</span><span className="button primary">{materialRoute==='drawings'?'Choose drawing files':'Choose photos'}</span></label><input id="inquiry-files" name="files" type="file" multiple accept={materialRoute==='drawings'?'.pdf,.dwg,.dxf,.step,.stp,.igs,.iges,.x_t,.sat,.sldprt,.prt':'.jpg,.jpeg,.png,.webp'} onChange={event=>chooseFiles(event.target.files)} disabled={busy}/>{materialRoute==='drawings'?<><p className="rfq-file-format">3D preferred: <strong>STEP / STP</strong> · 2D: PDF / DWG / DXF</p><details className="rfq-format-details"><summary>Other accepted formats and file limits</summary><p>Also accepted: IGS, IGES, X_T, SAT, SLDPRT, PRT. Up to 5 files, 20 MB each, 25 MB total.</p></details></>:<p className="rfq-file-format">JPG, PNG or WEBP · Up to 5 photos, 20 MB each, 25 MB total.</p>}</div> : <div className="rfq-sample-panel"><strong>A physical sample is a good starting point.</strong><p>Tell us about the part in the next step. We will discuss shipping details before you send anything.</p></div>}
        <button type="button" className="rfq-concept-link" aria-pressed={materialRoute==='concept'} onClick={()=>chooseRoute('concept')} disabled={busy}>{materialRoute==='concept'?'No drawings yet · preliminary discussion selected':'No drawings or sample? Start a preliminary discussion'}</button>
        {files.length>0 && <ul className="rfq-file-list" aria-label="Selected files">{files.map((file,index)=><li key={`${file.name}-${index}`}><span>{file.name} · {formatFileSize(file.size)}</span><button type="button" onClick={()=>{const next=files.filter((_,i)=>i!==index);setFiles(next);if(materialRoute==='drawings'){update('drawing_status',drawingStatusFor(next));if(next.length===0)setFileError('Add a product drawing, or choose another route.');}else if(materialRoute==='concept')update('drawing_status',next.length?'Photos / concept only':'Not sure yet');}} disabled={busy}>Remove</button></li>)}</ul>}
        {fileError&&<p className="field-error" role="alert">{fileError}</p>}
        <p className="rfq-material-note">Photos alone can start a discussion; a formal quotation needs clear product drawings or a physical sample.</p>
        <button type="button" className="button primary rfq-next" onClick={continueToDetails}>Continue to project details<ArrowRight size={21} aria-hidden="true" /></button>
      </div> : <>
      <button type="button" className="rfq-back" onClick={()=>setStep('materials')} disabled={busy}><ArrowLeft size={17} aria-hidden="true" />Edit drawings or sample</button>
      <p className="rfq-material-summary"><strong>{values.mold_type}</strong> · {materialRoute==='drawings'?`${files.length} drawing file${files.length===1?'':'s'} selected`:materialRoute==='sample'?'Physical sample · shipping details to be discussed':files.length?`${files.length} reference photo${files.length===1?'':'s'} selected`:'Early project discussion · no drawings yet'}</p>
      <p className="required-note">No sign in is required. Fields marked <span className="required">*</span> are required.</p>
      {Object.values(errors).some(Boolean) && <div className="error-summary" role="alert">{states.validation_summary}</div>}
      {[copy.groups[1],copy.groups[0],copy.groups[2]].map((group,index) => <fieldset key={group.heading}><legend><span>{String(index + 1).padStart(2, '0')}</span>{group.heading.replace(/^\d\. /, '')}</legend><div className="field-grid">{group.fields.filter(field=>field.key!=='drawing_status').map(renderField)}</div></fieldset>)}
      <p className="drawing-note">{materialRoute==='drawings'?copy.drawing_note:materialRoute==='sample'?'We will discuss how to send your physical sample after reviewing your project details.':'This starts an early discussion. Clear product drawings or a physical sample will be needed before a formal quotation.'} <Link href="/project-information" className="inline-link" target="_blank" rel="noopener">Project information and sample arrangements</Link></p>
      <div className="inquiry-permissions"><p>{copy.notice.replace('Please see our Privacy Policy for how we handle your information.', '')} <Link href="/privacy" className="inline-link" target="_blank" rel="noopener">Privacy Policy</Link></p>
        <label className="check-row"><input id="processing" name="processing" disabled={busy} type="checkbox" checked={values.processing} onChange={event => update('processing', event.target.checked)} required aria-invalid={!!errors.processing} aria-describedby={errors.processing ? 'processing-error' : undefined} /><span>{copy.processing_checkbox.label}<span className="required"> *</span></span></label>{errors.processing && <p id="processing-error" className="field-error">{errors.processing}</p>}
        <label className="check-row"><input id="whatsapp" name="whatsapp" disabled={busy} type="checkbox" checked={values.whatsapp} onChange={event => update('whatsapp', event.target.checked)} /><span>{copy.whatsapp_checkbox.label}<small>{copy.whatsapp_checkbox.helper}</small></span></label>
      </div>
      <button className={'button primary submit' + (unavailable ? ' is-unavailable' : '')} type="submit" disabled={busy || unavailable || waitSeconds > 0}>{busy ? reviewMode ? 'Previewing your inquiry…' : states.submitting : unavailable ? 'Online submission unavailable' : copy.submit}{!busy && !unavailable && <ArrowRight size={21} aria-hidden="true" />}</button>
      <p className="submit-note" role="status">{reviewMode ? busy ? 'Preparing the design preview. Your details are not being sent.' : 'This preview demonstrates the form only. No real inquiry is submitted.' : busy ? states.submitting : 'Your inquiry is received only after the server confirms a reference.'}</p>
      </>}
    </form><section className="rfq-after-submit" aria-labelledby="rfq-after-heading"><p className="eyebrow">AFTER SUBMISSION</p><h2 id="rfq-after-heading">What happens next</h2><ol>{['We save your inquiry and any uploaded files.', 'We review your project and available drawings or sample.', 'We contact you by email, or WhatsApp if you choose.'].map((item,index)=><li key={item}><span>{String(index+1).padStart(2,'0')}</span><p>{item}</p></li>)}</ol><p>Quotation is prepared after we review your project information.</p></section></div></section>
  </>;
}

export default Inquiry;

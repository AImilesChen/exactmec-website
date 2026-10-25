import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle } from '@phosphor-icons/react';
import copy from '../data/inquiry-copy.json';
import states from '../data/form-states.json';
import { Link } from '../Navigation.jsx';
import { Media } from '../Media.jsx';
import { buildInquiryPayload, countries, currencies, initialValues, moldQuantities, notifyInquiryEvent, validateInquiry, whatsappContactHref, whatsappHref } from './model.mjs';
import { createInquiryClient, sameOriginEndpoint } from './client.mjs';

const TOOL = '/aluminum-die-casting-molds/';
const failureStates = ['failed', 'pending', 'rate_limit', 'invalid', 'unavailable'];

function TextLink({ href, children }) {
  return <Link href={href} className="text-link">{children}<ArrowRight size={21} aria-hidden="true" /></Link>;
}

export function Inquiry({ reviewMode = true, submitEnabled = false, endpoint = '/api/inquiries', whatsappNumber = '', onEvent = () => {}, initialData }) {
  const demo = reviewMode && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('demo') : null;
  const [values, setValues] = useState(() => ({...initialValues(),...initialData}));
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
  const configured = !reviewMode && submitEnabled === true && !!sameOriginEndpoint(endpoint);
  const client = useMemo(() => createInquiryClient({ endpoint, submitEnabled: !reviewMode && submitEnabled === true }), [endpoint, submitEnabled, reviewMode, session]);
  const busy = result.state === 'submitting';
  const confirmed = ['saved', 'duplicate'].includes(result.state);
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues());

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
    setErrors(found);
    if (Object.keys(found).length) { notifyInquiryEvent(onEvent, reviewMode, 'inquiry_submit_failed', 'invalid'); focusError(); return; }
    if (!reviewMode && !configured) { setResult({ state: 'unavailable' }); return; }
    if (reviewMode) {
      setResult({ state: ['failed', 'pending', 'rate_limit'].includes(demo) ? demo : 'review_complete' });
      return;
    }
    submitting.current = true;
    setResult({ state: 'submitting' });
    const next = await client.submit(buildInquiryPayload(values));
    submitting.current = false;
    if (!mounted.current) return;
    setResult(next);
    if (['saved', 'duplicate'].includes(next.state)) notifyInquiryEvent(onEvent, reviewMode, 'inquiry_submit_success', next.state);
    else notifyInquiryEvent(onEvent, reviewMode, 'inquiry_submit_failed', next.state);
    if (next.state === 'rate_limit' && next.retryAfter) setRetryAt(Date.now() + next.retryAfter * 1000);
    if (next.state === 'invalid') {
      const allowed = new Set([...copy.groups.flatMap(group => group.fields.map(field => field.key)), 'country_other', 'mold_sets_other', 'currency_other', 'processing']);
      const mapped = Object.fromEntries(next.fields.filter(key => allowed.has(key)).map(key => [key, 'Please check this field and try again.']));
      setErrors(mapped);
      focusError();
    }
  }
  function reset() {
    started.current = false;
    setValues(initialValues()); setErrors({}); setResult({ state: 'idle' }); setCopyStatus(''); setRetryAt(0); setSession(previous => previous + 1);
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
      {confirmed ? <><p>{states[result.state].replace('{LEAD_ID}', result.reference)}</p><p>We will review your information and follow up about your project.</p><button type="button" className="button" onClick={copyReference}>{states.reference_copy}</button><p role="status">{copyStatus}</p>{whatsapp ? <a className="button primary" href={whatsapp} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Continue on WhatsApp<ArrowRight size={21} aria-hidden="true" /></a> : <p>{states.whatsapp_unavailable}</p>}</> : <p>No inquiry has been saved or sent. On the live website, a successful submission will give you a reference and the option to continue on WhatsApp.</p>}
      <p>We can follow up by email about your inquiry even if you do not continue on WhatsApp.</p><button type="button" className="button primary" onClick={confirmed ? reset : () => setResult({ state: 'idle' })}>{confirmed ? 'Start Another Inquiry' : 'Return to the Form'}</button><TextLink href={TOOL}>Review the Mold Process</TextLink>
    </div></section>;
  }
  const statusMessage = result.state === 'unavailable' ? 'Online submission is not available yet. Your inquiry has not been sent.' : result.state === 'invalid' ? states.validation_summary : states[result.state];
  const manualContact = !reviewMode && !configured ? whatsappContactHref(whatsappNumber) : null;
  return <><section className="inquiry-hero"><div className="container"><Link href={TOOL} className="back-link"><ArrowLeft size={17} aria-hidden="true" />Mold Tooling</Link><p className="eyebrow">START A MOLD INQUIRY</p><h1>Tell Us About Your Mold Project</h1><p>One mold set accepted. Budget and purchase timing are optional.</p></div></section>
    <section className="section inquiry-section"><div className="container inquiry-layout"><form ref={formRef} onSubmit={submit} noValidate aria-label="Mold inquiry form" aria-busy={busy}>
      {reviewMode ? <p className="preview-note">Design preview · No information is sent.{demo && <> Preview scenario: {demo}.</>}</p> : !configured && <p className="preview-note" role="status">Online submission is not available yet. Your inquiry has not been sent.{manualContact && <> <a className="inline-link" href={manualContact} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Contact us on WhatsApp about your mold project.</a></>}</p>}
      {failureStates.includes(result.state) && <div className="error-summary" role="alert">{reviewMode && 'Design preview scenario · No information was sent. '}{statusMessage}{waitSeconds > 0 && <p>Try again in {waitSeconds} seconds.</p>}</div>}
      <div className="rfq-honeypot" aria-hidden="true"><label>Leave this field empty<input name="website_check" value={values.website_check||''} onChange={event=>update('website_check',event.target.value)} autoComplete="off" tabIndex={-1}/></label></div>
      <p className="required-note">Fields marked <span className="required">*</span> are required.</p>
      {Object.values(errors).some(Boolean) && <div className="error-summary" role="alert">{states.validation_summary}</div>}
      {copy.groups.map((group, index) => <fieldset key={group.heading}><legend><span>{String(index + 1).padStart(2, '0')}</span>{group.heading.replace(/^\d\. /, '')}</legend><div className="field-grid">{group.fields.map(renderField)}</div></fieldset>)}
      <p className="drawing-note">{copy.drawing_note} <Link href="/project-information" className="inline-link" target="_blank" rel="noopener">Project information and sample arrangements</Link></p>
      <div className="inquiry-permissions"><p>{copy.notice.replace('Please see our Privacy Policy for how we handle your information.', '')} <Link href="/privacy" className="inline-link" target="_blank" rel="noopener">Privacy Policy</Link></p>
        <label className="check-row"><input id="processing" name="processing" disabled={busy} type="checkbox" checked={values.processing} onChange={event => update('processing', event.target.checked)} required aria-invalid={!!errors.processing} aria-describedby={errors.processing ? 'processing-error' : undefined} /><span>{copy.processing_checkbox.label}<span className="required"> *</span></span></label>{errors.processing && <p id="processing-error" className="field-error">{errors.processing}</p>}
        <label className="check-row"><input id="whatsapp" name="whatsapp" disabled={busy} type="checkbox" checked={values.whatsapp} onChange={event => update('whatsapp', event.target.checked)} /><span>{copy.whatsapp_checkbox.label}<small>{copy.whatsapp_checkbox.helper}</small></span></label>
      </div>
      <button className="button primary submit" type="submit" disabled={busy || (!reviewMode && !configured) || waitSeconds > 0}>{busy ? reviewMode ? 'Previewing your inquiry…' : states.submitting : copy.submit}{!busy && <ArrowRight size={21} aria-hidden="true" />}</button>
      <p className="submit-note" role="status">{reviewMode ? busy ? 'Preparing the design preview. Your details are not being sent.' : 'This preview demonstrates the form only. No real inquiry is submitted.' : busy ? states.submitting : 'Your inquiry is received only after the server confirms a reference.'}</p>
    </form><aside className="inquiry-aside"><div><p className="eyebrow">THE NEXT STEP</p><h2>What Happens After You Submit</h2><p className="field-help">After a confirmed submission:</p><ol>{['Your inquiry is saved.', 'We review your project details.', 'We follow up by email, or WhatsApp if you choose.'].map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol><Media file="mold-cavity-detail-v3" alt="Illustrative steel mold detail" caption="Illustrative example" /><hr /><h3>Drawings or a Sample?</h3><p>Keep your clear product drawings or physical sample available. We arrange the next information exchange during follow-up.</p><TextLink href="/resources/die-casting-mold-quotation-requirements/">Quotation Requirements</TextLink></div></aside></div></section>
  </>;
}

export default Inquiry;

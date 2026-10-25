// Only allowlisted inquiry data leaves this module. No persistence or analytics transport.
import noticeVersions from '../data/notice-versions.json' with {type:'json'};
export const requiredFields = ['name', 'company', 'email', 'phone', 'country', 'city', 'component', 'description', 'drawing_status', 'mold_sets'];
export const countries = ['United Arab Emirates', 'Saudi Arabia', 'Malaysia', 'Singapore', 'Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'India', 'Oman', 'Qatar', 'Kuwait', 'Bahrain', 'United States', 'Germany', 'United Kingdom', 'China', 'Other country / region'];
export const currencies = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'SGD', 'MYR', 'CNY', 'Other currency'];
export const moldQuantities = ['1', '2', '3', '4', '5', 'More than 5', 'Not sure'];
export const initialValues = () => ({ mold_sets: '1', budget_status: 'Please advise / not decided', processing: false, whatsapp: false });
const text = value => typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const has = value => text(value) !== '';
const positiveAmount = value => /^\d+(?:\.\d+)?$/.test(text(value)) && Number.isFinite(Number(value)) && Number(value) > 0;

export function validateInquiry(values, groups = []) {
  const errors = {};
  for (const key of requiredFields) if (!has(values[key])) errors[key] = 'Please complete this field.';
  for (const key of ['name', 'company', 'email', 'phone', 'country', 'city', 'website', 'component', 'country_other', 'currency_other']) {
    if (text(values[key]).length > 240) errors[key] = 'Use 240 characters or fewer.';
  }
  for (const key of ['description', 'requirements']) if (text(values[key]).length > 4000) errors[key] = 'Use 4,000 characters or fewer.';
  if (has(values.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(values.email))) errors.email = 'Enter an email address we can reply to.';
  if (has(values.phone) && (!/^\+[\d\s().-]+$/.test(text(values.phone)) || !/^\d{6,15}$/.test(text(values.phone).replace(/\D/g, '')))) errors.phone = 'Include your country code and a valid contact number.';
  if (has(values.website)) {
    try { const url = new URL(text(values.website)); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); }
    catch { errors.website = 'Enter a complete website address, such as https://example.com, or leave this optional field blank.'; }
  }
  if (has(values.country) && !countries.includes(values.country)) errors.country = 'Select your country or region.';
  if (values.country === 'Other country / region' && !has(values.country_other)) errors.country_other = 'Enter your country or region.';
  if (has(values.mold_sets) && !moldQuantities.includes(text(values.mold_sets))) errors.mold_sets = 'Enter a whole number of 1 or more, or select Not sure.';
  if (values.mold_sets === 'More than 5' && (!/^\d+$/.test(text(values.mold_sets_other)) || !Number.isSafeInteger(Number(values.mold_sets_other)) || Number(values.mold_sets_other) < 6)) errors.mold_sets_other = 'Enter a whole number of 6 or more.';
  for (const field of groups.flatMap(group => group.fields)) {
    if (field.options && has(values[field.key]) && !field.options.includes(values[field.key])) errors[field.key] = 'Choose one of the listed options.';
  }
  if (values.budget_status === 'I have an estimated budget') {
    for (const key of ['budget_min', 'budget_max']) if (has(values[key]) && !positiveAmount(values[key])) errors[key] = 'Enter a positive amount and select its currency, or leave the budget blank.';
    if (positiveAmount(values.budget_min) && positiveAmount(values.budget_max) && Number(values.budget_max) < Number(values.budget_min)) errors.budget_max = 'The upper budget amount must be equal to or greater than the lower amount.';
    if ((has(values.budget_min) || has(values.budget_max)) && !currencies.includes(values.currency)) errors.currency = 'Select the budget currency.';
    if (values.currency === 'Other currency' && !/^[A-Za-z]{3}$/.test(text(values.currency_other))) errors.currency_other = 'Enter a three-letter currency code.';
  }
  if (values.processing !== true) errors.processing = 'Please review the inquiry information notice and confirm your choice before submitting.';
  return errors;
}

export function buildInquiryPayload(values) {
  const payload = {};
  for (const key of ['name', 'company', 'email', 'phone', 'city', 'website', 'component', 'description', 'drawing_status', 'industry', 'requirements', 'purchase_timing', 'budget_status']) payload[key] = text(values[key]) || null;
  payload.country = values.country === 'Other country / region' ? text(values.country_other) : text(values.country);
  payload.mold_sets = values.mold_sets === 'Not sure' ? null : Number(values.mold_sets === 'More than 5' ? values.mold_sets_other : values.mold_sets);
  payload.mold_sets_unsure = values.mold_sets === 'Not sure';
  const budgetEntered = values.budget_status === 'I have an estimated budget' && (has(values.budget_min) || has(values.budget_max));
  payload.budget_min = budgetEntered && has(values.budget_min) ? Number(values.budget_min) : null;
  payload.budget_max = budgetEntered && has(values.budget_max) ? Number(values.budget_max) : null;
  payload.currency = budgetEntered ? (values.currency === 'Other currency' ? text(values.currency_other).toUpperCase() : text(values.currency)) : null;
  payload.budget_basis = 'per_mold_set';
  payload.processing_choice = values.processing === true;
  payload.whatsapp_messages_opt_in = values.whatsapp === true;
  payload.calls_opt_in = false;
  // These identify the exact local copy, not legal approval or a server receipt time.
  Object.assign(payload,noticeVersions);
  if(text(values.website_check))payload.website_check=text(values.website_check);
  return payload;
}

export const isReference = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(value);

export function whatsappContactHref(number) {
  return typeof number === 'string' && /^\+?[1-9]\d{6,14}$/.test(number) ? `https://wa.me/${number.replace(/^\+/, '')}` : null;
}

export function whatsappHref(number, reference) {
  const contact = whatsappContactHref(number);
  if (!contact || !isReference(reference)) return null;
  const message = `Hello ExactMec, I would like to discuss my mold inquiry. Reference: ${reference}.`;
  return `${contact}?text=${encodeURIComponent(message)}`;
}

// The host may route these anonymous events to its configured adapter. Input values,
// references, validation fields, and raw errors never enter this callback.
export function notifyInquiryEvent(onEvent, reviewMode, name, status) {
  if (reviewMode || typeof onEvent !== 'function') return false;
  let payload;
  if (['inquiry_started', 'inquiry_submit_attempt'].includes(name)) payload = {};
  else if (name === 'inquiry_submit_success' && ['saved', 'duplicate'].includes(status)) payload = { status };
  else if (name === 'inquiry_submit_failed' && ['failed', 'pending', 'rate_limit', 'invalid'].includes(status)) payload = { status };
  else return false;
  try { onEvent(name, payload); return true; }
  catch { return false; } // An optional analytics callback must never break an inquiry.
}

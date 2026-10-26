import { normalizeInquirySource } from '../src/source/inquiry-source.mjs';

export const reviewOptions = {
  status: ['New', 'Reviewing', 'Need More Information', 'Contacted', 'Quotation Sent', 'Won', 'Lost', 'Spam'],
  authenticity: ['Unreviewed', 'Needs Verification', 'Consistent', 'Inconsistent'],
  fit: ['Needs Review', 'Mold Project', 'Out of Scope'],
  readiness: ['Self-reported', 'Awaiting Drawings or Sample', 'Received to Review', 'Ready for Quotation'],
  qualification: ['Unreviewed', 'Need More Information', 'Qualified', 'Not Qualified'],
  priority: ['A', 'B', 'C']
};
export const defaultReview = () => ({ status: 'New', authenticity: 'Unreviewed', fit: 'Needs Review', readiness: 'Self-reported', qualification: 'Unreviewed', priority: 'B', owner: '', next_follow_up: '' });
const drawingOptions = ['Clear 2D part drawings', '3D part model / drawings', 'Both 2D and 3D part drawings', 'A physical sample', 'Photos / concept only', 'Not sure yet'];
const industryOptions = ['Automotive', 'Motorcycle / e-mobility', 'LED lighting', 'Motors / pumps / transmission', 'Electronics / telecommunications', 'Energy / power equipment', 'Industrial automation', 'Power tools / home appliances', 'Other / not sure'];
export const timingOptions = ['As soon as the project is confirmed', 'Within 1–3 months', 'Within 3–6 months', 'More than 6 months from now', 'Early research / timing not decided', 'Prefer not to say'];
export const budgetOptions = ['I have an estimated budget', 'Please advise / not decided', 'Prefer not to say'];
const required = ['name', 'company', 'email', 'phone', 'country', 'city', 'component', 'description', 'drawing_status'];
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const safeString = (value, limit, empty = false) => typeof value === 'string' && (empty || value.trim().length > 0) && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
export const validReference = reference => typeof reference === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(reference);
export const validRevision = value => Number.isSafeInteger(value) && value >= 1;
export const validDate = value => value === '' || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const validNote = value => safeString(value, 4000, true);

export function validateSubmission(input, env, { knownPaths = [], blockedPaths = [] } = {}) {
  const errors = {};
  if (!isObject(input)) return { errors: { name: 'invalid' } };
  const payload = {};
  for (const key of [...required, 'website', 'industry', 'requirements', 'purchase_timing', 'budget_status']) {
    const value = input[key];
    if ((value == null || value === '') && !required.includes(key)) { payload[key] = null; continue; }
    if (!safeString(value, ['description', 'requirements'].includes(key) ? 4000 : 240)) errors[key] = 'invalid';
    else payload[key] = value.trim();
  }
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) errors.email = 'invalid';
  if (payload.phone && (!/^\+[\d\s().-]+$/.test(payload.phone) || !/^\d{6,15}$/.test(payload.phone.replace(/\D/g, '')))) errors.phone = 'invalid';
  if (payload.website) try { const url = new URL(payload.website); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) errors.website = 'invalid'; } catch { errors.website = 'invalid'; }
  if (!drawingOptions.includes(payload.drawing_status)) errors.drawing_status = 'invalid';
  for (const [key, options] of [['industry', industryOptions], ['purchase_timing', timingOptions], ['budget_status', budgetOptions]]) if (payload[key] && !options.includes(payload[key])) errors[key] = 'invalid';
  if (typeof input.mold_sets_unsure !== 'boolean' || !(input.mold_sets_unsure ? input.mold_sets === null : Number.isSafeInteger(input.mold_sets) && input.mold_sets >= 1)) errors.mold_sets = 'invalid';
  payload.mold_sets = input.mold_sets;
  payload.mold_sets_unsure = input.mold_sets_unsure;
  const budgetEntered = input.budget_status === budgetOptions[0];
  for (const key of ['budget_min', 'budget_max']) {
    payload[key] = budgetEntered ? input[key] ?? null : null;
    if (payload[key] !== null && !(typeof payload[key] === 'number' && Number.isFinite(payload[key]) && payload[key] > 0)) errors[key] = 'invalid';
  }
  if (payload.budget_min !== null && payload.budget_max !== null && payload.budget_min > payload.budget_max) errors.budget_max = 'invalid';
  const amount = payload.budget_min !== null || payload.budget_max !== null;
  payload.currency = amount ? input.currency : null;
  if (amount && (typeof payload.currency !== 'string' || !/^[A-Z]{3}$/.test(payload.currency))) errors.currency = 'invalid';
  payload.budget_basis = 'per_mold_set';
  if (input.budget_basis !== 'per_mold_set') errors.budget_status = 'invalid';
  if (input.processing_choice !== true) errors.processing = 'invalid';
  if (typeof input.whatsapp_messages_opt_in !== 'boolean' || input.calls_opt_in !== false) errors.processing = 'invalid';
  const versions = { notice_version: env.NOTICE_VERSION, privacy_version: env.PRIVACY_VERSION, privacy_processing_basis: env.PROCESSING_BASIS, whatsapp_choice_text_version: env.WHATSAPP_NOTICE_VERSION };
  for (const [key, value] of Object.entries(versions)) if (input[key] !== value) errors.processing = 'invalid';
  Object.assign(payload, versions, { processing_choice: input.processing_choice === true, whatsapp_messages_opt_in: input.whatsapp_messages_opt_in === true, calls_opt_in: false });
  payload.source = normalizeInquirySource(input.source, knownPaths, blockedPaths);
  return { payload, errors };
}

export function validateReviewPatch(input, current) {
  if (!isObject(input) || !validRevision(input.revision) || !isObject(input.review) || !validNote(input.note ?? '')) return null;
  const review = { ...current };
  for (const [key, value] of Object.entries(input.review)) {
    if (Object.hasOwn(reviewOptions, key)) { if (!reviewOptions[key].includes(value)) return null; }
    else if (key === 'owner') { if (!safeString(value, 120, true)) return null; }
    else if (key === 'next_follow_up') { if (!validDate(value)) return null; }
    else return null;
    review[key] = value;
  }
  return review;
}

export function searchFilters(input) {
  if (!isObject(input)) return null;
  const result = { search: input.search ?? '', page: input.page ?? 1, pageSize: input.pageSize ?? 25 };
  if (!safeString(result.search, 120, true) || !Number.isSafeInteger(result.page) || result.page < 1 || result.page > 10000 || !Number.isSafeInteger(result.pageSize) || result.pageSize < 1 || result.pageSize > 100) return null;
  const options = { ...reviewOptions, drawing_status: drawingOptions, purchase_timing: timingOptions, budget_status: budgetOptions };
  for (const key of ['status', 'authenticity', 'fit', 'readiness', 'qualification', 'priority', 'drawing_status', 'purchase_timing', 'budget_status']) {
    result[key] = input[key] ?? '';
    if (result[key] !== '' && !(options[key].includes(result[key]) || ['purchase_timing', 'budget_status'].includes(key) && result[key] === '__not_provided__')) return null;
  }
  return result;
}

export function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function hmac(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}

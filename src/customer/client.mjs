const messages = Object.freeze({
  invalid: 'Please check the information and try again.',
  invalid_code: 'That code could not be verified. Check the code or request a new one.',
  expired: 'Your session has ended. Sign in again to view your inquiries.',
  forbidden: 'This action is not available. Refresh your session and try again.',
  csrf: 'Your session needs to be refreshed. Sign in again before making changes.',
  not_found: 'This inquiry is not available in your account.',
  unavailable: 'Customer sign-in is not available yet. You can still submit an inquiry without signing in.',
  rate_limit: 'Please wait before trying again.',
  conflict: 'This inquiry has changed. Reload it before making another update.',
  withdrawn: 'This inquiry has been withdrawn. Reload it to see its current status.',
  supplement_limit: 'This inquiry has reached the limit for added notes. Your information is still available. Continue the project discussion by email or WhatsApp.',
  network: 'The connection failed. The result could not be confirmed. Reload before trying again.',
  timeout: 'The request timed out. The result could not be confirmed. Reload before trying again.',
  invalid_response: 'The result could not be confirmed. Reload before trying again.',
  failed: 'The action could not be confirmed. Reload before trying again.',
  busy: 'Please wait for the current request to finish.',
});
export class CustomerApiError extends Error {
  constructor(kind, status = 0, retryAfter = 0) { super(messages[kind] || messages.failed); this.name = 'CustomerApiError'; this.kind = kind; this.status = status; this.retryAfter = retryAfter; }
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isInquiryReference = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(value);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@<>\u0000-\u001f]+@[^\s@<>\u0000-\u001f]+\.[^\s@<>\u0000-\u001f]+$/.test(value);
const invalid = () => { throw new CustomerApiError('invalid'); };
const statuses = new Set(['received', 'under_review', 'needs_information', 'in_contact', 'quotation_sent', 'closed', 'withdrawn']);
const submittedText = ['name','company','email','phone','country','city','website','component','description','drawing_status','industry','requirements','purchase_timing','budget_status','currency','budget_basis'];

/** Project a customer response again; never expose internal review, notes, sources or admin envelopes. */
export function customerInquiry(input) {
  if (!isObject(input) || !isInquiryReference(input.reference) || !Number.isSafeInteger(input.revision) || input.revision < 1 || !validDate(input.created_at) || !validDate(input.updated_at) || !statuses.has(input.status) || !isObject(input.submitted) || !Array.isArray(input.supplements) || input.supplements.length > 100 || typeof input.withdrawn !== 'boolean' || input.withdrawn_at != null && !validDate(input.withdrawn_at)) throw new CustomerApiError('invalid_response');
  const submitted = {};
  for (const key of submittedText) if (Object.hasOwn(input.submitted, key)) {
    const value = input.submitted[key];
    if (value !== null && (typeof value !== 'string' || value.length > 5000)) throw new CustomerApiError('invalid_response');
    submitted[key] = value;
  }
  for (const key of ['mold_sets', 'budget_min', 'budget_max']) if (Object.hasOwn(input.submitted, key)) {
    const value = input.submitted[key];
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new CustomerApiError('invalid_response');
    submitted[key] = value;
  }
  if (Object.hasOwn(input.submitted, 'mold_sets_unsure')) { if (typeof input.submitted.mold_sets_unsure !== 'boolean') throw new CustomerApiError('invalid_response'); submitted.mold_sets_unsure = input.submitted.mold_sets_unsure; }
  const supplements = input.supplements.map(entry => {
    if (!isObject(entry) || typeof entry.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(entry.id) || typeof entry.note !== 'string' || !entry.note.trim() || entry.note.length > 4000 || !validDate(entry.created_at)) throw new CustomerApiError('invalid_response');
    return { id: entry.id, note: entry.note, created_at: entry.created_at };
  });
  return { reference: input.reference, revision: input.revision, created_at: input.created_at, updated_at: input.updated_at, status: input.status, submitted, supplements, withdrawn: input.withdrawn, withdrawn_at: input.withdrawn_at ?? null };
}

/** Challenge and CSRF credentials exist only in this closure. No persistent drafts or URL parameters. */
export function createCustomerClient({ fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = 15000 } = {}) {
  let csrfToken = null, challenge = null, challengeGeneration = 0, destroyed = false, writing = false;
  const active = new Set();
  async function request(path, { method = 'GET', body, anonymous = false, noContent = false } = {}) {
    if (destroyed || typeof fetchImpl !== 'function') throw new CustomerApiError('unavailable');
    if (method !== 'GET' && !anonymous && !csrfToken) throw new CustomerApiError('csrf');
    const controller = new AbortController(); active.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { Accept: 'application/json' };
      if (method !== 'GET') { headers['Content-Type'] = 'application/json'; if (!anonymous) headers['X-CSRF-Token'] = csrfToken; }
      const response = await fetchImpl(path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (!response.ok) {
        let code = '';
        if (response.headers.get('content-type')?.includes('application/json')) try { const data = await response.json(); code = typeof data?.error === 'string' ? data.error : ''; } catch { /* Keep fixed safe messages. */ }
        const kind = response.status === 503 ? 'unavailable' : response.status === 429 ? 'rate_limit' : response.status === 401 ? 'expired' : response.status === 403 ? (code === 'csrf' || code === 'invalid_csrf' || code === 'csrf_required' ? 'csrf' : 'forbidden') : response.status === 404 ? 'not_found' : response.status === 409 ? (code === 'withdrawn' ? 'withdrawn' : code === 'supplement_limit' ? 'supplement_limit' : 'conflict') : response.status === 400 || response.status === 422 ? (code === 'invalid_code' ? 'invalid_code' : 'invalid') : 'failed';
        if (['expired','csrf'].includes(kind)) csrfToken = null;
        const seconds = Number(response.headers.get('Retry-After'));
        throw new CustomerApiError(kind, response.status, kind === 'rate_limit' ? Number.isFinite(seconds) && seconds > 0 ? Math.min(3600, Math.ceil(seconds)) : 60 : 0);
      }
      if (noContent) { if (response.status !== 204) throw new CustomerApiError('invalid_response'); return { status: response.status, data: null }; }
      if (!response.headers.get('content-type')?.includes('application/json')) throw new CustomerApiError('invalid_response');
      const data = await response.json();
      if (!isObject(data)) throw new CustomerApiError('invalid_response');
      return { status: response.status, data };
    } catch (cause) {
      if (cause instanceof CustomerApiError) throw cause;
      throw new CustomerApiError(controller.signal.aborted ? 'timeout' : cause instanceof SyntaxError ? 'invalid_response' : 'network');
    } finally { clearTimeout(timer); active.delete(controller); }
  }
  async function write(operation) { if (writing) throw new CustomerApiError('busy'); writing = true; try { return await operation(); } finally { writing = false; } }
  function sessionResult(data) {
    if (data.authenticated !== true || typeof data.csrfToken !== 'string' || !data.csrfToken || data.csrfToken.length > 2048 || !validDate(data.expiresAt) || Date.parse(data.expiresAt) <= Date.now()) throw new CustomerApiError('invalid_response');
    if (destroyed) throw new CustomerApiError('unavailable');
    csrfToken = data.csrfToken;
    return { authenticated: true, expiresAt: data.expiresAt };
  }
  const inquiryResult = (input, reference) => { const result = customerInquiry(input); if (result.reference !== reference) throw new CustomerApiError('invalid_response'); return result; };
  const referencePath = reference => { if (!isInquiryReference(reference)) invalid(); return `/api/customer/inquiries/${reference}`; };
  const revision = value => { if (!Number.isSafeInteger(value) || value < 1) invalid(); return value; };
  return Object.freeze({
    async session() { csrfToken = null; const { status, data } = await request('/api/customer/session'); if (status !== 200) throw new CustomerApiError('invalid_response'); return sessionResult(data); },
    async requestCode(email) {
      const value = typeof email === 'string' ? email.trim() : email;
      if (!validEmail(value)) invalid();
      return write(async () => {
        challenge = null; const generation = ++challengeGeneration;
        const { status, data } = await request('/api/customer/auth/request-code', { method: 'POST', anonymous: true, body: { email: value } });
        if (status !== 202 || data.accepted !== true || typeof data.challenge !== 'string' || !/^[A-Za-z0-9_-]{16,512}$/.test(data.challenge)) throw new CustomerApiError('invalid_response');
        if (destroyed) throw new CustomerApiError('unavailable');
        if (generation !== challengeGeneration) throw new CustomerApiError('invalid_code');
        challenge = data.challenge;
        return { accepted: true, retryAfter: 60 };
      });
    },
    async verifyCode(code) {
      if (!challenge || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) invalid();
      const generation = challengeGeneration, activeChallenge = challenge;
      return write(async () => { const { status, data } = await request('/api/customer/auth/verify-code', { method: 'POST', anonymous: true, body: { challenge: activeChallenge, code: code.trim() } }); if (status !== 200) throw new CustomerApiError('invalid_response'); if (generation !== challengeGeneration) throw new CustomerApiError('invalid_code'); const result = sessionResult(data); challenge = null; return result; });
    },
    resetChallenge() { challenge = null; challengeGeneration++; },
    forgetSession() { csrfToken = null; challenge = null; challengeGeneration++; },
    async list() {
      const { status, data } = await request('/api/customer/inquiries');
      if (status !== 200 || !Array.isArray(data.items) || data.items.length > 50 || !Number.isSafeInteger(data.total) || data.total < data.items.length || data.limit !== 50) throw new CustomerApiError('invalid_response');
      return { items: data.items.map(customerInquiry), total: data.total, limit: 50 };
    },
    async get(reference) { const { status, data } = await request(referencePath(reference)); if (status !== 200) throw new CustomerApiError('invalid_response'); return inquiryResult(data.inquiry, reference); },
    async supplement(reference, input) {
      const path = referencePath(reference), currentRevision = revision(input?.revision), note = input?.note;
      if (typeof note !== 'string' || !note.trim() || note.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(note)) invalid();
      return write(async () => { const { status, data } = await request(path + '/supplements', { method: 'POST', body: { revision: currentRevision, note: note.trim() } }); if (status !== 201) throw new CustomerApiError('invalid_response'); return inquiryResult(data.inquiry, reference); });
    },
    async withdraw(reference, input) {
      const path = referencePath(reference), currentRevision = revision(input?.revision);
      return write(async () => { const { status, data } = await request(path + '/withdraw', { method: 'POST', body: { revision: currentRevision } }); if (status !== 200) throw new CustomerApiError('invalid_response'); const inquiry = inquiryResult(data.inquiry, reference); if (!inquiry.withdrawn) throw new CustomerApiError('invalid_response'); return inquiry; });
    },
    async logout() { return write(async () => { await request('/api/customer/logout', { method: 'POST', body: {}, noContent: true }); csrfToken = null; challenge = null; challengeGeneration++; }); },
    destroy() { destroyed = true; csrfToken = null; challenge = null; challengeGeneration++; for (const controller of active) controller.abort(); active.clear(); },
  });
}

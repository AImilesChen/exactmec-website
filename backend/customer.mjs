import { validReference, validRevision } from './domain.mjs';
import { fileExtension, fileKey, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from './inquiry-files.mjs';
import { CUSTOMER_CODE_MINUTES, CUSTOMER_SESSION_SECONDS, customerAuthHash, customerChallengeValid, customerCleanup, customerCookieToken, customerEmailHash, customerGoogleAdminActor, customerIssueCsrf, customerPortalConfiguration, customerRandomCode, customerRandomToken, customerRate, customerReadSession, customerReserveEmail, customerSessionCookie, customerVerifyCsrf } from './customer-auth.mjs';
import { googleEmailAuthoritative, validGoogleClientId, verifyGoogleIdToken } from './google-identity.mjs';

export { customerPortalConfiguration } from './customer-auth.mjs';
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
const fail = (error, status, extra) => json({ error }, status, extra);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const time = () => new Date().toISOString();
const ip = request => request.headers.get('CF-Connecting-IP') || 'unknown';
const normalizeEmail = value => typeof value === 'string' && value.length <= 240 && /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;
const validNote = value => typeof value === 'string' && value.trim().length >= 1 && value.length <= 4000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const customerFileKey = (reference, id) => `inquiries/${reference}/customer/${id}`;
const extraFileLimit = 5;
const isExtraFile = file => file && typeof file !== 'string' && fileExtension(file.name) && Number.isSafeInteger(file.size) && file.size > 0 && file.size <= MAX_FILE_BYTES;

async function body(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return null;
  const reader = request.body?.getReader(); let size = 0; const chunks = [];
  if (!reader) return null;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const value of chunks) { bytes.set(value, offset); offset += value.length; }
  try { const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null; } catch { return null; }
}

async function requestCode(request, input, env, context, config) {
  if (!exactKeys(input, ['email'])) return fail('invalid_request', 400);
  const challenge = customerRandomToken('cc_');
  const accepted = () => json({ accepted: true, challenge }, 202);
  const email = normalizeEmail(input.email);
  const emailHash = await customerEmailHash(env, email || `invalid-${challenge}`);
  const [ipRate, emailRate] = await Promise.all([
    customerRate(env, 'issue-ip', ip(request), { limit: 12, seconds: 900 }),
    customerRate(env, 'issue-email', emailHash, { limit: 3, seconds: 900 }),
  ]);
  if (!ipRate.allowed || !emailRate.allowed || !await customerReserveEmail(env, emailHash)) return accepted();
  const code = customerRandomCode();
  const challengeHash = await customerAuthHash(env, 'customer-challenge', `${config.origin}:${challenge}`);
  const codeHash = await customerAuthHash(env, 'customer-code', `${config.origin}:${challenge}:${code}`);
  const current = Date.now();
  await env.DB.batch([
    stmt(env.DB, 'UPDATE customer_auth_challenges SET consumed_at=? WHERE email_hash=? AND consumed_at IS NULL', current, emailHash),
    stmt(env.DB, 'INSERT INTO customer_auth_challenges(challenge_hash,email_hash,code_hash,eligible,delivery_state,attempts,created_at,expires_at) VALUES(?,?,?,?,\'pending\',0,?,?)', challengeHash, emailHash, codeHash, email ? 1 : 0, current, current + CUSTOMER_CODE_MINUTES * 60000),
  ]);
  if (email) {
    const delivery = Promise.resolve().then(async () => {
      try {
        const result = await context.sendCode({ email, code, expiresMinutes: CUSTOMER_CODE_MINUTES });
        if (result?.accepted !== true) throw new Error('Unconfirmed delivery');
        await stmt(env.DB, "UPDATE customer_auth_challenges SET delivery_state='accepted' WHERE challenge_hash=? AND consumed_at IS NULL", challengeHash).run();
      } catch {
        await stmt(env.DB, "UPDATE customer_auth_challenges SET delivery_state='failed',consumed_at=? WHERE challenge_hash=? AND consumed_at IS NULL", Date.now(), challengeHash).run();
      }
    }).catch(() => {});
    if (typeof context.waitUntil === 'function') context.waitUntil(delivery); else await delivery;
  }
  return accepted();
}

async function verifyCode(request, input, env, config) {
  if (!exactKeys(input, ['challenge', 'code'])) return fail('invalid_code', 400);
  const rate = await customerRate(env, 'verify-ip', ip(request), { limit: 50, seconds: 900 });
  if (!rate.allowed) return fail('rate_limited', 429, { 'Retry-After': String(rate.retryAfter) });
  if (!customerChallengeValid(input.challenge)) return fail('invalid_code', 400);
  const challengeHash = await customerAuthHash(env, 'customer-challenge', `${config.origin}:${input.challenge}`);
  const codeHash = await customerAuthHash(env, 'customer-code', `${config.origin}:${input.challenge}:${typeof input.code === 'string' && /^\d{6}$/.test(input.code) ? input.code : 'invalid'}`);
  const token = customerRandomToken();
  const tokenHash = await customerAuthHash(env, 'customer-session', `${config.origin}:${token}`);
  const mutation = crypto.randomUUID(); const current = Date.now();
  const expiresAt = current + CUSTOMER_SESSION_SECONDS * 1000;
  const oldToken = customerCookieToken(request, config);
  const oldHash = oldToken ? await customerAuthHash(env, 'customer-session', `${config.origin}:${oldToken}`) : null;
  const statements = [
    stmt(env.DB, 'UPDATE customer_auth_challenges SET attempts=attempts+1,consumed_at=CASE WHEN code_hash=? OR attempts+1>=5 THEN ? ELSE NULL END,mutation_id=? WHERE challenge_hash=? AND expires_at>? AND consumed_at IS NULL AND attempts<5 AND delivery_state=\'accepted\' RETURNING challenge_hash', codeHash, current, mutation, challengeHash, current),
    stmt(env.DB, 'INSERT INTO customer_sessions(token_hash,email_hash,created_at,expires_at) SELECT ?,email_hash,?,? FROM customer_auth_challenges WHERE challenge_hash=? AND mutation_id=? AND consumed_at=? AND code_hash=? AND eligible=1 AND delivery_state=\'accepted\' RETURNING token_hash,email_hash,created_at,expires_at', tokenHash, current, expiresAt, challengeHash, mutation, current, codeHash),
  ];
  if (oldHash) statements.push(stmt(env.DB, 'DELETE FROM customer_sessions WHERE token_hash=? AND EXISTS(SELECT 1 FROM customer_sessions WHERE token_hash=?)', oldHash, tokenHash));
  const result = await env.DB.batch(statements);
  const session = result[1]?.results?.[0];
  if (!session) return fail('invalid_code', 400);
  return json({ authenticated: true, csrfToken: await customerIssueCsrf(session, env, config), expiresAt: new Date(session.expires_at).toISOString() }, 200, { 'Set-Cookie': customerSessionCookie(config, token) });
}

async function signInWithGoogle(request, input, env, context, config) {
  if (!validGoogleClientId(env.GOOGLE_CLIENT_ID)) return fail('google_unavailable', 503);
  if (!exactKeys(input, ['credential']) || typeof input.credential !== 'string' || input.credential.length < 100 || input.credential.length > 8192) return fail('invalid_credential', 400);
  const rate = await customerRate(env, 'google-ip', ip(request), { limit: 20, seconds: 900 });
  if (!rate.allowed) return fail('rate_limited', 429, { 'Retry-After': String(rate.retryAfter) });
  let identity;
  try {
    identity = await (context.localSynthetic && context.verifyGoogleIdToken || verifyGoogleIdToken)(input.credential, env.GOOGLE_CLIENT_ID);
  } catch { return fail('invalid_credential', 401); }
  const email = normalizeEmail(identity?.email);
  if (!email || typeof identity?.sub !== 'string' || !/^\d{1,32}$/.test(identity.sub)) return fail('invalid_credential', 401);
  if (!googleEmailAuthoritative(identity, email)) return fail('email_code_required', 403);
  const subjectHash = await customerAuthHash(env, 'google-subject', identity.sub);
  const emailHash = await customerEmailHash(env, email);
  const current = Date.now();
  await stmt(env.DB, 'INSERT OR IGNORE INTO customer_google_identities(subject_hash,email_hash,created_at,last_used_at) VALUES(?,?,?,?)', subjectHash, emailHash, current, current).run();
  const linked = await stmt(env.DB, 'SELECT email_hash FROM customer_google_identities WHERE subject_hash=?', subjectHash).first();
  if (linked?.email_hash !== emailHash) return fail('email_code_required', 403);
  await stmt(env.DB, 'UPDATE customer_google_identities SET last_used_at=? WHERE subject_hash=?', current, subjectHash).run();
  const token = customerRandomToken();
  const tokenHash = await customerAuthHash(env, 'customer-session', `${config.origin}:${token}`);
  const expiresAt = current + CUSTOMER_SESSION_SECONDS * 1000;
  await stmt(env.DB, "INSERT INTO customer_sessions(token_hash,email_hash,auth_provider,google_subject_hash,created_at,expires_at) VALUES(?,?,'google',?,?,?)", tokenHash, emailHash, subjectHash, current, expiresAt).run();
  const oldToken = customerCookieToken(request, config);
  if (oldToken) {
    const oldHash = await customerAuthHash(env, 'customer-session', `${config.origin}:${oldToken}`);
    await stmt(env.DB, 'DELETE FROM customer_sessions WHERE token_hash=?', oldHash).run();
  }
  const session = { token_hash: tokenHash, email_hash: emailHash, auth_provider: 'google', google_subject_hash: subjectHash, expires_at: expiresAt };
  const adminEmail = typeof env.GOOGLE_ADMIN_EMAIL === 'string' ? env.GOOGLE_ADMIN_EMAIL.trim().toLowerCase() : '';
  return json({ authenticated: true, canManage: adminEmail === 'veryhappygou@gmail.com' && email === adminEmail, csrfToken: await customerIssueCsrf(session, env, config), expiresAt: new Date(expiresAt).toISOString() }, 200, { 'Set-Cookie': customerSessionCookie(config, token) });
}

const textFields = ['mold_type', 'name', 'company', 'email', 'phone', 'country', 'city', 'website', 'component', 'description', 'drawing_status', 'industry', 'requirements', 'purchase_timing', 'budget_status', 'currency', 'budget_basis'];
const publicStatus = { New: 'received', Reviewing: 'under_review', 'Need More Information': 'needs_information', Contacted: 'in_contact', 'Quotation Sent': 'quotation_sent', Won: 'closed', Lost: 'closed', Spam: 'closed' };
export const CUSTOMER_SUPPLEMENT_LIMIT = 100;
async function safeInquiry(row, env, emailHash, detail = true) {
  const payload = JSON.parse(row.payload_json); const review = JSON.parse(row.review_json);
  const submitted = Object.fromEntries(textFields.map(key => [key, typeof payload[key] === 'string' ? payload[key] : null]));
  for (const key of ['mold_sets', 'budget_min', 'budget_max']) submitted[key] = typeof payload[key] === 'number' && Number.isFinite(payload[key]) ? payload[key] : null;
  submitted.mold_sets_unsure = payload.mold_sets_unsure === true;
  const files = Array.isArray(payload.files) ? payload.files.slice(0, 5).map((file, index) => ({ index, name: String(file.name || `Drawing ${index + 1}`).slice(0, 150), size: Number(file.size) || 0, extension: String(file.extension || '').slice(0, 10) })) : [];
  const extraFiles = detail ? await stmt(env.DB, 'SELECT id,name,size,extension,created_at FROM customer_inquiry_files WHERE reference=? ORDER BY created_at,id LIMIT ?', row.reference, extraFileLimit).all() : { results: [] };
  const supplements = detail ? await stmt(env.DB, 'SELECT customer_supplements.id,customer_supplements.note,customer_supplements.created_at FROM customer_supplements JOIN leads ON leads.reference=customer_supplements.reference WHERE leads.reference=? AND leads.email_hash=? ORDER BY customer_supplements.created_at,customer_supplements.id LIMIT ?', row.reference, emailHash, CUSTOMER_SUPPLEMENT_LIMIT).all() : { results: [] };
  return { reference: row.reference, created_at: row.created_at, updated_at: row.portal_updated_at || row.updated_at, revision: row.portal_revision || 1, status: row.withdrawn_at ? 'withdrawn' : Object.hasOwn(publicStatus, review.status) ? publicStatus[review.status] : 'received', submitted, files, extra_files: extraFiles.results, supplements: supplements.results, withdrawn: !!row.withdrawn_at, withdrawn_at: row.withdrawn_at || null };
}
const select = 'SELECT leads.reference,leads.payload_json,leads.review_json,leads.created_at,leads.updated_at,customer_inquiry_state.revision AS portal_revision,customer_inquiry_state.updated_at AS portal_updated_at,customer_inquiry_state.withdrawn_at FROM leads LEFT JOIN customer_inquiry_state ON customer_inquiry_state.reference=leads.reference';
const ownedRow = (env, reference, emailHash) => stmt(env.DB, `${select} WHERE leads.reference=? AND leads.email_hash=?`, reference, emailHash).first();

async function mutateInquiry(request, input, env, session, reference, action) {
  if (!exactKeys(input, action === 'supplements' ? ['revision', 'note'] : ['revision']) || !validRevision(input.revision) || action === 'supplements' && !validNote(input.note)) return fail('invalid_request', 422);
  const row = await ownedRow(env, reference, session.email_hash);
  if (!row) return fail('not_found', 404);
  if (row.withdrawn_at) return fail('withdrawn', 409);
  if ((row.portal_revision || 1) !== input.revision) return fail('revision_conflict', 409);
  if (action === 'supplements') {
    const total = await stmt(env.DB, 'SELECT count(*) AS total FROM customer_supplements JOIN leads ON leads.reference=customer_supplements.reference WHERE leads.reference=? AND leads.email_hash=?', reference, session.email_hash).first();
    if (total.total >= CUSTOMER_SUPPLEMENT_LIMIT) return fail('supplement_limit', 409);
  }
  const rate = await customerRate(env, 'inquiry-write', session.email_hash, { limit: 30, seconds: 600 });
  if (!rate.allowed) return fail('rate_limited', 429, { 'Retry-After': String(rate.retryAfter) });
  const mutation = crypto.randomUUID(); const timestamp = time();
  const statements = [
    stmt(env.DB, 'INSERT INTO customer_inquiry_state(reference,revision,updated_at) SELECT reference,1,? FROM leads WHERE reference=? AND email_hash=? ON CONFLICT(reference) DO NOTHING', timestamp, reference, session.email_hash),
    stmt(env.DB, `UPDATE customer_inquiry_state SET revision=revision+1,withdrawn_at=${action === 'withdraw' ? '?' : 'withdrawn_at'},mutation_id=?,updated_at=? WHERE reference=? AND revision=? AND withdrawn_at IS NULL AND EXISTS(SELECT 1 FROM leads WHERE leads.reference=customer_inquiry_state.reference AND leads.email_hash=?)${action === 'supplements' ? ' AND (SELECT count(*) FROM customer_supplements WHERE customer_supplements.reference=customer_inquiry_state.reference)<100' : ''} RETURNING revision`, ...(action === 'withdraw' ? [timestamp] : []), mutation, timestamp, reference, input.revision, session.email_hash),
  ];
  if (action === 'supplements') statements.push(stmt(env.DB, 'INSERT INTO customer_supplements(id,reference,note,created_at) SELECT ?,leads.reference,?,? FROM leads JOIN customer_inquiry_state ON customer_inquiry_state.reference=leads.reference WHERE leads.reference=? AND leads.email_hash=? AND customer_inquiry_state.mutation_id=?', crypto.randomUUID(), input.note.trim(), timestamp, reference, session.email_hash, mutation));
  statements.push(stmt(env.DB, 'INSERT INTO lead_history(id,reference,action,note,actor_hash,created_at) SELECT ?,leads.reference,?,\'\',?,? FROM leads JOIN customer_inquiry_state ON customer_inquiry_state.reference=leads.reference WHERE leads.reference=? AND leads.email_hash=? AND customer_inquiry_state.mutation_id=?', crypto.randomUUID(), action === 'withdraw' ? 'customer_withdrawn' : 'customer_supplement', await customerAuthHash(env, 'customer-actor', session.email_hash), timestamp, reference, session.email_hash, mutation));
  const result = await env.DB.batch(statements);
  if (!result[1]?.results?.length) return fail('revision_conflict', 409);
  const updated = await ownedRow(env, reference, session.email_hash);
  if (!updated) return fail('not_found', 404);
  return json({ inquiry: await safeInquiry(updated, env, session.email_hash) }, action === 'supplements' ? 201 : 200);
}

async function uploadCustomerFile(request, env, session, reference) {
  if (!env.INQUIRY_FILES || !/^multipart\/form-data(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return fail('service_unavailable', 503);
  const form = await request.formData();
  if ([...form.keys()].some(key => !['revision','file'].includes(key)) || form.getAll('revision').length !== 1 || form.getAll('file').length !== 1) return fail('invalid_request', 422);
  const rawRevision = form.get('revision'), file = form.get('file');
  const revision = typeof rawRevision === 'string' && /^[1-9]\d{0,9}$/.test(rawRevision) ? Number(rawRevision) : 0;
  if (!validRevision(revision) || !isExtraFile(file)) return fail('invalid_request', 422);
  const row = await ownedRow(env, reference, session.email_hash);
  if (!row) return fail('not_found', 404);
  if (row.withdrawn_at) return fail('withdrawn', 409);
  if ((row.portal_revision || 1) !== revision) return fail('revision_conflict', 409);
  const count = await stmt(env.DB, 'SELECT count(*) AS count,COALESCE(sum(size),0) AS bytes FROM customer_inquiry_files WHERE reference=?', reference).first();
  if (count.count >= extraFileLimit || count.bytes + file.size > MAX_TOTAL_BYTES) return fail('file_limit', 409);
  const rate = await customerRate(env, 'inquiry-file', session.email_hash, { limit: 10, seconds: 600 });
  if (!rate.allowed) return fail('rate_limited', 429, { 'Retry-After': String(rate.retryAfter) });
  const id = crypto.randomUUID(), mutation = crypto.randomUUID(), timestamp = time(), key = customerFileKey(reference, id);
  await env.INQUIRY_FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { extension: fileExtension(file.name) } });
  let result;
  try {
    result = await env.DB.batch([
      stmt(env.DB, 'INSERT INTO customer_inquiry_state(reference,revision,updated_at) SELECT reference,1,? FROM leads WHERE reference=? AND email_hash=? ON CONFLICT(reference) DO NOTHING', timestamp, reference, session.email_hash),
      stmt(env.DB, 'UPDATE customer_inquiry_state SET revision=revision+1,mutation_id=?,updated_at=? WHERE reference=? AND revision=? AND withdrawn_at IS NULL AND EXISTS(SELECT 1 FROM leads WHERE leads.reference=customer_inquiry_state.reference AND leads.email_hash=?) AND (SELECT count(*) FROM customer_inquiry_files WHERE reference=?)<? AND (SELECT COALESCE(sum(size),0) FROM customer_inquiry_files WHERE reference=?)+?<=? RETURNING revision', mutation, timestamp, reference, revision, session.email_hash, reference, extraFileLimit, reference, file.size, MAX_TOTAL_BYTES),
      stmt(env.DB, 'INSERT INTO customer_inquiry_files(id,reference,name,size,extension,created_at) SELECT ?,leads.reference,?,?,?,? FROM leads JOIN customer_inquiry_state ON customer_inquiry_state.reference=leads.reference WHERE leads.reference=? AND leads.email_hash=? AND customer_inquiry_state.mutation_id=?', id, file.name, file.size, fileExtension(file.name), timestamp, reference, session.email_hash, mutation),
      stmt(env.DB, 'INSERT INTO lead_history(id,reference,action,note,actor_hash,created_at) SELECT ?,leads.reference,\'customer_file_added\',\'\',?,? FROM leads JOIN customer_inquiry_state ON customer_inquiry_state.reference=leads.reference WHERE leads.reference=? AND leads.email_hash=? AND customer_inquiry_state.mutation_id=?', crypto.randomUUID(), await customerAuthHash(env, 'customer-actor', session.email_hash), timestamp, reference, session.email_hash, mutation),
    ]);
  } catch (error) { await env.INQUIRY_FILES.delete(key); throw error; }
  if (!result[1]?.results?.length || !result[2]?.meta?.changes) { await env.INQUIRY_FILES.delete(key); return fail('revision_conflict', 409); }
  const updated = await ownedRow(env, reference, session.email_hash);
  return json({ inquiry: await safeInquiry(updated, env, session.email_hash) }, 201);
}

/** No customer cookie/session logic runs for ordinary public pages or RFQ. */
export async function handleCustomer(request, env = {}, context = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/customer/')) return null;
  try {
    const config = customerPortalConfiguration(env, context);
    if (!config) return fail('portal_unavailable', 503);
    if (url.origin !== config.origin || url.search || url.hash || request.headers.get('Sec-Fetch-Site') === 'cross-site' || request.headers.has('Origin') && request.headers.get('Origin') !== config.origin) return fail('origin_denied', 403);
    if (!['GET', 'POST'].includes(request.method)) return fail('method_not_allowed', 405, { Allow: 'GET, POST' });
    const uploadMatch = /^\/api\/customer\/inquiries\/([A-Za-z0-9_-]+)\/files$/.exec(url.pathname);
    let input;
    if (request.method === 'POST') {
      if (request.headers.get('Origin') !== config.origin) return fail('origin_denied', 403);
      if (!uploadMatch) { input = await body(request); if (!input) return fail('invalid_request', 400); }
    }
    await customerCleanup(env);
    if (url.pathname === '/api/customer/auth/request-code') return request.method === 'POST' ? await requestCode(request, input, env, context, config) : fail('method_not_allowed', 405);
    if (url.pathname === '/api/customer/auth/verify-code') return request.method === 'POST' ? await verifyCode(request, input, env, config) : fail('method_not_allowed', 405);
    if (url.pathname === '/api/customer/auth/google') return request.method === 'POST' ? await signInWithGoogle(request, input, env, context, config) : fail('method_not_allowed', 405);
    const session = await customerReadSession(request, env, config);
    if (!session) return fail('unauthorized', 401);
    if (request.method === 'POST' && !await customerVerifyCsrf(request.headers.get('X-CSRF-Token'), session, env, config)) return fail('csrf_required', 403);
    if (uploadMatch) return request.method === 'POST' && validReference(uploadMatch[1]) ? uploadCustomerFile(request, env, session, uploadMatch[1]) : fail('not_found', 404);
    if (url.pathname === '/api/customer/session') return request.method === 'GET' ? json({ authenticated: true, canManage: !!await customerGoogleAdminActor(request, env, config), csrfToken: await customerIssueCsrf(session, env, config), expiresAt: new Date(session.expires_at).toISOString() }) : fail('method_not_allowed', 405);
    if (url.pathname === '/api/customer/logout') {
      if (request.method !== 'POST') return fail('method_not_allowed', 405);
      if (!exactKeys(input, [])) return fail('invalid_request', 400);
      await stmt(env.DB, 'DELETE FROM customer_sessions WHERE token_hash=?', session.token_hash).run();
      return new Response(null, { status: 204, headers: { ...headers, 'Set-Cookie': customerSessionCookie(config, '', true) } });
    }
    if (url.pathname === '/api/customer/inquiries') {
      if (request.method !== 'GET') return fail('method_not_allowed', 405);
      const rows = await stmt(env.DB, `${select} WHERE leads.email_hash=? ORDER BY leads.created_at DESC,leads.reference LIMIT 50`, session.email_hash).all();
      const total = await stmt(env.DB, 'SELECT count(*) AS total FROM leads WHERE email_hash=?', session.email_hash).first();
      return json({ items: await Promise.all(rows.results.map(row => safeInquiry(row, env, session.email_hash, false))), total: total.total, limit: 50 });
    }
    const fileMatch = /^\/api\/customer\/inquiries\/([A-Za-z0-9_-]+)\/files\/([0-4])$/.exec(url.pathname);
    if (fileMatch) {
      if (request.method !== 'GET' || !validReference(fileMatch[1])) return fail('not_found', 404);
      const row = await ownedRow(env, fileMatch[1], session.email_hash);
      const files = row && JSON.parse(row.payload_json).files;
      const index = Number(fileMatch[2]);
      if (!Array.isArray(files) || !files[index] || !env.INQUIRY_FILES) return fail('not_found', 404);
      const object = await env.INQUIRY_FILES.get(fileKey(fileMatch[1], index));
      if (!object) return fail('not_found', 404);
      const fallback = `drawing-${index + 1}.${files[index].extension}`;
      return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(files[index].name)}`, 'Content-Length': String(object.size), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex,nofollow', 'Referrer-Policy': 'no-referrer' } });
    }
    const extraMatch = /^\/api\/customer\/inquiries\/([A-Za-z0-9_-]+)\/supplemental-files\/([a-f0-9-]{36})$/.exec(url.pathname);
    if (extraMatch) {
      if (request.method !== 'GET' || !validReference(extraMatch[1])) return fail('not_found', 404);
      const file = await stmt(env.DB, 'SELECT customer_inquiry_files.id,customer_inquiry_files.name,customer_inquiry_files.extension FROM customer_inquiry_files JOIN leads ON leads.reference=customer_inquiry_files.reference WHERE customer_inquiry_files.reference=? AND customer_inquiry_files.id=? AND leads.email_hash=?', extraMatch[1], extraMatch[2], session.email_hash).first();
      if (!file || !env.INQUIRY_FILES) return fail('not_found', 404);
      const object = await env.INQUIRY_FILES.get(customerFileKey(extraMatch[1], file.id));
      if (!object) return fail('not_found', 404);
      return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="drawing.${file.extension}"; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'Content-Length': String(object.size), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex,nofollow', 'Referrer-Policy': 'no-referrer' } });
    }
    const match = /^\/api\/customer\/inquiries\/([A-Za-z0-9_-]+)(?:\/(supplements|withdraw))?$/.exec(url.pathname);
    if (!match || !validReference(match[1])) return fail('not_found', 404);
    if (!match[2] && request.method === 'GET') {
      const row = await ownedRow(env, match[1], session.email_hash);
      return row ? json({ inquiry: await safeInquiry(row, env, session.email_hash) }) : fail('not_found', 404);
    }
    if (match[2] && request.method === 'POST') return await mutateInquiry(request, input, env, session, match[1], match[2]);
    return fail('method_not_allowed', 405);
  } catch { return fail('service_unavailable', 503); }
}

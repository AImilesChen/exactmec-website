import { csvCell, defaultReview, hmac, searchFilters, validNote, validReference, validRevision, validateReviewPatch, validateSubmission } from './domain.mjs';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
const error = (code, status) => json({ error: code }, status);
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const strong = value => typeof value === 'string' && value.length >= 32;
const enabled = value => value === true || value === 'true';
const versionsReady = env => ['NOTICE_VERSION', 'PRIVACY_VERSION', 'PROCESSING_BASIS', 'WHATSAPP_NOTICE_VERSION'].every(key => typeof env[key] === 'string' && env[key].length > 0 && env[key].length <= 120);
const ready = (env, context) => env.DB && strong(env.RATE_LIMIT_SECRET) && strong(env.CONTACT_HASH_SECRET) && versionsReady(env) && (context.localSynthetic === true || enabled(env.COLLECTION_ENABLED) && enabled(env.LEGAL_APPROVED) && env.SITE_ORIGIN === 'https://exactmec.com' && ['NOTICE_VERSION', 'PRIVACY_VERSION', 'PROCESSING_BASIS', 'WHATSAPP_NOTICE_VERSION'].every(key => !/draft|test|synthetic/i.test(env[key])));
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
const actorHash = (env, actor) => hmac(env.CONTACT_HASH_SECRET, `actor:${actor.id}`);
const canonical = value => JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])));
const listSelect = `SELECT leads.*,
  (SELECT state FROM notification_outbox WHERE reference=leads.reference) AS notification_state,
  (SELECT attempts FROM notification_outbox WHERE reference=leads.reference) AS notification_attempts,
  (SELECT error_code FROM notification_outbox WHERE reference=leads.reference) AS notification_error,
  EXISTS(SELECT 1 FROM contact_suppression WHERE contact_hash IN (leads.email_hash,leads.phone_hash) AND channel='all') AS all_stopped,
  EXISTS(SELECT 1 FROM contact_suppression WHERE contact_hash=leads.phone_hash AND channel='whatsapp') AS whatsapp_stopped,
  EXISTS(SELECT 1 FROM contact_suppression WHERE contact_hash IN (leads.email_hash,leads.phone_hash)) AS any_stopped
  FROM leads`;

async function audit(env, actor, action, reference = null, metadata = {}) {
  await stmt(env.DB, 'INSERT INTO audit_events(id,action,reference,actor_hash,metadata_json,created_at) VALUES(?,?,?,?,?,?)', uuid(), action, reference, await actorHash(env, actor), JSON.stringify(metadata), now()).run();
}

async function readBody(request) {
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 65536) return null;
    const data = JSON.parse(text);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch { return null; }
}

export async function cleanupRateLimits(db, timestamp = Date.now()) {
  return stmt(db, 'DELETE FROM rate_buckets WHERE expires_at <= ?', timestamp).run();
}

async function rateAllowed(request, env) {
  const timestamp = Date.now();
  const windowMs = 600000;
  const start = Math.floor(timestamp / windowMs) * windowMs;
  // This header is supplied by Cloudflare; the authenticated router controls its trust boundary.
  const hash = await hmac(env.RATE_LIMIT_SECRET, `ip-window:${start}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
  await cleanupRateLimits(env.DB, timestamp);
  const row = await stmt(env.DB, 'INSERT INTO rate_buckets(bucket_hash,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket_hash) DO UPDATE SET attempts=attempts+1 RETURNING attempts', hash, start + windowMs).first();
  return { allowed: row.attempts <= 5, retry: Math.max(1, Math.ceil((start + windowMs - timestamp) / 1000)) };
}

async function createInquiry(request, env, context) {
  if (!ready(env, context)) return error('collection_unavailable', 503);
  const input = await readBody(request);
  if (!input) return error('invalid_request', 400);
  if (input.website_check != null && (typeof input.website_check !== 'string' || input.website_check.trim() !== '')) return error('invalid_request', 400);
  const requestId = request.headers.get('Idempotency-Key');
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) return error('idempotency_required', 400);
  const { payload, errors } = validateSubmission(input, env);
  if (Object.keys(errors).length) return json({ errors }, 422);
  const requestHash = await hmac(env.CONTACT_HASH_SECRET, `request:${canonical(input)}`);
  const previous = await stmt(env.DB, 'SELECT reference,request_hash FROM leads WHERE request_id=?', requestId).first();
  if (previous) return previous.request_hash === requestHash ? json({ saved: true, status: 'duplicate', reference: previous.reference }) : error('idempotency_conflict', 409);
  const rate = await rateAllowed(request, env);
  if (!rate.allowed) return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(rate.retry) });
  const reference = `EM_${uuid().replace(/-/g, '')}`;
  const timestamp = now();
  const [emailHash, phoneHash] = await Promise.all([hmac(env.CONTACT_HASH_SECRET, `email:${payload.email.toLowerCase()}`), hmac(env.CONTACT_HASH_SECRET, `phone:${payload.phone.replace(/\D/g, '')}`)]);
  const receipt = Object.fromEntries(['processing_choice', 'whatsapp_messages_opt_in', 'calls_opt_in', 'notice_version', 'privacy_version', 'privacy_processing_basis', 'whatsapp_choice_text_version'].map(key => [key, payload[key]]));
  Object.assign(receipt, { submitted_at: timestamp, choice_recorded_at: timestamp });
  await env.DB.batch([
    stmt(env.DB, 'INSERT INTO leads(reference,request_id,request_hash,payload_json,email_hash,phone_hash,review_json,mutation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING', reference, requestId, requestHash, JSON.stringify(payload), emailHash, phoneHash, JSON.stringify(defaultReview()), uuid(), timestamp, timestamp),
    stmt(env.DB, 'INSERT INTO consent_receipts(reference,receipt_json) SELECT reference,? FROM leads WHERE reference=?', JSON.stringify(receipt), reference),
    stmt(env.DB, 'INSERT INTO notification_outbox(reference,state,attempts,updated_at) SELECT reference,\'pending\',0,? FROM leads WHERE reference=?', timestamp, reference),
    stmt(env.DB, 'INSERT INTO lead_history(id,reference,action,note,actor_hash,created_at) SELECT ?,reference,\'created\',\'\',\'public\',? FROM leads WHERE reference=?', uuid(), timestamp, reference)
  ]);
  const saved = await stmt(env.DB, 'SELECT reference,request_hash FROM leads WHERE request_id=?', requestId).first();
  if (!saved) return error('save_unconfirmed', 503);
  if (saved.request_hash !== requestHash) return error('idempotency_conflict', 409);
  // Outbox creation is durable. Delivery never changes the successful receipt.
  if (saved.reference === reference && typeof context.notify === 'function') {
    const task = Promise.resolve().then(() => context.notify(reference)).catch(() => {});
    if (typeof context.waitUntil === 'function') context.waitUntil(task);
    else await task;
  }
  return saved.reference === reference ? json({ saved: true, reference }, 201) : json({ saved: true, status: 'duplicate', reference: saved.reference });
}

export async function getNotificationJob(db, reference) {
  const row = await stmt(db, 'SELECT reference,state,attempts,error_code FROM notification_outbox WHERE reference=?', reference).first();
  return row ? { reference: row.reference, state: row.state, attempts: row.attempts, errorCode: row.error_code ?? null } : null;
}

export async function claimNotification(db, reference) {
  const expired = new Date(Date.now() - 600000).toISOString();
  const row = await stmt(db, 'UPDATE notification_outbox SET state=\'sending\',attempts=attempts+1,error_code=NULL,updated_at=? WHERE reference=? AND (state IN (\'pending\',\'failed\',\'disabled\') OR (state=\'sending\' AND updated_at<=?)) RETURNING reference,state,attempts', now(), reference, expired).first();
  return row ? { reference: row.reference, state: row.state, attempts: row.attempts } : null;
}

export async function finishNotification(db, reference, { state, errorCode = null, attempts } = {}) {
  if (!['pending', 'sent', 'failed', 'disabled'].includes(state)) throw new TypeError('Invalid notification state');
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new TypeError('Notification claim attempts required');
  const safeError = typeof errorCode === 'string' && /^[a-z0-9_]{1,64}$/.test(errorCode) ? errorCode : null;
  await stmt(db, 'UPDATE notification_outbox SET state=?,error_code=?,updated_at=? WHERE reference=? AND state=\'sending\' AND attempts=?', state, safeError, now(), reference, attempts).run();
  return getNotificationJob(db, reference);
}

async function contactState(db, row, payload) {
  const result = await stmt(db, 'SELECT channel,contact_hash FROM contact_suppression WHERE contact_hash IN (?,?)', row.email_hash, row.phone_hash).all();
  const stopped = result.results.length > 0;
  const all = result.results.some(item => item.channel === 'all');
  const whatsapp = result.results.some(item => item.channel === 'whatsapp' && item.contact_hash === row.phone_hash);
  return { whatsapp_allowed: payload.whatsapp_messages_opt_in === true && !all && !whatsapp, email_allowed: !all, stopped };
}

async function item(db, row, detail = false) {
  const payload = JSON.parse(row.payload_json);
  const notification = Object.hasOwn(row, 'notification_state') ? { reference: row.reference, state: row.notification_state, attempts: row.notification_attempts, errorCode: row.notification_error ?? null } : await getNotificationJob(db, row.reference);
  const contact = Object.hasOwn(row, 'any_stopped') ? { whatsapp_allowed: payload.whatsapp_messages_opt_in === true && !row.all_stopped && !row.whatsapp_stopped, email_allowed: !row.all_stopped, stopped: !!row.any_stopped } : await contactState(db, row, payload);
  const result = { reference: row.reference, created_at: row.created_at, updated_at: row.updated_at, revision: row.revision, payload, review: JSON.parse(row.review_json), notification, contact };
  if (detail) {
    const receipt = await stmt(db, 'SELECT receipt_json FROM consent_receipts WHERE reference=?', row.reference).first();
    const history = await stmt(db, 'SELECT action,note,created_at FROM lead_history WHERE reference=? ORDER BY created_at,id', row.reference).all();
    result.consents = receipt ? JSON.parse(receipt.receipt_json) : null;
    result.history = history.results;
  }
  return result;
}

function queryFilters(filters) {
  const where = []; const values = [];
  if (filters.search) {
    where.push('(instr(lower(reference),lower(?))>0 OR instr(lower(payload_json),lower(?))>0)');
    values.push(filters.search, filters.search);
  }
  for (const key of ['status', 'qualification', 'priority', 'drawing_status']) if (filters[key]) {
    where.push(`json_extract(${key === 'drawing_status' ? 'payload_json' : 'review_json'}, '$.${key}')=?`);
    values.push(filters[key]);
  }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', values };
}

async function search(request, env, actor, exportCsv = false) {
  const filters = searchFilters(await readBody(request));
  if (!filters) return error('invalid_filters', 422);
  const query = queryFilters(filters);
  const total = (await stmt(env.DB, `SELECT count(*) AS total FROM leads ${query.where}`, ...query.values).first()).total;
  if (exportCsv && total > 1000) return error('export_limit', 422);
  const rows = await stmt(env.DB, `${listSelect} ${query.where} ORDER BY created_at DESC,reference LIMIT ? OFFSET ?`, ...query.values, exportCsv ? 1000 : filters.pageSize, exportCsv ? 0 : (filters.page - 1) * filters.pageSize).all();
  if (!exportCsv) {
    await audit(env, actor, 'searched', null, { count: rows.results.length });
    return json({ items: await Promise.all(rows.results.map(row => item(env.DB, row))), total, page: filters.page, pageSize: filters.pageSize });
  }
  const columns = ['reference', 'created_at', 'name', 'company', 'email', 'phone', 'country', 'city', 'component', 'description', 'drawing_status', 'mold_sets', 'purchase_timing', 'budget_status', 'budget_min', 'budget_max', 'currency', 'status', 'qualification', 'priority', 'owner', 'next_follow_up', 'whatsapp_allowed', 'email_allowed'];
  const output = [columns.map(csvCell).join(',')];
  for (const row of rows.results) {
    const lead = await item(env.DB, row);
    const flat = { ...lead.payload, ...lead.review, ...lead.contact, reference: lead.reference, created_at: lead.created_at };
    output.push(columns.map(key => csvCell(flat[key])).join(','));
  }
  await audit(env, actor, 'export', null, { count: rows.results.length });
  return new Response(`\uFEFF${output.join('\r\n')}\r\n`, { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="exactmec-inquiries.csv"' } });
}

async function leadAction(request, env, context, reference, action) {
  const row = await stmt(env.DB, 'SELECT * FROM leads WHERE reference=?', reference).first();
  if (!row) return error('not_found', 404);
  if (request.method === 'GET' && !action) {
    await audit(env, context.actor, 'viewed', reference);
    return json({ lead: await item(env.DB, row, true) });
  }
  const input = await readBody(request);
  if (!input) return error('invalid_request', 400);
  if (action === 'retry-notification' && request.method === 'POST') {
    await audit(env, context.actor, 'notification_retry', reference);
    if (typeof context.notify === 'function') try { await context.notify(reference); } catch { /* Persisted job retains delivery truth. */ }
    return json({ notification: await getNotificationJob(env.DB, reference) });
  }
  if (!validRevision(input.revision)) return error('revision_required', 422);
  if (row.revision !== input.revision) return error('revision_conflict', 409);
  const timestamp = now(); const mutation = uuid(); const hash = await actorHash(env, context.actor);
  if (request.method === 'DELETE' && !action) {
    if (input.confirmation !== reference) return error('confirmation_required', 422);
    const batch = await env.DB.batch([
      stmt(env.DB, 'INSERT INTO audit_events(id,action,reference,actor_hash,metadata_json,created_at) SELECT ?,\'deleted\',reference,?,\'{}\',? FROM leads WHERE reference=? AND revision=?', uuid(), hash, timestamp, reference, input.revision),
      stmt(env.DB, 'DELETE FROM leads WHERE reference=? AND revision=? RETURNING reference', reference, input.revision)
    ]);
    return batch[1].results?.length === 1 ? new Response(null, { status: 204, headers }) : error('revision_conflict', 409);
  }
  if (request.method === 'PATCH' && !action) {
    const review = validateReviewPatch(input, JSON.parse(row.review_json));
    if (!review) return error('invalid_review', 422);
    await env.DB.batch([
      stmt(env.DB, 'UPDATE leads SET review_json=?,revision=revision+1,mutation_id=?,updated_at=? WHERE reference=? AND revision=?', JSON.stringify(review), mutation, timestamp, reference, input.revision),
      stmt(env.DB, 'INSERT INTO lead_history(id,reference,action,note,actor_hash,created_at) SELECT ?,reference,\'reviewed\',?,?,? FROM leads WHERE reference=? AND mutation_id=?', uuid(), input.note ?? '', hash, timestamp, reference, mutation),
      stmt(env.DB, 'INSERT INTO audit_events(id,action,reference,actor_hash,metadata_json,created_at) SELECT ?,\'reviewed\',reference,?,\'{}\',? FROM leads WHERE reference=? AND mutation_id=?', uuid(), hash, timestamp, reference, mutation)
    ]);
  } else if (request.method === 'POST' && action === 'opt-out') {
    if (!['whatsapp', 'all'].includes(input.channel) || !validNote(input.reason ?? '')) return error('invalid_opt_out', 422);
    const hashes = input.channel === 'all' ? [row.email_hash, row.phone_hash] : [row.phone_hash];
    await env.DB.batch([
      stmt(env.DB, 'UPDATE leads SET revision=revision+1,mutation_id=?,updated_at=? WHERE reference=? AND revision=?', mutation, timestamp, reference, input.revision),
      ...hashes.map(contactHash => stmt(env.DB, 'INSERT INTO contact_suppression(contact_hash,channel,created_at) SELECT ?,?,? FROM leads WHERE reference=? AND mutation_id=? ON CONFLICT(contact_hash,channel) DO NOTHING', contactHash, input.channel, timestamp, reference, mutation)),
      stmt(env.DB, 'INSERT INTO lead_history(id,reference,action,note,actor_hash,created_at) SELECT ?,reference,?,?,?,? FROM leads WHERE reference=? AND mutation_id=?', uuid(), `opt_out_${input.channel}`, input.reason ?? '', hash, timestamp, reference, mutation),
      stmt(env.DB, 'INSERT INTO audit_events(id,action,reference,actor_hash,metadata_json,created_at) SELECT ?,?,reference,?,\'{}\',? FROM leads WHERE reference=? AND mutation_id=?', uuid(), `opt_out_${input.channel}`, hash, timestamp, reference, mutation)
    ]);
  } else return error('method_not_allowed', 405);
  const updated = await stmt(env.DB, 'SELECT * FROM leads WHERE reference=?', reference).first();
  return updated?.mutation_id === mutation ? json({ lead: await item(env.DB, updated, true) }) : error('revision_conflict', 409);
}

export async function handleBusiness(request, env, context = {}) {
  const path = new URL(request.url).pathname;
  try {
    if (path === '/api/inquiries') return request.method === 'POST' ? await createInquiry(request, env, context) : error('method_not_allowed', 405);
    if (!path.startsWith('/api/admin/leads')) return null;
    if (!context.actor || typeof context.actor.id !== 'string' || !context.actor.id) return error('unauthorized', 401);
    if (!env.DB || !strong(env.CONTACT_HASH_SECRET)) return error('service_unavailable', 503);
    if (path === '/api/admin/leads/search' && request.method === 'POST') return await search(request, env, context.actor);
    if (path === '/api/admin/leads/export' && request.method === 'POST') return await search(request, env, context.actor, true);
    const match = /^\/api\/admin\/leads\/([^/]+)(?:\/(opt-out|retry-notification))?$/.exec(path);
    if (!match || !validReference(match[1])) return error('not_found', 404);
    return await leadAction(request, env, context, match[1], match[2]);
  } catch {
    // Never echo a D1 exception, SQL statement, request body or customer value.
    return error('service_unavailable', 503);
  }
}

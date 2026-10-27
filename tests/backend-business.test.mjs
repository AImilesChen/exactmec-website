import noticeVersions from '../src/data/notice-versions.json' with {type:'json'};
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleBusiness, claimNotification, cleanupRateLimits, finishNotification, getNotificationJob } from '../backend/business.mjs';
import { buildInquiryPayload, initialValues } from '../src/inquiry/model.mjs';

let mf; let db; let env;
const actor = { id: 'synthetic-admin', email: 'admin@example.invalid' };
const context = { actor, localSynthetic: true };
const fixture = (suffix = '') => buildInquiryPayload({ ...initialValues(), name: `Synthetic Buyer ${suffix}`, company: 'Synthetic Test Company', email: `buyer${suffix}@example.invalid`, phone: '+44 7700 900123', country: 'United Kingdom', city: 'Synthetic City', component: 'Synthetic housing', description: 'Synthetic test project only.', drawing_status: 'A physical sample', processing: true, whatsapp: true });
const key = () => `test_${crypto.randomUUID()}`;
const req = (path, method = 'POST', body = {}, extra = {}) => new Request(`https://exactmec.com${path}`, { method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10', ...extra }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
const submit = (payload = fixture(), requestKey = key(), ip = crypto.randomUUID()) => handleBusiness(req('/api/inquiries', 'POST', payload, { 'Idempotency-Key': requestKey, 'CF-Connecting-IP': ip }), env, context);
const admin = (path, method = 'GET', body = {}, ctx = context) => handleBusiness(req(`/api/admin/leads${path}`, method, body), env, ctx);
const get = async reference => (await (await admin(`/${reference}`)).json()).lead;

before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("synthetic-only")}}', compatibilityDate: '2026-10-01', d1Databases: { DB: 'synthetic-business-tests' },r2Buckets:{INQUIRY_FILES:'synthetic-inquiry-files'} }));
  db = await mf.getD1Database('DB');
  const migration = readFileSync(new URL('../migrations/0001_inquiries.sql', import.meta.url), 'utf8');
  await db.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  env = { DB: db, INQUIRY_FILES:await mf.getR2Bucket('INQUIRY_FILES'), SITE_ORIGIN: 'https://exactmec.com', RATE_LIMIT_SECRET: 'synthetic-rate-secret-32-characters-minimum', CONTACT_HASH_SECRET: 'synthetic-contact-secret-32-characters-minimum', NOTICE_VERSION: noticeVersions.notice_version, PRIVACY_VERSION: noticeVersions.privacy_version, PROCESSING_BASIS: noticeVersions.privacy_processing_basis, WHATSAPP_NOTICE_VERSION: noticeVersions.whatsapp_choice_text_version };
});
after(async () => { await mf?.dispose(); });

test('production collection is closed by default and draft configuration cannot enable it', async () => {
  const request = () => req('/api/inquiries', 'POST', fixture(), { 'Idempotency-Key': key() });
  assert.equal((await handleBusiness(request(), env, {})).status, 503);
  for(const name of ['NOTICE_VERSION','PRIVACY_VERSION','PROCESSING_BASIS','WHATSAPP_NOTICE_VERSION'])assert.equal((await handleBusiness(request(), { ...env, COLLECTION_ENABLED: 'true', LEGAL_APPROVED: 'true', [name]:'unapproved-draft' }, {})).status, 503);
  assert.equal((await handleBusiness(request(), { ...env, LOCAL_SYNTHETIC: true }, {})).status, 503);
  assert.equal((await handleBusiness(request(), { ...env, RATE_LIMIT_SECRET: 'short' }, context)).status, 503);
});

test('fully configured production gate accepts synthetic data only with exact approved versions', async () => {
  const approved = { ...env, COLLECTION_ENABLED: 'true', LEGAL_APPROVED: 'true', NOTICE_VERSION: 'notice-v1', PRIVACY_VERSION: 'privacy-v1', PROCESSING_BASIS: 'purpose-limited-consent-v1', WHATSAPP_NOTICE_VERSION: 'whatsapp-v1' };
  const payload = { ...fixture('approved-gate'), notice_version: approved.NOTICE_VERSION, privacy_version: approved.PRIVACY_VERSION, privacy_processing_basis: approved.PROCESSING_BASIS, whatsapp_choice_text_version: approved.WHATSAPP_NOTICE_VERSION };
  const response = await handleBusiness(req('/api/inquiries', 'POST', payload, { 'Idempotency-Key': key(), 'CF-Connecting-IP': '192.0.2.55' }), approved, {});
  assert.equal(response.status, 201);
  assert.equal((await handleBusiness(req('/api/inquiries', 'POST', fixture(), { 'Idempotency-Key': key() }), approved, {})).status, 422);
});

test('Miniflare D1 atomically stores one lead, receipt and outbox with server timestamps', async () => {
  const response = await submit(fixture('save'));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.saved, true);
  assert.match(body.reference, /^EM_[a-f0-9]{32}$/);
  assert.deepEqual(Object.keys(body).sort(), ['reference', 'saved']);
  const lead = await get(body.reference);
  assert.equal(lead.payload.company, 'Synthetic Test Company');
  assert.equal(lead.review.priority, 'B');
  assert.equal(lead.review.qualification, 'Unreviewed');
  assert.equal(lead.review.status, 'New');
  assert.equal(lead.consents.processing_choice, true);
  assert.equal(lead.consents.calls_opt_in, false);
  assert.ok(Date.parse(lead.consents.submitted_at));
  assert.equal(lead.notification.state, 'pending');
  assert.equal(lead.history.length, 1);
  assert.equal(lead.contact.whatsapp_allowed, true);
  assert.equal(lead.contact.email_allowed, true);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('injection mold requests retain their type and can be found in the staff list', async () => {
  const response = await submit({ ...fixture('injection-type'), mold_type: 'Injection mold' });
  assert.equal(response.status, 201);
  const { reference } = await response.json();
  assert.equal((await get(reference)).payload.mold_type, 'Injection mold');
  const result = await (await admin('/search', 'POST', { search: 'Synthetic Buyer injection-type', mold_type: 'Injection mold' })).json();
  assert.equal(result.total, 1);
  assert.equal(result.items[0].reference, reference);
  assert.equal((await (await admin('/search', 'POST', { search: 'Synthetic Buyer injection-type', mold_type: 'Aluminum die casting mold' })).json()).total, 0);
  assert.equal((await admin('/search', 'POST', { mold_type: 'Plastic mass production' })).status, 422);
  assert.equal((await submit({ ...fixture('invalid-type'), mold_type: '' })).status, 422);
});

test('drawing upload is linked to one saved lead, private to staff, and removed with the lead',async()=>{
  const payload={...fixture('file'),drawing_status:'3D part model / drawings'};
  const form=new FormData();form.append('payload',JSON.stringify(payload));form.append('files',new File(['SYNTHETIC CAD TEST'],'component.step',{type:'application/octet-stream'}));
  const requestKey=key();
  const request=()=>new Request('https://exactmec.com/api/inquiries',{method:'POST',headers:{'Idempotency-Key':requestKey,'CF-Connecting-IP':crypto.randomUUID()},body:form});
  const first=await handleBusiness(request(),env,context);assert.equal(first.status,201);
  const {reference}=await first.json();
  const lead=await get(reference);assert.deepEqual(lead.payload.files.map(({name,size})=>({name,size})),[{name:'component.step',size:18}]);
  assert.equal((await env.INQUIRY_FILES.get(`inquiries/${reference}/0`)).size,18);
  const download=await admin(`/${reference}/files/0`);assert.equal(download.status,200);assert.equal(download.headers.get('Content-Type'),'application/octet-stream');assert.equal(await download.text(),'SYNTHETIC CAD TEST');
  assert.equal((await admin(`/${reference}/files/0`,'GET',{},{})).status,401);
  const replay=await handleBusiness(request(),env,context);assert.equal(replay.status,200);assert.equal((await replay.json()).reference,reference);
  assert.equal((await admin(`/${reference}`,'DELETE',{revision:lead.revision,confirmation:reference})).status,204);
  assert.equal(await env.INQUIRY_FILES.get(`inquiries/${reference}/0`),null);
});

test('upload route rejects photos disguised as drawings and drawing files on the photo path',async()=>{
  for(const [status,name] of [['Clear 2D part drawings','component.jpg'],['Photos / concept only','component.step'],['A physical sample','component.jpg']]){
    const form=new FormData();
    form.append('payload',JSON.stringify({...fixture(`invalid-${status}`),drawing_status:status}));
    form.append('files',new File(['SYNTHETIC'],name,{type:'application/octet-stream'}));
    const response=await handleBusiness(new Request('https://exactmec.com/api/inquiries',{method:'POST',headers:{'Idempotency-Key':key(),'CF-Connecting-IP':crypto.randomUUID()},body:form}),env,context);
    assert.equal(response.status,422,status);
    assert.deepEqual(await response.json(),{errors:{files:'invalid'}});
  }
});

test('server validates requirements, versions and optional purchase information independently', async () => {
  for (const [field, value] of [['name', ''], ['company', ''], ['email', 'invalid'], ['phone', '07700900123'], ['country', ''], ['city', ''], ['component', ''], ['description', ''], ['drawing_status', 'Verified drawing received'], ['mold_sets', 0], ['processing_choice', false], ['notice_version', 'forged']]) {
    const response = await submit({ ...fixture(), [field]: value });
    assert.equal(response.status, 422, field);
    const text = await response.text(); assert.doesNotMatch(text, /buyer@example|Synthetic Test Company/);
  }
  const optional = fixture('optional');
  Object.assign(optional, { budget_status: null, budget_min: null, budget_max: null, currency: null, purchase_timing: null, whatsapp_messages_opt_in: false, mold_sets: 1 });
  const saved = await (await submit(optional)).json();
  const lead = await get(saved.reference);
  assert.equal(lead.review.qualification, 'Unreviewed');
  assert.equal(lead.review.priority, 'B');
  assert.equal(lead.contact.whatsapp_allowed, false);
  assert.equal(lead.contact.email_allowed, true);
  assert.equal((await submit({ ...fixture(), budget_status: 'I have an estimated budget', budget_min: 100, budget_max: 10, currency: 'USD' })).status, 422);
});

test('honeypot rejects without persistence and exact idempotency replay cannot duplicate rows', async () => {
  const beforeCount = (await db.prepare('SELECT count(*) AS n FROM leads').first()).n;
  assert.equal((await submit({ ...fixture(), website_check: 'automated spam' })).status, 400);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM leads').first()).n, beforeCount);
  const requestKey = key(); const payload = fixture('replay');
  const first = await (await submit(payload, requestKey)).json();
  const repeated = await submit(payload, requestKey);
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), { saved: true, status: 'duplicate', reference: first.reference });
  assert.equal((await submit({ ...payload, city: 'Changed Synthetic City' }, requestKey)).status, 409);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM leads WHERE request_id=?').bind(requestKey).first()).n, 1);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM notification_outbox WHERE reference=?').bind(first.reference).first()).n, 1);
});

test('concurrent identical submissions converge on one reference, receipt and job', async () => {
  const requestKey = key(); const payload = fixture('concurrent');
  const responses = await Promise.all([submit(payload, requestKey), submit(payload, requestKey)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.equal(bodies[0].reference, bodies[1].reference);
  const reference = bodies[0].reference;
  assert.equal((await db.prepare('SELECT count(*) AS n FROM consent_receipts WHERE reference=?').bind(reference).first()).n, 1);
});

test('a failure after inserts rolls back lead, receipt and outbox as one D1 batch', async () => {
  const requestKey = key();
  const beforeReceipts = (await db.prepare('SELECT count(*) AS n FROM consent_receipts').first()).n;
  const beforeJobs = (await db.prepare('SELECT count(*) AS n FROM notification_outbox').first()).n;
  const failingDb = {
    prepare: sql => db.prepare(sql),
    batch: statements => db.batch([...statements, db.prepare("INSERT INTO contact_suppression(contact_hash,channel,created_at) VALUES('synthetic-rollback','invalid-channel','synthetic')")])
  };
  const response = await handleBusiness(req('/api/inquiries', 'POST', fixture('rollback'), { 'Idempotency-Key': requestKey, 'CF-Connecting-IP': '192.0.2.56' }), { ...env, DB: failingDb }, context);
  assert.equal(response.status, 503);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM leads WHERE request_id=?').bind(requestKey).first()).n, 0);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM consent_receipts').first()).n, beforeReceipts);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM notification_outbox').first()).n, beforeJobs);
  assert.deepEqual(await response.json(), { error: 'service_unavailable' });
});

test('simultaneous reuse of one key with different bodies accepts only one body', async () => {
  const requestKey = key();
  const responses = await Promise.all([submit(fixture('conflict-one'), requestKey), submit(fixture('conflict-two'), requestKey)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM leads WHERE request_id=?').bind(requestKey).first()).n, 1);
});

test('rate limiting stores short-lived HMAC buckets, never raw IP, and cleans expiry', async () => {
  const ip = '198.51.100.123';
  for (let index = 0; index < 5; index++) assert.equal((await submit(fixture(`rate${index}`), key(), ip)).status, 201);
  const blocked = await submit(fixture('blocked'), key(), ip);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('Retry-After')) > 0);
  const rows = await db.prepare('SELECT * FROM rate_buckets').all();
  assert.ok(rows.results.every(row => /^[a-f0-9]{64}$/.test(row.bucket_hash)));
  assert.doesNotMatch(JSON.stringify(rows.results), /198\.51\.100\.123/);
  await cleanupRateLimits(db, Date.now() + 600001);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM rate_buckets').first()).n, 0);
});

test('direct admin routes require actor and search filters use bounded parameterized SQL', async () => {
  assert.equal((await admin('/search', 'POST', {}, {})).status, 401);
  assert.equal((await admin('/search', 'POST', { pageSize: 101 })).status, 422);
  const injection = await admin('/search', 'POST', { search: "' OR 1=1 --" });
  assert.equal(injection.status, 200);
  assert.equal((await injection.json()).total, 0);
  const filtered = await (await admin('/search', 'POST', { search: 'Synthetic Buyer save', status: 'New', priority: 'B', pageSize: 10 })).json();
  assert.equal(filtered.total, 1);
  assert.equal(filtered.items[0].payload.name, 'Synthetic Buyer save');
  assert.equal((await admin('/search', 'POST', { status: 'invented' })).status, 422);
});

test('source snapshots are server-cleaned, stored only with the lead and survive idempotent replay', async () => {
  const requestKey = key();
  const source = { first: { page: '/industries/led-lighting/', referrer: 'https://www.google.com/search?q=private-body', utm_source: 'google', utm_campaign: 'lighting-q4', utm_term: 'private@example.invalid', email: 'private@example.invalid' }, submission: { page: '/request-a-quote/', referrer: 'https://user:pass@example.invalid/', utm_medium: 'cpc' }, raw_url: 'private@example.invalid' };
  const payload = { ...fixture('source-snapshot'), source };
  const response = await submit(payload, requestKey);
  assert.equal(response.status, 201);
  const { reference } = await response.json();
  const lead = await get(reference);
  assert.equal(lead.payload.source.first.page, '/industries/led-lighting/');
  assert.equal(lead.payload.source.first.referrer, 'https://www.google.com');
  assert.equal(lead.payload.source.first.utm_campaign, 'lighting-q4');
  assert.equal(lead.payload.source.first.utm_term, null);
  assert.equal(lead.payload.source.submission.referrer, null);
  assert.doesNotMatch(JSON.stringify(lead.payload.source), /private|raw_url|email|\?/);
  assert.equal((await submit(payload, requestKey)).status, 200);
  assert.equal((await submit({ ...payload, source: { ...source, submission: { page: '/' } } }, requestKey)).status, 409);
  const csv = await (await admin('/export', 'POST', { search: reference })).text();
  assert.match(csv, /"first_page"/);
  assert.match(csv, /"lighting-q4"/);
  assert.doesNotMatch(csv, /private-body|private@example\.invalid/);
  const audit = await db.prepare('SELECT metadata_json FROM audit_events WHERE reference=?').bind(reference).all();
  assert.doesNotMatch(JSON.stringify(audit.results), /google|lighting-q4|private/);
  assert.equal((await admin(`/${reference}`, 'DELETE', { revision: 1, confirmation: reference })).status, 204);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM leads WHERE reference=?').bind(reference).first()).n, 0);
});

test('purchase and review filters preserve missing versus declined information and use the same export query', async () => {
  const unique = `filter-${crypto.randomUUID()}`;
  const reference = (await (await submit({ ...fixture(unique), purchase_timing: null, budget_status: null })).json()).reference;
  const declined = (await (await submit({ ...fixture(unique + '-declined'), purchase_timing: 'Prefer not to say', budget_status: 'Prefer not to say' })).json()).reference;
  await admin(`/${reference}`, 'PATCH', { revision: 1, review: { authenticity: 'Needs Verification', fit: 'Mold Project', readiness: 'Received to Review' } });
  const filters = { search: unique, purchase_timing: '__not_provided__', budget_status: '__not_provided__', authenticity: 'Needs Verification', fit: 'Mold Project', readiness: 'Received to Review' };
  const result = await (await admin('/search', 'POST', filters)).json();
  assert.equal(result.total, 1);
  assert.equal(result.items[0].reference, reference);
  assert.equal(result.items[0].review.priority, 'B', 'missing budget and timing never auto-downgrade');
  const csv = await (await admin('/export', 'POST', filters)).text();
  assert.match(csv, new RegExp(reference));
  assert.doesNotMatch(csv, new RegExp(declined));
  assert.equal((await (await admin('/search', 'POST', { search: unique, budget_status: 'Prefer not to say' })).json()).total, 1);
  for (const key of ['purchase_timing', 'budget_status', 'authenticity', 'fit', 'readiness']) assert.equal((await admin('/search', 'POST', { [key]: "' OR 1=1 --" })).status, 422, key);
});

test('review updates are optimistic, validate enums, and audit no contact body', async () => {
  const { reference } = await (await submit(fixture('review'))).json();
  const first = await admin(`/${reference}`, 'PATCH', { revision: 1, review: { status: 'Reviewing', priority: 'A', owner: 'Synthetic owner', next_follow_up: '2026-11-03' }, note: 'Synthetic review note.' });
  assert.equal(first.status, 200);
  const lead = (await first.json()).lead;
  assert.equal(lead.revision, 2);
  assert.equal(lead.history.at(-1).note, 'Synthetic review note.');
  assert.equal((await admin(`/${reference}`, 'PATCH', { revision: 1, review: { status: 'Lost' }, note: 'stale' })).status, 409);
  assert.equal((await admin(`/${reference}`, 'PATCH', { revision: 2, review: { next_follow_up: '2026-02-30' } })).status, 422);
  assert.equal((await admin(`/${reference}`, 'PATCH', { revision: 2, review: { status: 'New', email: 'forged@example.invalid' } })).status, 422);
  const audit = await db.prepare('SELECT * FROM audit_events WHERE reference=? AND action=\'reviewed\'').bind(reference).all();
  assert.equal(audit.results.length, 1);
  assert.match(audit.results[0].actor_hash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(audit.results), /Synthetic review note|admin@example|buyerreview/);
});

test('concurrent revision updates allow one winner and no stale history insert', async () => {
  const { reference } = await (await submit(fixture('optimistic'))).json();
  const responses = await Promise.all(['first', 'second'].map(note => admin(`/${reference}`, 'PATCH', { revision: 1, review: { status: 'Reviewing' }, note })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const lead = await get(reference);
  assert.equal(lead.revision, 2);
  assert.equal(lead.history.filter(entry => entry.action === 'reviewed').length, 1);
});

test('WhatsApp suppression is independent, survives fresh consent and remains after deletion', async () => {
  const payload = fixture('suppression');
  const { reference } = await (await submit(payload)).json();
  const stopped = await admin(`/${reference}/opt-out`, 'POST', { revision: 1, channel: 'whatsapp', reason: 'Synthetic stop request.' });
  assert.equal(stopped.status, 200);
  let lead = (await stopped.json()).lead;
  assert.deepEqual(lead.contact, { whatsapp_allowed: false, email_allowed: true, stopped: true });
  const { reference: repeatedRef } = await (await submit({ ...payload, name: 'Synthetic later consent' })).json();
  assert.equal((await get(repeatedRef)).contact.whatsapp_allowed, false);
  assert.equal((await admin(`/${reference}`, 'DELETE', { revision: 1, confirmation: reference })).status, 409);
  assert.equal((await admin(`/${reference}`, 'DELETE', { revision: 2, confirmation: 'wrong' })).status, 422);
  assert.equal((await admin(`/${reference}`, 'DELETE', { revision: 2, confirmation: reference })).status, 204);
  assert.equal((await admin(`/${reference}`)).status, 404);
  for (const table of ['consent_receipts', 'lead_history', 'notification_outbox']) assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE reference=?`).bind(reference).first()).n, 0);
  assert.equal((await get(repeatedRef)).contact.whatsapp_allowed, false);
  const suppression = await db.prepare('SELECT * FROM contact_suppression').all();
  assert.doesNotMatch(JSON.stringify(suppression.results), /7700|example\.invalid|Synthetic stop/);
  const deletionAudit = await db.prepare('SELECT * FROM audit_events WHERE reference=? AND action=\'deleted\'').bind(reference).first();
  assert.ok(deletionAudit);
});

test('all-channel opt-out blocks both channels and is not cleared by review changes', async () => {
  const payload = { ...fixture('allstop'), phone: '+49 170 0000999' };
  const { reference } = await (await submit(payload)).json();
  const stopped = (await (await admin(`/${reference}/opt-out`, 'POST', { revision: 1, channel: 'all' })).json()).lead;
  assert.deepEqual(stopped.contact, { whatsapp_allowed: false, email_allowed: false, stopped: true });
  const edited = (await (await admin(`/${reference}`, 'PATCH', { revision: 2, review: { status: 'Contacted' } })).json()).lead;
  assert.equal(edited.contact.email_allowed, false);
});

test('CSV quotes values, protects whitespace-prefixed formulas, and exports no hidden storage fields', async () => {
  const { reference } = await (await submit({ ...fixture('csv'), name: ' \t=HYPERLINK("https://example.invalid")', company: '@SUM(1+1)' })).json();
  const response = await admin('/export', 'POST', { search: reference });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /text\/csv/);
  const text = await response.text();
  assert.match(text, /"'\s*=HYPERLINK\(""https:\/\/example\.invalid""\)"/);
  assert.match(text, /"'@SUM\(1\+1\)"/);
  assert.doesNotMatch(text, /request_hash|email_hash|phone_hash|actor_hash/);
});

test('notification outbox claims once, sanitizes errors and delivery failure never loses lead', async () => {
  const { reference } = await (await submit({ ...fixture('notify'), phone: '+49 170 0000888' })).json();
  assert.deepEqual(await getNotificationJob(db, reference), { reference, state: 'pending', attempts: 0, errorCode: null });
  const claims = await Promise.all([claimNotification(db, reference), claimNotification(db, reference)]);
  assert.equal(claims.filter(Boolean).length, 1);
  await finishNotification(db, reference, { state: 'failed', errorCode: 'private buyer@example.invalid', attempts: claims.find(Boolean).attempts });
  assert.equal((await getNotificationJob(db, reference)).errorCode, null);
  assert.equal((await get(reference)).payload.name, 'Synthetic Buyer notify');
  const retryClaim = await claimNotification(db, reference);
  await finishNotification(db, reference, { state: 'disabled', errorCode: 'recipient_unconfigured', attempts: retryClaim.attempts });
  const retry = await admin(`/${reference}/retry-notification`, 'POST', {});
  assert.equal((await retry.json()).notification.state, 'disabled');
  assert.equal((await getNotificationJob(db, reference)).attempts, 2);
});

test('expired sending leases can be reclaimed and a stale attempt cannot overwrite the new claim', async () => {
  const { reference } = await (await submit(fixture('lease-recovery'))).json();
  const first = await claimNotification(db, reference);
  assert.equal(first.attempts, 1);
  assert.equal(await claimNotification(db, reference), null, 'live lease cannot be reclaimed');
  await db.prepare('UPDATE notification_outbox SET updated_at=? WHERE reference=?').bind(new Date(Date.now() - 600001).toISOString(), reference).run();
  const recovered = await claimNotification(db, reference);
  assert.equal(recovered.attempts, 2);
  assert.equal((await finishNotification(db, reference, { state: 'failed', errorCode: 'old_attempt', attempts: first.attempts })).state, 'sending');
  assert.equal((await finishNotification(db, reference, { state: 'sent', attempts: recovered.attempts })).state, 'sent');
  assert.equal((await finishNotification(db, reference, { state: 'failed', errorCode: 'old_attempt', attempts: first.attempts })).state, 'sent');
  await assert.rejects(() => finishNotification(db, reference, { state: 'failed' }), /claim attempts required/);
});

test('an injected notification failure cannot undo a durable inquiry or fake sent state', async () => {
  let calls = 0;
  const response = await handleBusiness(req('/api/inquiries', 'POST', fixture('failed-notify-hook'), { 'Idempotency-Key': key(), 'CF-Connecting-IP': '192.0.2.57' }), env, { ...context, notify: async () => { calls++; throw new Error('synthetic provider unavailable'); } });
  assert.equal(response.status, 201);
  const { reference } = await response.json();
  assert.equal(calls, 1);
  assert.equal((await getNotificationJob(db, reference)).state, 'pending');
  assert.equal((await get(reference)).payload.name, 'Synthetic Buyer failed-notify-hook');
});

test('CMS source paths come only from published D1 rows; unknown, withdrawn and client-registered paths stay unknown', async () => {
  const migration = readFileSync(new URL('../migrations/0004_content_publication.sql', import.meta.url), 'utf8');
  await db.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  const published = '/industries/new-cms-source-slug/';
  const withdrawn = '/industries/withdrawn-cms-source-slug/';
  const time = new Date().toISOString();
  for (const [id, path, original, state] of [['source-published', published, '/industries/new-cms-original/', 'published'], ['source-withdrawn', withdrawn, '/industries/led-lighting/', 'withdrawn']]) {
    await db.prepare('INSERT INTO content_publications(page_id,original_path,path,source_hash,content_json,draft_revision,revision,state,mutation_id,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id, original, path, '0'.repeat(64), '{}', 1, 1, state, crypto.randomUUID(), time, time).run();
  }
  const cmsEnv = { ...env, CMS_ENABLED: 'true' };
  const save = (page, requestKey = key(), extra = {}) => handleBusiness(req('/api/inquiries', 'POST', { ...fixture('cms-source'), source: { first: { page, utm_source: 'google' }, submission: { page: '/request-a-quote/' }, knownPaths: [page] }, knownPaths: [page], ...extra }, { 'Idempotency-Key': requestKey, 'CF-Connecting-IP': crypto.randomUUID() }), cmsEnv, context);
  const requestKey = key();
  const created = await save(published, requestKey);
  assert.equal(created.status, 201);
  const { reference } = await created.json();
  assert.equal((await get(reference)).payload.source.first.page, published);
  assert.equal((await save(published, requestKey)).status, 200);
  for (const path of [withdrawn, '/industries/led-lighting/', '/industries/client-registered-source/']) {
    const response = await save(path);
    assert.equal(response.status, 201);
    const lead = await get((await response.json()).reference);
    assert.equal(lead.payload.source.first.page, null, path);
  }
  await db.prepare("UPDATE content_publications SET state='withdrawn' WHERE page_id='source-published'").run();
  const repeated = await save(published, requestKey);
  assert.equal(repeated.status, 200, 'withdrawal does not change a saved inquiry or duplicate it');
  assert.equal((await get(reference)).payload.source.first.page, published, 'saved source remains an immutable submission snapshot');
  const afterWithdrawal = await save(published);
  assert.equal((await get((await afterWithdrawal.json()).reference)).payload.source.first.page, null);
  const cmsOff = await submit({ ...fixture('cms-off-source'), source: { first: { page: published } } });
  assert.equal(cmsOff.status, 201);
  assert.equal((await get((await cmsOff.json()).reference)).payload.source.first.page, null);
});

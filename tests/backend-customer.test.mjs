import noticeVersions from '../src/data/notice-versions.json' with {type:'json'};
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleCustomer, customerPortalConfiguration } from '../backend/customer.mjs';
import { CUSTOMER_COOKIE, CUSTOMER_LOCAL_COOKIE, customerAuthHash, customerEmailHash, customerGoogleAdminActor } from '../backend/customer-auth.mjs';
import { handleBusiness } from '../backend/business.mjs';
import { hmac } from '../backend/domain.mjs';
import { buildInquiryPayload, initialValues } from '../src/inquiry/model.mjs';
import worker from '../cloudflare/worker.mjs';

const origin = 'http://127.0.0.1:4181';
let mf; let db; let env; let count = 0; let requests = 0;
const messages = [];
const context = { localSynthetic: true, sendCode: async message => { messages.push(message); return { accepted: true }; } };
const req = (path, method = 'GET', input, headers = {}, site = origin) => new Request(site + path, { method, headers: { 'CF-Connecting-IP': `192.0.2.${++requests % 200 + 1}`, ...(method !== 'GET' ? { Origin: site, 'Content-Type': 'application/json' } : {}), ...headers }, ...(method !== 'GET' ? { body: JSON.stringify(input ?? {}) } : {}) });
const call = (path, method = 'GET', input, headers = {}, options = {}) => handleCustomer(req('/api/customer' + path, method, input, headers, options.origin || origin), options.env || env, options.context || context);
const email = () => `synthetic-customer-${++count}@example.invalid`;
async function seed(address = email(), suffix = '') {
  const payload = buildInquiryPayload({ ...initialValues(), name: 'Synthetic customer', company: 'Synthetic company', email: address, phone: '+1 202 555 0140', country: 'United States', city: 'Synthetic city', component: 'Synthetic mold ' + suffix, description: 'Synthetic inquiry only.', drawing_status: 'A physical sample', processing: true, whatsapp: false });
  payload.source.first.utm_campaign = 'PRIVATE-INTERNAL-SOURCE';
  const response = await handleBusiness(new Request(origin + '/api/inquiries', { method: 'POST', headers: { 'Idempotency-Key': 'anonymous_' + crypto.randomUUID(), 'CF-Connecting-IP': crypto.randomUUID(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), env, { localSynthetic: true });
  assert.equal(response.status, 201);
  return { reference: (await response.json()).reference, email: address, payload };
}
async function issue(address, headers, options) {
  const response = await call('/auth/request-code', 'POST', { email: address }, headers, options);
  assert.equal(response.status, 202);
  const data = await response.json();
  assert.deepEqual(Object.keys(data).sort(), ['accepted', 'challenge']);
  assert.equal(data.accepted, true);
  assert.match(data.challenge, /^cc_[A-Za-z0-9_-]{43}$/);
  assert.equal(response.headers.get('Set-Cookie'), null);
  return data.challenge;
}
async function login(address, options = {}) {
  const challenge = await issue(address, undefined, options);
  const message = messages.findLast(item => item.email === address.toLowerCase());
  assert.ok(message);
  const response = await call('/auth/verify-code', 'POST', { challenge, code: message.code }, {}, options);
  assert.equal(response.status, 200, await response.clone().text());
  return { data: await response.json(), cookie: response.headers.get('Set-Cookie').split(';')[0], fullCookie: response.headers.get('Set-Cookie'), challenge, code: message.code };
}
before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("synthetic-only")}}', compatibilityDate: '2026-10-01', d1Databases: { DB: 'synthetic-customer-tests' } }));
  db = await mf.getD1Database('DB');
  for (const file of ['0001_inquiries.sql', '0006_customer_portal.sql', '0007_customer_files.sql', '0008_customer_google_identities.sql']) {
    const migration = readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8');
    await db.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  }
  env = { DB: db, SITE_ORIGIN: origin, CUSTOMER_AUTH_SECRET: 'synthetic-customer-auth-secret-minimum-32-characters', RATE_LIMIT_SECRET: 'synthetic-rate-secret-minimum-32-characters', CONTACT_HASH_SECRET: 'synthetic-contact-secret-minimum-32-characters', NOTICE_VERSION: noticeVersions.notice_version, PRIVACY_VERSION: noticeVersions.privacy_version, PROCESSING_BASIS: noticeVersions.privacy_processing_basis, WHATSAPP_NOTICE_VERSION: noticeVersions.whatsapp_choice_text_version };
});
after(async () => { await mf?.dispose(); });

test('portal gates stay closed in review; bypass works only on explicit loopback context and marketing/RFQ are untouched', async () => {
  assert.equal(customerPortalConfiguration(env, {}), null);
  assert.ok(customerPortalConfiguration(env, context));
  assert.equal(customerPortalConfiguration({ ...env, LOCAL_SYNTHETIC: true }, { sendCode: context.sendCode }), null);
  const production = { ...env, SITE_ORIGIN: 'https://exactmec.com', CUSTOMER_PORTAL_ENABLED: 'true', RELEASE: 'true', LEGAL_APPROVED: 'true' };
  assert.ok(customerPortalConfiguration(production, { sendCode: context.sendCode }));
  for (const key of ['CUSTOMER_PORTAL_ENABLED', 'RELEASE', 'LEGAL_APPROVED']) assert.equal(customerPortalConfiguration({ ...production, [key]: 'false' }, { sendCode: context.sendCode }), null);
  for (const key of ['CUSTOMER_AUTH_SECRET', 'RATE_LIMIT_SECRET', 'CONTACT_HASH_SECRET']) assert.equal(customerPortalConfiguration({ ...production, [key]: 'weak' }, { sendCode: context.sendCode }), null);
  assert.equal(customerPortalConfiguration(production, {}), null);
  assert.equal((await call('/session', 'GET', undefined, {}, { context: {} })).status, 503);
  assert.equal(await handleCustomer(new Request('https://exactmec.com/'), {}, {}), null);
  assert.equal(await handleCustomer(new Request('https://exactmec.com/api/inquiries', { method: 'POST' }), {}, {}), null);
  const anonymous = await seed();
  assert.ok(anonymous.reference, 'anonymous inquiry did not require a customer cookie or login');
});

test('valid emails can sign in before an inquiry and see an empty account', async () => {
  const owner = await seed(); const unknown = email();
  const before = messages.length;
  await issue('  ' + owner.email.toUpperCase() + '  ');
  assert.equal(messages.length, before + 1);
  assert.equal(messages.at(-1).email, owner.email);
  assert.match(messages.at(-1).code, /^\d{6}$/);
  assert.equal(messages.at(-1).expiresMinutes, 10);
  const challenge = await issue(unknown);
  assert.equal(messages.length, before + 2);
  assert.equal(messages.at(-1).email, unknown);
  assert.equal((await call('/auth/verify-code', 'POST', { challenge, code: '000000' })).status, 400);
  const data = await (await call('/auth/verify-code', 'POST', { challenge, code: '000000' })).json();
  assert.deepEqual(data, { error: 'invalid_code' });
  const auth = await login(email());
  const list = await call('/inquiries', 'GET', undefined, { Cookie: auth.cookie });
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).items, []);
});

test('Google sign-in grants management only to the confirmed Google account, while email codes and other users remain customers', async () => {
  const googleEnv = { ...env, GOOGLE_CLIENT_ID: '468310030627-p3bp0m6vrk7r28m9v18ert436nrho8pr.apps.googleusercontent.com', GOOGLE_ADMIN_EMAIL: 'veryhappygou@gmail.com' };
  const credential = 'synthetic-google-credential-' + 'x'.repeat(120);
  const googleContext = address => ({ ...context, verifyGoogleIdToken: async () => ({ sub: address === 'veryhappygou@gmail.com' ? '123456789012345678901' : '987654321098765432109', email: address, email_verified: true }) });
  const admin = await call('/auth/google', 'POST', { credential }, {}, { env: googleEnv, context: googleContext('veryhappygou@gmail.com') });
  assert.equal(admin.status, 200, await admin.clone().text());
  assert.equal((await admin.clone().json()).canManage, true);
  const adminCookie = admin.headers.get('Set-Cookie').split(';')[0];
  const config = customerPortalConfiguration(googleEnv, context);
  assert.equal((await customerGoogleAdminActor(req('/manage/leads/', 'GET', undefined, { Cookie: adminCookie }), googleEnv, config))?.email, 'veryhappygou@gmail.com');
  const customer = await call('/auth/google', 'POST', { credential }, {}, { env: googleEnv, context: googleContext('other@gmail.com') });
  assert.equal(customer.status, 200);
  assert.equal((await customer.clone().json()).canManage, false);
  assert.equal(await customerGoogleAdminActor(req('/manage/leads/', 'GET', undefined, { Cookie: customer.headers.get('Set-Cookie').split(';')[0] }), googleEnv, config), null);
  const emailCode = await login('veryhappygou@gmail.com', { env: googleEnv });
  assert.equal(await customerGoogleAdminActor(req('/manage/leads/', 'GET', undefined, { Cookie: emailCode.cookie }), googleEnv, config), null);
  const session = await call('/session', 'GET', undefined, { Cookie: adminCookie }, { env: googleEnv });
  assert.equal((await session.json()).canManage, true);
  const unsafeExternal = await call('/auth/google', 'POST', { credential }, {}, { env: googleEnv, context: googleContext('outside@example.com') });
  assert.equal(unsafeExternal.status, 403);
  const forged = await call('/auth/google', 'POST', { credential }, {}, { env: googleEnv, context: { ...context, verifyGoogleIdToken: async () => { throw Error('invalid'); } } });
  assert.equal(forged.status, 401);
});

test('Google management page and API require the designated session without opening the Access-only admin path', async () => {
  const production = { ...env, SITE_ORIGIN: 'https://exactmec.com', RELEASE: 'true', LEGAL_APPROVED: 'true', CUSTOMER_PORTAL_ENABLED: 'true', CUSTOMER_EMAIL_ENABLED: 'true', CUSTOMER_EMAIL_FROM: 'sales@exactmec.com', CUSTOMER_EMAIL: { send: async () => ({ messageId: 'synthetic' }) }, GOOGLE_CLIENT_ID: '468310030627-p3bp0m6vrk7r28m9v18ert436nrho8pr.apps.googleusercontent.com', GOOGLE_ADMIN_EMAIL: 'veryhappygou@gmail.com', ADMIN_CSRF_SECRET: 'synthetic-admin-csrf-secret-minimum-32-characters', ASSETS: { fetch: async () => new Response('<html>Admin shell</html>', { headers: { 'Content-Type': 'text/html' } }) } };
  const raw = 'x'.repeat(43), cookie = `__Host-exactmec_customer=${raw}`;
  const subjectHash = await customerAuthHash(production, 'google-subject', '123456789012345678901');
  const emailHash = await customerEmailHash(production, 'veryhappygou@gmail.com');
  const tokenHash = await customerAuthHash(production, 'customer-session', `${production.SITE_ORIGIN}:${raw}`);
  const now = Date.now();
  await db.prepare('INSERT OR IGNORE INTO customer_google_identities(subject_hash,email_hash,created_at,last_used_at) VALUES(?,?,?,?)').bind(subjectHash,emailHash,now,now).run();
  await db.prepare("INSERT INTO customer_sessions(token_hash,email_hash,auth_provider,google_subject_hash,created_at,expires_at) VALUES(?,?,'google',?,?,?)").bind(tokenHash,emailHash,subjectHash,now,now+600000).run();
  const site = 'https://exactmec.com';
  const read = (path, headers = {}) => worker.fetch(new Request(site+path,{headers}),production);
  assert.equal((await read('/manage/leads/')).status,403);
  assert.equal((await read('/api/manage/session')).status,403);
  assert.equal((await read('/manage/leads/',{Cookie:cookie})).status,200);
  const session = await read('/api/manage/session',{Cookie:cookie});
  assert.equal(session.status,200,await session.clone().text());
  assert.equal((await session.json()).user.email,'veryhappygou@gmail.com');
  assert.equal((await read('/admin/leads/',{Cookie:cookie})).status,404);
});

test('verification rotates a random hashed session with isolated cookie and signed session-bound CSRF', async () => {
  const owner = await seed(); const auth = await login(owner.email);
  assert.deepEqual(Object.keys(auth.data).sort(), ['authenticated', 'csrfToken', 'expiresAt']);
  assert.equal(auth.data.authenticated, true);
  assert.ok(Date.parse(auth.data.expiresAt) > Date.now());
  assert.match(auth.fullCookie, new RegExp('^' + CUSTOMER_LOCAL_COOKIE + '='));
  assert.match(auth.fullCookie, /Path=\/; HttpOnly; SameSite=Lax; Max-Age=28800/);
  assert.doesNotMatch(auth.fullCookie, /Domain=|; Secure/);
  const session = await call('/session', 'GET', undefined, { Cookie: auth.cookie });
  assert.equal(session.status, 200);
  assert.equal(session.headers.get('Set-Cookie'), null);
  assert.equal(session.headers.get('Cache-Control'), 'no-store');
  const stored = await db.prepare('SELECT * FROM customer_sessions').all();
  const raw = auth.cookie.split('=')[1];
  assert.doesNotMatch(JSON.stringify(stored.results), new RegExp(raw));
  assert.ok(stored.results.every(row => /^[a-f0-9]{64}$/.test(row.token_hash) && /^[a-f0-9]{64}$/.test(row.email_hash)));
  const challengeHash = await customerAuthHash(env, 'customer-challenge', `${origin}:${auth.challenge}`);
  const challenge = await db.prepare('SELECT * FROM customer_auth_challenges WHERE challenge_hash=?').bind(challengeHash).first();
  assert.match(challenge.code_hash, /^[a-f0-9]{64}$/);
  assert.ok(!Object.values(challenge).includes(auth.code));
  assert.doesNotMatch(JSON.stringify(challenge), new RegExp(owner.email + '|' + auth.challenge));
});

test('production cookies are Secure __Host cookies and never accept the development cookie', async () => {
  const owner = await seed();
  const productionEnv = { ...env, SITE_ORIGIN: 'https://exactmec.com', CUSTOMER_PORTAL_ENABLED: 'true', RELEASE: 'true', LEGAL_APPROVED: 'true' };
  const options = { env: productionEnv, context: { sendCode: context.sendCode }, origin: productionEnv.SITE_ORIGIN };
  const auth = await login(owner.email, options);
  assert.match(auth.fullCookie, new RegExp('^' + CUSTOMER_COOKIE + '='));
  assert.match(auth.fullCookie, /; Secure$/);
  assert.doesNotMatch(auth.fullCookie, /Domain=/);
  assert.equal((await call('/session', 'GET', undefined, { Cookie: auth.cookie }, options)).status, 200);
  assert.equal((await call('/session', 'GET', undefined, { Cookie: auth.cookie.replace(CUSTOMER_COOKIE, CUSTOMER_LOCAL_COOKIE) }, options)).status, 401);
  const localOwner = await seed(); const localAuth = await login(localOwner.email);
  assert.equal((await call('/session', 'GET', undefined, { Cookie: localAuth.cookie.replace(CUSTOMER_LOCAL_COOKIE, CUSTOMER_COOKIE) }, options)).status, 401, 'renaming a development cookie cannot migrate its session to production');
  const localChallengeOwner = await seed(); const localChallenge = await issue(localChallengeOwner.email); const localCode = messages.at(-1).code;
  assert.equal((await call('/auth/verify-code', 'POST', { challenge: localChallenge, code: localCode }, {}, options)).status, 400, 'development OTP cannot authenticate a production session');
});

test('customers see only their own safe submitted fields/status and cannot read or mutate another customer reference', async () => {
  const owner = await seed(); const other = await seed(); const second = await seed(owner.email, 'second');
  const privateReview = { status: 'Reviewing', authenticity: 'Consistent', qualification: 'Qualified', priority: 'A', owner: 'PRIVATE-ADMIN-NOTE' };
  await db.prepare('UPDATE leads SET review_json=? WHERE reference=?').bind(JSON.stringify(privateReview), owner.reference).run();
  const auth = await login(owner.email);
  const list = await (await call('/inquiries', 'GET', undefined, { Cookie: auth.cookie })).json();
  assert.equal(list.total, 2);
  assert.deepEqual(list.items.map(item => item.reference).sort(), [owner.reference, second.reference].sort());
  assert.doesNotMatch(JSON.stringify(list), /PRIVATE-ADMIN-NOTE|PRIVATE-INTERNAL-SOURCE|qualification|source|notification|consents|history|suppression|email_hash|token_hash/);
  const detail = await (await call('/inquiries/' + owner.reference, 'GET', undefined, { Cookie: auth.cookie })).json();
  assert.equal(detail.inquiry.status, 'under_review');
  assert.equal(detail.inquiry.submitted.email, owner.email);
  assert.equal(detail.inquiry.revision, 1);
  assert.equal((await call('/inquiries/' + other.reference, 'GET', undefined, { Cookie: auth.cookie })).status, 404);
  const headers = { Cookie: auth.cookie, 'X-CSRF-Token': auth.data.csrfToken };
  assert.equal((await call('/inquiries/' + other.reference + '/supplements', 'POST', { revision: 1, note: 'Unauthorized' }, headers)).status, 404);
  assert.equal((await call('/inquiries/' + other.reference + '/withdraw', 'POST', { revision: 1 }, headers)).status, 404);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM customer_supplements WHERE reference=?').bind(other.reference).first()).n, 0);
});

test('customer drawings stay private; supplemental uploads are immutable and visible to the owner', async () => {
  const owner = await seed(), stranger = await seed();
  const auth = await login(owner.email), otherAuth = await login(stranger.email);
  const stored = new Map();
  env.INQUIRY_FILES = {
    put: async (key, bytes) => { stored.set(key, new Uint8Array(bytes)); },
    get: async key => stored.has(key) ? { body: new Blob([stored.get(key)]).stream(), size: stored.get(key).byteLength } : null,
    delete: async key => { stored.delete(key); },
  };
  const original = { name: 'original.step', size: 8, extension: 'step' };
  const payload = { ...owner.payload, files: [original] };
  await db.prepare('UPDATE leads SET payload_json=? WHERE reference=?').bind(JSON.stringify(payload), owner.reference).run();
  await env.INQUIRY_FILES.put(`inquiries/${owner.reference}/0`, new TextEncoder().encode('original').buffer);
  const headers = { Cookie: auth.cookie, 'X-CSRF-Token': auth.data.csrfToken };
  const ownOriginal = await call(`/inquiries/${owner.reference}/files/0`, 'GET', undefined, { Cookie: auth.cookie });
  assert.equal(ownOriginal.status, 200); assert.equal(await ownOriginal.text(), 'original');
  assert.equal((await call(`/inquiries/${owner.reference}/files/0`, 'GET', undefined, { Cookie: otherAuth.cookie })).status, 404);
  const form = new FormData(); form.set('revision', '1'); form.set('file', new File(['new drawing'], 'revision.stp'));
  const request = new Request(`${origin}/api/customer/inquiries/${owner.reference}/files`, { method: 'POST', headers: { Origin: origin, ...headers }, body: form });
  const upload = await handleCustomer(request, env, context);
  assert.equal(upload.status, 201, await upload.clone().text());
  const result = (await upload.json()).inquiry;
  assert.equal(result.files[0].name, 'original.step');
  assert.equal(result.extra_files.length, 1);
  assert.equal(result.extra_files[0].name, 'revision.stp');
  const filePath = `/inquiries/${owner.reference}/supplemental-files/${result.extra_files[0].id}`;
  assert.equal((await call(filePath, 'GET', undefined, { Cookie: otherAuth.cookie })).status, 404);
  const ownExtra = await call(filePath, 'GET', undefined, { Cookie: auth.cookie });
  assert.equal(ownExtra.status, 200); assert.equal(await ownExtra.text(), 'new drawing');
  env.CUSTOMER_SCHEMA_READY = 'true';
  const admin = await handleBusiness(new Request(`${origin}/api/admin/leads/${owner.reference}`, { headers: {} }), env, { actor: { id: 'synthetic-admin' } });
  assert.equal(admin.status, 200); assert.equal((await admin.json()).lead.customer.files[0].name, 'revision.stp');
  const stale = new FormData(); stale.set('revision', '1'); stale.set('file', new File(['stale'], 'stale.step'));
  assert.equal((await handleCustomer(new Request(`${origin}/api/customer/inquiries/${owner.reference}/files`, { method: 'POST', headers: { Origin: origin, ...headers }, body: stale }), env, context)).status, 409);
  const removal = await handleBusiness(new Request(`${origin}/api/admin/leads/${owner.reference}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 1, confirmation: owner.reference }) }), env, { actor: { id: 'synthetic-admin' } });
  assert.equal(removal.status, 204);
  assert.equal(stored.size, 0);
  delete env.INQUIRY_FILES;
  delete env.CUSTOMER_SCHEMA_READY;
});

test('writes require exact origin and session-bound CSRF; spoofed headers and duplicate cookies are rejected', async () => {
  const owner = await seed(); const another = await seed(); const auth = await login(owner.email); const otherAuth = await login(another.email);
  const path = '/inquiries/' + owner.reference + '/supplements';
  assert.equal((await call(path, 'POST', { revision: 1, note: 'Synthetic note' }, { Cookie: auth.cookie })).status, 403);
  assert.equal((await call(path, 'POST', { revision: 1, note: 'Synthetic note' }, { Cookie: auth.cookie, 'X-CSRF-Token': otherAuth.data.csrfToken })).status, 403);
  assert.equal((await call(path, 'POST', { revision: 1, note: 'Synthetic note' }, { Cookie: auth.cookie, 'X-CSRF-Token': auth.data.csrfToken, Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await call('/session', 'GET', undefined, { Cookie: auth.cookie, 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await call('/session', 'GET', undefined, { Cookie: auth.cookie + '; ' + auth.cookie })).status, 401);
  assert.equal((await call('/session', 'GET', undefined, { 'Cf-Access-Authenticated-User-Email': owner.email })).status, 401);
  assert.equal((await call('/session?email=' + owner.email, 'GET', undefined, { Cookie: auth.cookie })).status, 403);
});

test('codes expire, lock after five atomic attempts and cannot be replayed', async () => {
  const owner = await seed(); const challenge = await issue(owner.email); const code = messages.at(-1).code;
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await call('/auth/verify-code', 'POST', { challenge, code: 'invalid' })).status, 400);
  const locked = await db.prepare('SELECT attempts,consumed_at FROM customer_auth_challenges WHERE challenge_hash=?').bind(await customerAuthHash(env, 'customer-challenge', `${origin}:${challenge}`)).first();
  assert.equal(locked.attempts, 5); assert.ok(locked.consumed_at);
  assert.equal((await call('/auth/verify-code', 'POST', { challenge, code })).status, 400);
  const expiring = await seed(); const expiryChallenge = await issue(expiring.email); const expiryCode = messages.at(-1).code;
  await db.prepare('UPDATE customer_auth_challenges SET expires_at=? WHERE challenge_hash=?').bind(Date.now() - 1, await customerAuthHash(env, 'customer-challenge', `${origin}:${expiryChallenge}`)).run();
  assert.equal((await call('/auth/verify-code', 'POST', { challenge: expiryChallenge, code: expiryCode })).status, 400);
  const fresh = await seed(); const auth = await login(fresh.email);
  const replay = await call('/auth/verify-code', 'POST', { challenge: auth.challenge, code: auth.code });
  assert.equal(replay.status, 400); assert.equal(replay.headers.get('Set-Cookie'), null);
});

test('concurrent successful code consumption creates only one session; provider failure cannot issue a session', async () => {
  const owner = await seed(); const challenge = await issue(owner.email); const code = messages.at(-1).code;
  const responses = await Promise.all([call('/auth/verify-code', 'POST', { challenge, code }), call('/auth/verify-code', 'POST', { challenge, code })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
  const hash = await customerEmailHash(env, owner.email);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM customer_sessions WHERE email_hash=?').bind(hash).first()).n, 1);
  const failedOwner = await seed(); let failedCode;
  const failedContext = { ...context, sendCode: async message => { failedCode = message.code; throw new Error('PRIVATE provider failure'); } };
  const failedChallenge = await issue(failedOwner.email, {}, { context: failedContext });
  const failedVerify = await call('/auth/verify-code', 'POST', { challenge: failedChallenge, code: failedCode });
  assert.equal(failedVerify.status, 400); assert.doesNotMatch(await failedVerify.text(), /PRIVATE|provider/);
});

test('email/IP issuance limits are generic and hashed, verify-IP flood is bounded', async () => {
  const owner = await seed(); const before = messages.length;
  await issue(owner.email); await issue(owner.email); await issue(owner.email);
  assert.equal(messages.length, before + 1, 'rolling email cooldown prevents repeated sends');
  for (let index = 0; index < 14; index++) await issue(email(), { 'CF-Connecting-IP': '192.0.2.252' });
  for (let index = 0; index < 50; index++) assert.equal((await call('/auth/verify-code', 'POST', { challenge: 'invalid', code: '000000' }, { 'CF-Connecting-IP': '192.0.2.253' })).status, 400);
  const throttled = await call('/auth/verify-code', 'POST', { challenge: 'invalid', code: '000000' }, { 'CF-Connecting-IP': '192.0.2.253' });
  assert.equal(throttled.status, 429); assert.ok(Number(throttled.headers.get('Retry-After')) > 0);
  const buckets = await db.prepare('SELECT * FROM customer_rate_buckets').all();
  assert.doesNotMatch(JSON.stringify(buckets.results), /192\.0\.2|@example|synthetic-customer/);
  assert.ok(buckets.results.every(row => /^[a-f0-9]{64}$/.test(row.bucket_hash)));
});

test('supplements are immutable, optimistic, scoped and withdrawal leaves original payload/consent untouched', async () => {
  const owner = await seed(); const auth = await login(owner.email);
  const headers = { Cookie: auth.cookie, 'X-CSRF-Token': auth.data.csrfToken };
  const original = await db.prepare('SELECT payload_json,review_json,revision FROM leads WHERE reference=?').bind(owner.reference).first();
  const path = '/inquiries/' + owner.reference;
  const responses = await Promise.all(['First synthetic note', 'Second synthetic note'].map(note => call(path + '/supplements', 'POST', { revision: 1, note }, headers)));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const current = (await (await call(path, 'GET', undefined, headers)).json()).inquiry;
  assert.equal(current.revision, 2); assert.equal(current.supplements.length, 1);
  assert.equal((await call(path + '/supplements', 'POST', { revision: 2, note: 'x'.repeat(4001) }, headers)).status, 422);
  assert.equal((await call(path + '/withdraw', 'POST', { revision: 1 }, headers)).status, 409);
  const withdrawn = await call(path + '/withdraw', 'POST', { revision: 2 }, headers);
  assert.equal(withdrawn.status, 200);
  const value = (await withdrawn.json()).inquiry;
  assert.equal(value.withdrawn, true); assert.equal(value.status, 'withdrawn'); assert.equal(value.revision, 3); assert.ok(value.withdrawn_at);
  assert.equal((await call(path + '/supplements', 'POST', { revision: 3, note: 'After withdrawal' }, headers)).status, 409);
  assert.deepEqual(await db.prepare('SELECT payload_json,review_json,revision FROM leads WHERE reference=?').bind(owner.reference).first(), original);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM consent_receipts WHERE reference=?').bind(owner.reference).first()).n, 1);
  const history = await db.prepare('SELECT action,note FROM lead_history WHERE reference=?').bind(owner.reference).all();
  assert.ok(history.results.some(item => item.action === 'customer_withdrawn'));
  assert.ok(history.results.filter(item => item.action.startsWith('customer_')).every(item => item.note === ''));
});

test('owner deletion cascades inquiry data but the verified account remains available', async () => {
  const owner = await seed(); const auth = await login(owner.email);
  const headers = { Cookie: auth.cookie, 'X-CSRF-Token': auth.data.csrfToken };
  const path = '/inquiries/' + owner.reference;
  assert.equal((await call(path + '/supplements', 'POST', { revision: 1, note: 'Delete cascade synthetic note' }, headers)).status, 201);
  await db.prepare('DELETE FROM leads WHERE reference=?').bind(owner.reference).run();
  for (const table of ['customer_supplements', 'customer_inquiry_state']) assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE reference=?`).bind(owner.reference).first()).n, 0);
  assert.equal((await call(path + '/supplements', 'POST', { revision: 2, note: 'Must not resurrect' }, headers)).status, 404);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM leads WHERE reference=?').bind(owner.reference).first()).n, 0);
  assert.equal((await call('/session', 'GET', undefined, headers)).status, 200);
});

test('supplement cap bounds detail responses atomically while list omits note bodies and withdrawal still works', async () => {
  const owner = await seed(); const auth = await login(owner.email);
  const headers = { Cookie: auth.cookie, 'X-CSRF-Token': auth.data.csrfToken };
  const path = '/inquiries/' + owner.reference;
  await db.batch(Array.from({ length: 99 }, (_, index) => db.prepare('INSERT INTO customer_supplements(id,reference,note,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(), owner.reference, 'Synthetic seeded note ' + index, new Date().toISOString())));
  const results = await Promise.all(['Cap synthetic A', 'Cap synthetic B'].map(note => call(path + '/supplements', 'POST', { revision: 1, note }, headers)));
  assert.deepEqual(results.map(response => response.status).sort(), [201, 409]);
  const detail = (await (await call(path, 'GET', undefined, headers)).json()).inquiry;
  assert.equal(detail.supplements.length, 100);
  const capped = await call(path + '/supplements', 'POST', { revision: detail.revision, note: 'Over cap' }, headers);
  assert.equal(capped.status, 409); assert.equal((await capped.json()).error, 'supplement_limit');
  const list = await (await call('/inquiries', 'GET', undefined, headers)).json();
  assert.equal(list.items[0].supplements.length, 0, 'list does not expand every private note body');
  assert.equal((await call(path + '/withdraw', 'POST', { revision: detail.revision }, headers)).status, 200);
});

test('logout revokes the exact session, clears its cookie and expired sessions cannot be reused', async () => {
  const owner = await seed(); const auth = await login(owner.email);
  const headers = { Cookie: auth.cookie, 'X-CSRF-Token': auth.data.csrfToken };
  const response = await call('/logout', 'POST', {}, headers);
  assert.equal(response.status, 204); assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal((await call('/session', 'GET', undefined, headers)).status, 401);
  const expiring = await seed(); const expired = await login(expiring.email);
  const raw = expired.cookie.split('=')[1];
  await db.prepare('UPDATE customer_sessions SET expires_at=? WHERE token_hash=?').bind(Date.now() - 1, await customerAuthHash(env, 'customer-session', `${origin}:${raw}`)).run();
  assert.equal((await call('/session', 'GET', undefined, { Cookie: expired.cookie })).status, 401);
});

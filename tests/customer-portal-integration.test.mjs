import noticeVersions from '../src/data/notice-versions.json' with {type:'json'};
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleCustomer, customerPortalConfiguration } from '../backend/customer.mjs';
import { handleBusiness } from '../backend/business.mjs';
import { createCustomerClient } from '../src/customer/client.mjs';
import { buildInquiryPayload, initialValues } from '../src/inquiry/model.mjs';
import { createApiHandler, secureApi } from '../backend/router.mjs';
import worker from '../cloudflare/worker.mjs';

const origin = 'http://127.0.0.1:4197';
let mf, DB, env, deliveries;
const emailA = 'customer-a@example.com', emailB = 'customer-b@example.com';
const context = () => ({ localSynthetic: true, sendCode: async value => { deliveries.push(value); return { accepted: true }; } });
function req(path, method = 'GET', body, headers = {}) {
  return new Request(origin + path, { method, headers: { ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), 'CF-Connecting-IP': '192.0.2.199', ...headers }, ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}) });
}
const call = (path, method, body, headers, configuration = env, ctx = context()) => handleCustomer(req(path, method, body, headers), configuration, ctx);
async function lead(email = emailA) {
  const values = { ...initialValues(), name: 'Synthetic portal buyer', company: 'Synthetic buyer company', email, phone: '+1 202 555 0140', country: 'United States', city: 'Synthetic city', component: 'Synthetic housing', description: 'Synthetic portal ownership check.', drawing_status: 'Clear 2D part drawings', processing: true, whatsapp: false };
  const response = await handleBusiness(req('/api/inquiries', 'POST', buildInquiryPayload(values), { 'Idempotency-Key': crypto.randomUUID(), 'CF-Connecting-IP': crypto.randomUUID() }), env, { localSynthetic: true });
  assert.equal(response.status, 201);
  return (await response.json()).reference;
}
async function challenge(email = emailA, ctx = context(), headers = {}) {
  const response = await call('/api/customer/auth/request-code', 'POST', { email }, headers, env, ctx);
  assert.equal(response.status, 202);
  const data = await response.json();
  assert.equal(data.accepted, true);
  assert.match(data.challenge, /^[A-Za-z0-9_-]{16,512}$/);
  assert.deepEqual(Object.keys(data).sort(), ['accepted', 'challenge']);
  return { challenge: data.challenge, code: deliveries.at(-1)?.code };
}
async function login(email = emailA) {
  const auth = await challenge(email);
  const response = await call('/api/customer/auth/verify-code', 'POST', auth);
  assert.equal(response.status, 200);
  const data = await response.json(), cookie = response.headers.get('Set-Cookie');
  assert.ok(cookie);
  return { cookie: cookie.split(';')[0], fullCookie: cookie, csrf: data.csrfToken, data };
}

before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("synthetic-only")}}', compatibilityDate: '2026-10-01', d1Databases: { DB: 'customer-independent-integration' } }));
  DB = await mf.getD1Database('DB');
  for (const filename of ['0001_inquiries.sql', '0006_customer_portal.sql']) {
    const sql = await fs.readFile(new URL('../migrations/' + filename, import.meta.url), 'utf8');
    await DB.batch(sql.split(';').map(value => value.trim()).filter(Boolean).map(value => DB.prepare(value)));
  }
  env = { DB, SITE_ORIGIN: origin, CUSTOMER_AUTH_SECRET: 'synthetic-customer-auth-secret-at-least-32', RATE_LIMIT_SECRET: 'synthetic-customer-rate-secret-at-least-32', CONTACT_HASH_SECRET: 'synthetic-customer-contact-secret-at-least-32', NOTICE_VERSION: noticeVersions.notice_version, PRIVACY_VERSION: noticeVersions.privacy_version, PROCESSING_BASIS: noticeVersions.privacy_processing_basis, WHATSAPP_NOTICE_VERSION: noticeVersions.whatsapp_choice_text_version };
});
beforeEach(async () => {
  deliveries = [];
  const tables = (await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'customer_%'").all()).results.map(row => row.name);
  await DB.batch([...tables.map(name => DB.prepare('DELETE FROM "' + name + '"')), DB.prepare('DELETE FROM leads'), DB.prepare('DELETE FROM rate_buckets')]);
});
after(async () => { await mf?.dispose(); });

test('portal is closed by default; environment/header cannot turn on synthetic mode or weaken configured secrets', async () => {
  assert.equal(customerPortalConfiguration(env, {}), null);
  const response = await call('/api/customer/auth/request-code', 'POST', { email: emailA }, { 'X-Local-Synthetic': 'true' }, { ...env, LOCAL_SYNTHETIC: true }, {});
  assert.equal(response.status, 503);
  assert.equal(deliveries.length, 0);
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal((await call('/api/customer/session', 'GET', undefined, {}, { ...env, CUSTOMER_AUTH_SECRET: 'short' })).status, 503);
  assert.equal((await handleCustomer(new Request('https://exactmec.com/api/customer/session'), { ...env, SITE_ORIGIN: 'https://exactmec.com' }, { localSynthetic: true })).status, 503);
});

test('anonymous RFQ remains independent of optional portal login and stores no automatic account cookie', async () => {
  const reference = await lead();
  assert.match(reference, /^EM_[a-f0-9]{32}$/);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM leads').first()).n, 1);
  const response = await call('/api/customer/session');
  assert.equal(response.status, 401);
});

test('challenge response is generic for lead-owning and new email addresses and never exposes codes or database ownership', async () => {
  await lead();
  const existing = await challenge(emailA);
  const count = deliveries.length;
  const unknown = await challenge(emailB);
  assert.notEqual(existing.challenge, unknown.challenge);
  assert.match(existing.code, /^\d{6}$/);
  assert.equal(deliveries.length, count, 'unknown email does not cause a login email');
  const tables = (await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'customer_%'").all()).results;
  for (const { name } of tables) {
    const rows = (await DB.prepare('SELECT * FROM "' + name + '"').all()).results;
    assert.doesNotMatch(JSON.stringify(rows), new RegExp(existing.code + '|customer-a@example|customer-b@example'));
  }
});

test('real frontend client reaches own inquiry through cookie-backed API without exposing internal notes or another customer', async () => {
  const refA = await lead(emailA), refB = await lead(emailB);
  await DB.prepare("UPDATE leads SET review_json=json_set(review_json,'$.priority','A','$.authenticity','Inconsistent','$.owner','Synthetic internal owner') WHERE reference=?").bind(refA).run();
  let cookie;
  const client = createCustomerClient({ fetchImpl: async (path, options) => {
    assert.ok(path.startsWith('/api/customer/'));
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.redirect, 'error');
    assert.ok(!path.includes('?'));
    const headers = new Headers(options.headers);
    if (options.method !== 'GET') headers.set('Origin', origin);
    if (cookie) headers.set('Cookie', cookie);
    headers.set('CF-Connecting-IP', '192.0.2.199');
    const response = await handleCustomer(new Request(origin + path, { ...options, headers }), env, context());
    if (response.headers.has('Set-Cookie')) cookie = response.headers.get('Set-Cookie').split(';')[0];
    return response;
  } });
  await client.requestCode(emailA);
  await client.verifyCode(deliveries.at(-1).code);
  const list = await client.list();
  assert.equal(list.total, 1);
  assert.equal(list.items[0].reference, refA);
  assert.doesNotMatch(JSON.stringify(list), /Inconsistent|Synthetic internal owner|authenticity|qualification|priority|review_json|source|notification/);
  await assert.rejects(client.get(refB), error => error.kind === 'not_found');
  const original = await client.get(refA);
  const changed = await client.supplement(refA, { revision: original.revision, note: 'Synthetic updated requirement.' });
  assert.equal(changed.supplements.at(-1).note, 'Synthetic updated requirement.');
  assert.equal(changed.revision, original.revision + 1);
  const withdrawn = await client.withdraw(refA, { revision: changed.revision });
  assert.equal(withdrawn.withdrawn, true);
  await client.logout();
  await assert.rejects(client.session(), error => error.kind === 'expired');
  client.destroy();
});

test('cross-customer read/write and forged identity are indistinguishable from an unavailable inquiry', async () => {
  await lead(emailA);
  const refB = await lead(emailB), session = await login(emailA);
  const headers = { Cookie: session.cookie, 'X-CSRF-Token': session.csrf };
  const missing = 'EM_' + 'f'.repeat(32);
  for (const [suffix, method, body] of [['', 'GET', undefined], ['/supplements', 'POST', { revision: 1, note: 'Synthetic attack' }], ['/withdraw', 'POST', { revision: 1 }]]) {
    const other = await call('/api/customer/inquiries/' + refB + suffix, method, body, headers);
    const absent = await call('/api/customer/inquiries/' + missing + suffix, method, body, headers);
    assert.equal(other.status, 404);
    assert.equal(absent.status, 404);
    assert.deepEqual(await other.json(), await absent.json());
  }
  const ownEmailSpoof = await call('/api/customer/inquiries', 'GET', undefined, { 'X-Customer-Email': emailB, 'X-Customer-Id': 'forged', Cookie: session.cookie });
  assert.doesNotMatch(await ownEmailSpoof.text(), new RegExp(refB));
});

test('session cookie remains HttpOnly, same-site and scoped; mutations require same-origin CSRF and logout revokes it', async () => {
  const reference = await lead(), session = await login();
  assert.match(session.fullCookie, /HttpOnly/i);
  assert.match(session.fullCookie, /SameSite=(?:Lax|Strict)/i);
  assert.match(session.fullCookie, /Path=\//i);
  assert.doesNotMatch(session.fullCookie, /Domain=/i);
  const path = '/api/customer/inquiries/' + reference + '/supplements', body = { revision: 1, note: 'Synthetic CSRF attempt' };
  for (const headers of [{ Cookie: session.cookie }, { Cookie: session.cookie, 'X-CSRF-Token': 'invalid' }, { Cookie: session.cookie, 'X-CSRF-Token': session.csrf, Origin: 'https://other.example' }, { Cookie: session.cookie, 'X-CSRF-Token': session.csrf, 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await call(path, 'POST', body, headers)).status, 403);
  const logout = await call('/api/customer/logout', 'POST', {}, { Cookie: session.cookie, 'X-CSRF-Token': session.csrf });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/i);
  assert.equal((await call('/api/customer/session', 'GET', undefined, { Cookie: session.cookie })).status, 401);
});

test('verification consumes a challenge exactly once even under a race', async () => {
  await lead();
  const body = await challenge();
  const responses = await Promise.all([call('/api/customer/auth/verify-code', 'POST', body), call('/api/customer/auth/verify-code', 'POST', body)]);
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.equal(responses.filter(response => response.status !== 200 && !response.headers.has('Set-Cookie')).length, 1);
  const replay = await call('/api/customer/auth/verify-code', 'POST', body);
  assert.notEqual(replay.status, 200);
  assert.equal(replay.headers.get('Set-Cookie'), null);
});

test('wrong-code attempts permanently exhaust a challenge without exposing delivery errors', async () => {
  await lead();
  const auth = await challenge();
  const wrong = auth.code === '000000' ? '000001' : '000000';
  for (let attempt = 0; attempt < 5; attempt++) assert.notEqual((await call('/api/customer/auth/verify-code', 'POST', { challenge: auth.challenge, code: wrong })).status, 200);
  assert.notEqual((await call('/api/customer/auth/verify-code', 'POST', auth)).status, 200);
  await lead(emailB);
  const failed = await challenge(emailB, { localSynthetic: true, sendCode: async () => { throw new Error('Synthetic provider private failure'); } });
  const response = await call('/api/customer/auth/verify-code', 'POST', { challenge: failed.challenge, code: '000000' });
  assert.notEqual(response.status, 200);
  assert.doesNotMatch(await response.text(), /provider|failure|customer-b@example/);
});

test('production cookie is a secure host cookie and never accepts the local test cookie', async () => {
  await lead();
  const development = await login();
  await DB.prepare('DELETE FROM customer_rate_buckets').run();
  const production = { ...env, SITE_ORIGIN: 'https://exactmec.com', CUSTOMER_PORTAL_ENABLED: true, RELEASE: true, LEGAL_APPROVED: true };
  const post = (path, body) => handleCustomer(new Request('https://exactmec.com' + path, { method: 'POST', headers: { Origin: 'https://exactmec.com', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.201' }, body: JSON.stringify(body) }), production, { sendCode: context().sendCode });
  const issued = await (await post('/api/customer/auth/request-code', { email: emailA })).json();
  const verified = await post('/api/customer/auth/verify-code', { challenge: issued.challenge, code: deliveries.at(-1).code });
  assert.equal(verified.status, 200);
  const cookie = verified.headers.get('Set-Cookie');
  assert.match(cookie, /^__Host-exactmec_customer=[A-Za-z0-9_-]{43};/);
  assert.match(cookie, /; Secure(?:;|$)/);
  assert.match(cookie, /; HttpOnly(?:;|$)/);
  assert.match(cookie, /; Path=\/(?:;|$)/);
  assert.doesNotMatch(cookie, /Domain=/i);
  const localName = cookie.split(';')[0].replace('__Host-exactmec_customer=', 'exactmec_customer_dev=');
  const spoofed = await handleCustomer(new Request('https://exactmec.com/api/customer/session', { headers: { Cookie: localName } }), production, { sendCode: context().sendCode });
  assert.equal(spoofed.status, 401);
  const renamedDevelopmentCookie = development.cookie.replace('exactmec_customer_dev=', '__Host-exactmec_customer=');
  const transplanted = await handleCustomer(new Request('https://exactmec.com/api/customer/session', { headers: { Cookie: renamedDevelopmentCookie } }), production, { sendCode: context().sendCode });
  assert.equal(transplanted.status, 401, 'even a renamed development cookie cannot migrate a session to production');
  await DB.prepare('DELETE FROM customer_rate_buckets').run();
  const developmentChallenge = await challenge();
  const migratedCode = await post('/api/customer/auth/verify-code', developmentChallenge);
  assert.notEqual(migratedCode.status, 200, 'OTP challenges are bound to the origin too');
  assert.equal(migratedCode.headers.get('Set-Cookie'), null);
});

test('expired challenges and sessions are rejected and purged without extending their lifetime', async () => {
  await lead();
  const auth = await challenge();
  await DB.prepare('UPDATE customer_auth_challenges SET expires_at=?').bind(Date.now() - 1).run();
  assert.notEqual((await call('/api/customer/auth/verify-code', 'POST', auth)).status, 200);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM customer_auth_challenges').first()).n, 0);
  await DB.prepare('DELETE FROM customer_rate_buckets').run();
  const session = await login();
  await DB.prepare('UPDATE customer_sessions SET expires_at=?').bind(Date.now() - 1).run();
  assert.equal((await call('/api/customer/session', 'GET', undefined, { Cookie: session.cookie })).status, 401);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM customer_sessions').first()).n, 0);
  await DB.prepare('DELETE FROM customer_rate_buckets').run();
  const older = await challenge();
  await DB.prepare('DELETE FROM customer_rate_buckets').run();
  const replacement = await challenge();
  assert.notEqual((await call('/api/customer/auth/verify-code', 'POST', older)).status, 200, 'requesting a replacement invalidates the older OTP');
  assert.equal((await call('/api/customer/auth/verify-code', 'POST', replacement)).status, 200);
});

test('concurrent email code requests reserve one cooldown and verify endpoint enforces IP attempt limit', async () => {
  await lead();
  const issued = await Promise.all(Array.from({ length: 5 }, (_, index) => call('/api/customer/auth/request-code', 'POST', { email: emailA }, { 'CF-Connecting-IP': '192.0.2.' + (210 + index) })));
  assert.ok(issued.every(response => response.status === 202));
  assert.equal(deliveries.length, 1);
  for (let i = 0; i < 50; i++) assert.equal((await call('/api/customer/auth/verify-code', 'POST', { challenge: 'unknown', code: '000000' })).status, 400);
  const limited = await call('/api/customer/auth/verify-code', 'POST', { challenge: 'unknown', code: '000000' });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('Retry-After')) > 0);
});

test('customer supplements and withdrawal preserve original payload, admin review and consent; deleting lead cascades customer records', async () => {
  const reference = await lead(), session = await login();
  const before = await DB.prepare('SELECT payload_json,review_json,revision FROM leads WHERE reference=?').bind(reference).first();
  const consent = await DB.prepare('SELECT receipt_json FROM consent_receipts WHERE reference=?').bind(reference).first();
  const headers = { Cookie: session.cookie, 'X-CSRF-Token': session.csrf };
  const supplemented = await call('/api/customer/inquiries/' + reference + '/supplements', 'POST', { revision: 1, note: 'Synthetic supplemental note.' }, headers);
  assert.equal(supplemented.status, 201);
  const version = (await supplemented.json()).inquiry.revision;
  assert.equal((await call('/api/customer/inquiries/' + reference + '/withdraw', 'POST', { revision: version }, headers)).status, 200);
  assert.deepEqual(await DB.prepare('SELECT payload_json,review_json,revision FROM leads WHERE reference=?').bind(reference).first(), before);
  assert.deepEqual(await DB.prepare('SELECT receipt_json FROM consent_receipts WHERE reference=?').bind(reference).first(), consent);
  const tables = (await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'customer_%'").all()).results;
  await DB.prepare('DELETE FROM leads WHERE reference=?').bind(reference).run();
  for (const { name } of tables) {
    const columns = (await DB.prepare('PRAGMA table_info("' + name + '")').all()).results;
    if (columns.some(column => column.name === 'reference')) assert.equal((await DB.prepare('SELECT count(*) AS n FROM "' + name + '" WHERE reference=?').bind(reference).first()).n, 0, name);
  }
  assert.notEqual((await call('/api/customer/inquiries/' + reference, 'GET', undefined, { Cookie: session.cookie })).status, 200);
});

test('actual API router keeps customer auth cookies while stripping cookies from other API responses', async () => {
  const api = createApiHandler({ localSynthetic: true, authenticate: async () => null, sendCustomerCode: context().sendCode });
  const values = { ...initialValues(), name: 'Synthetic router buyer', company: 'Synthetic router company', email: emailA, phone: '+1 202 555 0140', country: 'United States', city: 'Synthetic city', component: 'Synthetic housing', description: 'Synthetic no-login router inquiry.', drawing_status: 'A physical sample', processing: true, whatsapp: false };
  const saved = await api(req('/api/inquiries', 'POST', buildInquiryPayload(values), { 'Idempotency-Key': crypto.randomUUID() }), env);
  assert.equal(saved.status, 201);
  assert.equal(saved.headers.get('Set-Cookie'), null);
  const challengeResponse = await api(req('/api/customer/auth/request-code', 'POST', { email: emailA }), env);
  assert.equal(challengeResponse.status, 202);
  const issued = await challengeResponse.json();
  const verified = await api(req('/api/customer/auth/verify-code', 'POST', { challenge: issued.challenge, code: deliveries.at(-1).code }), env);
  assert.equal(verified.status, 200);
  const cookie = verified.headers.get('Set-Cookie');
  assert.match(cookie, /^exactmec_customer_dev=/);
  assert.equal(verified.headers.get('Cache-Control'), 'no-store');
  assert.equal(verified.headers.get('X-Robots-Tag'), 'noindex,nofollow');
  assert.equal(verified.headers.get('Access-Control-Allow-Origin'), null);
  const admin = await api(req('/api/admin/session', 'GET', undefined, { Cookie: cookie.split(';')[0] }), env);
  assert.equal(admin.status, 403, 'customer session is never an admin identity');
  const stripped = secureApi(new Response('{}', { headers: { 'Set-Cookie': cookie, 'Access-Control-Allow-Origin': '*' } }));
  assert.equal(stripped.headers.get('Set-Cookie'), null);
  assert.equal(stripped.headers.get('Access-Control-Allow-Origin'), null);
});

test('actual Worker isolates customer routes and admin login from marketing and never serves cookies from static assets', async () => {
  const assets = { async fetch(request) {
    const path = new URL(request.url).pathname;
    const files = { '/index.html': '<h1>Synthetic marketing</h1>', '/account/index.html': '<!doctype html><html><head><meta name="robots" content="noindex,nofollow"></head><body><h1>Synthetic customer workspace</h1></body></html>', '/404.html': '<h1>Not found</h1>', '/sitemap.xml': '<urlset><url><loc>https://exactmec.com/</loc></url></urlset>' };
    return new Response(files[path] || 'Missing', { status: files[path] ? 200 : 404, headers: { 'Content-Type': path.endsWith('.xml') ? 'application/xml' : 'text/html', 'Set-Cookie': '__Host-exactmec_customer=untrusted; Path=/; Secure; HttpOnly; SameSite=Lax' } });
  } };
  const configuration = { ASSETS: assets, SITE_ORIGIN: 'https://exactmec.com', RELEASE: true };
  for (const path of ['/account/login/', '/account/inquiries/', '/account/inquiries/EM_SYNTHETIC_12345678/', '/admin/login/']) {
    const response = await worker.fetch(new Request('https://exactmec.com' + path), configuration);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex,nofollow');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(response.headers.get('Set-Cookie'), null);
    if (path.startsWith('/account/')) {
      const html = await response.text();
      const bootstrap = html.match(/<script type="application\/json" id="customer-config">([\s\S]*?)<\/script>/)?.[1];
      assert.ok(bootstrap, 'private HTML exposes only its actual availability, not fake auth');
      assert.deepEqual(JSON.parse(bootstrap), { available: false });
    }
  }
  const publicResponse = await worker.fetch(new Request('https://exactmec.com/'), configuration);
  assert.equal(publicResponse.headers.get('Set-Cookie'), null);
  const sitemap = await (await worker.fetch(new Request('https://exactmec.com/sitemap.xml'), configuration)).text();
  assert.doesNotMatch(sitemap, /account|admin/);
  assert.equal((await worker.fetch(new Request('https://exactmec.com/account/arbitrary/'), configuration)).status, 404);
  assert.equal((await worker.fetch(new Request('https://exactmec.com/account/login/', { method: 'POST' }), configuration)).status, 405);
  assert.equal((await worker.fetch(new Request('https://exactmec.com/api/customer/session', { headers: { 'X-Customer-Available': 'true' } }), { ...configuration, DB })).status, 503, 'changing frontend availability never authorizes the API');
});

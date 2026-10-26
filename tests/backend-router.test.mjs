import noticeVersions from '../src/data/notice-versions.json' with {type:'json'};
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPair, SignJWT } from 'jose';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createApiHandler, secureApi, writeOriginAllowed } from '../backend/router.mjs';
import { authenticateAccess, issueCsrf } from '../backend/auth.mjs';
import { handleBusiness } from '../backend/business.mjs';
import { buildInquiryPayload, initialValues } from '../src/inquiry/model.mjs';

// No live issuer, remote key lookup, production database or email binding is used.
const origin = 'https://exactmec.com';
const actor = { id: 'router-synthetic-admin', email: 'admin@example.invalid' };
const otherActor = { id: 'router-other-admin', email: 'other@example.invalid' };
let mf, db, env, token, csrf, reference, privateKey, publicKey;
const verifyLocalSignature = (request, bindings) => authenticateAccess(request, bindings, { resolveKey: publicKey });
const handler = createApiHandler({ authenticate: verifyLocalSignature });
const closedHandler = createApiHandler();

function payload(suffix = '') {
  return buildInquiryPayload({ ...initialValues(), name: 'Synthetic Router Buyer ' + suffix, company: 'Synthetic Router Company', email: 'router-buyer@example.invalid', phone: '+44 7700 900987', country: 'United Kingdom', city: 'Synthetic Router City', component: 'Synthetic housing', description: 'Synthetic router project. Never a real customer.', drawing_status: 'A physical sample', processing: true, whatsapp: false });
}

function request(path, { method = 'GET', body, rawBody, headers = {}, site = origin, authenticated = false, csrfToken } = {}) {
  return new Request(site + path, {
    method,
    headers: {
      ...(method !== 'GET' && method !== 'HEAD' ? { Origin: site, 'Content-Type': 'application/json' } : {}),
      ...(authenticated ? { 'Cf-Access-Jwt-Assertion': token } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...headers,
    },
    ...(rawBody !== undefined ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function secure(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(response.headers.get('Location'), null);
  const text = await response.text();
  if (status >= 400) assert.doesNotMatch(text, /router-buyer|Synthetic Router|7700|SELECT |INSERT |access-secret|private-stack-marker/);
  return text ? JSON.parse(text) : null;
}

before(async () => {
  ({ privateKey, publicKey } = await generateKeyPair('RS256'));
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("synthetic router tests")}}', compatibilityDate: '2026-10-01', d1Databases: { DB: 'synthetic-router-tests' } }));
  db = await mf.getD1Database('DB');
  const migration = readFileSync(new URL('../migrations/0001_inquiries.sql', import.meta.url), 'utf8');
  await db.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  env = {
    DB: db, SITE_ORIGIN: origin, ACCESS_TEAM_DOMAIN: 'router-fixture.cloudflareaccess.com', ACCESS_AUD: 'router-fixture-policy', ADMIN_EMAILS: actor.email,
    ADMIN_CSRF_SECRET: 'synthetic-router-access-secret-32-characters', RATE_LIMIT_SECRET: 'synthetic-router-rate-secret-32-characters', CONTACT_HASH_SECRET: 'synthetic-router-contact-secret-32-characters',
    NOTICE_VERSION: noticeVersions.notice_version, PRIVACY_VERSION: noticeVersions.privacy_version, PROCESSING_BASIS: noticeVersions.privacy_processing_basis, WHATSAPP_NOTICE_VERSION: noticeVersions.whatsapp_choice_text_version,
  };
  token = await new SignJWT({ email: actor.email, type: 'app' }).setProtectedHeader({ alg: 'RS256', kid: 'synthetic-local-key' }).setSubject(actor.id).setIssuer('https://router-fixture.cloudflareaccess.com').setAudience(env.ACCESS_AUD).setIssuedAt().setExpirationTime('1h').sign(privateKey);
  csrf = await issueCsrf(actor, env);
  const saved = await handleBusiness(request('/api/inquiries', { method: 'POST', body: payload('fixture'), headers: { 'Idempotency-Key': 'router_seed_' + crypto.randomUUID(), 'CF-Connecting-IP': '192.0.2.45' } }), env, { actor, localSynthetic: true });
  assert.equal(saved.status, 201);
  ({ reference } = await saved.json());
});
after(async () => { await mf?.dispose(); });

test('no DB or admin identity configuration fails closed, and non-API paths are not consumed', async () => {
  await secure(await closedHandler(request('/api/admin/leads/' + reference), {}), 503);
  await secure(await closedHandler(request('/api/admin/session', { headers: { 'Cf-Access-Authenticated-User-Email': actor.email, 'X-User-Email': actor.email, 'X-Local-Synthetic': 'true' } }), { DB: db }), 403);
  assert.equal(await handler(request('/about/'), env), null);
});

test('anonymous, forged identity and forged JWT requests cannot read/search/export/mutate existing leads', async () => {
  const before = (await db.prepare('SELECT count(*) AS n FROM leads').first()).n;
  for (const [path, method, body] of [
    ['/api/admin/leads/' + reference, 'GET'], ['/api/admin/leads/search', 'POST', { search: 'router-buyer@example.invalid' }],
    ['/api/admin/leads/export', 'POST', {}], ['/api/admin/leads/' + reference, 'PATCH', { revision: 1, review: { priority: 'A' } }],
    ['/api/admin/leads/' + reference, 'DELETE', { revision: 1, confirmation: reference }],
  ]) {
    for (const headers of [{}, { 'Cf-Access-Authenticated-User-Email': actor.email, 'X-Actor': JSON.stringify(actor) }, { 'Cf-Access-Jwt-Assertion': token.slice(0, -8) + 'forged00' }]) {
      const result = await handler(request(path, { method, body, headers, csrfToken: csrf }), env);
      assert.deepEqual(await secure(result, 403), { error: 'unauthorized' });
    }
  }
  assert.equal((await db.prepare('SELECT count(*) AS n FROM leads').first()).n, before);
  assert.equal((await db.prepare('SELECT revision FROM leads WHERE reference=?').bind(reference).first()).revision, 1);
});

test('verified JWT session is minimal, actor-scoped and does not accept caller redirect destinations', async () => {
  const session = await secure(await handler(request('/api/admin/session?returnTo=https://evil.invalid/&next=//evil.invalid', { authenticated: true }), env), 200);
  assert.deepEqual(Object.keys(session).sort(), ['csrfToken', 'localSynthetic', 'user']);
  assert.deepEqual(session.user, { email: actor.email });
  assert.equal(session.localSynthetic, false);
  assert.ok(session.csrfToken);
  const lead = await secure(await handler(request('/api/admin/leads/' + reference, { authenticated: true }), env), 200);
  assert.equal(lead.lead.payload.email, 'router-buyer@example.invalid');
  assert.equal(lead.lead.reference, reference);
});

test('same-origin writes reject missing, null, unrelated and cross-site origins before reading bodies', async () => {
  for (const headers of [{ Origin: '' }, { Origin: 'null' }, { Origin: 'https://evil.invalid' }, { Origin: origin + '.evil.invalid' }, { Origin: origin + '/' }, { Origin: origin, 'Sec-Fetch-Site': 'cross-site' }]) {
    const req = request('/api/admin/leads/search', { method: 'POST', authenticated: true, csrfToken: csrf, rawBody: 'invalid body contains router-buyer@example.invalid', headers });
    assert.deepEqual(await secure(await handler(req, env), 403), { error: 'origin_denied' });
  }
  await secure(await handler(request('/api/inquiries', { method: 'POST', body: payload(), headers: { Origin: 'https://evil.invalid' } }), env), 403);
  assert.equal(writeOriginAllowed(request('/api/inquiries', { method: 'POST', body: {} }), { SITE_ORIGIN: 'https://evil.invalid' }), false);
  for (const site of ['http://exactmec.com', 'https://user:pass@exactmec.com', origin + '/', origin + '/path', origin + '?q=1']) assert.equal(writeOriginAllowed(request('/api/inquiries', { method: 'POST', body: {} }), { SITE_ORIGIN: site }), false);
});

test('every admin non-GET route requires an unexpired token for the authenticated actor and origin', async () => {
  const wrongActor = await issueCsrf(otherActor, env);
  const wrongOrigin = await issueCsrf(actor, { ...env, SITE_ORIGIN: 'https://elsewhere.invalid' });
  const expired = await new SignJWT({ kind: 'csrf' }).setProtectedHeader({ alg: 'HS256' }).setIssuer(origin).setAudience('exactmec-admin').setSubject(actor.id).setIssuedAt(Math.floor(Date.now() / 1000) - 1200).setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(new TextEncoder().encode(env.ADMIN_CSRF_SECRET));
  for (const csrfToken of [undefined, 'forged', csrf + 'x', wrongActor, wrongOrigin, expired]) {
    for (const [path, method, body] of [['/api/admin/leads/search', 'POST', {}], ['/api/admin/leads/' + reference, 'PATCH', { revision: 1, review: {} }], ['/api/admin/leads/' + reference, 'DELETE', { revision: 1, confirmation: reference }]]) {
      assert.deepEqual(await secure(await handler(request(path, { method, body, authenticated: true, csrfToken }), env), 403), { error: 'csrf_required' });
    }
  }
  const search = await secure(await handler(request('/api/admin/leads/search', { method: 'POST', body: { search: reference }, authenticated: true, csrfToken: csrf }), env), 200);
  assert.equal(search.total, 1);
});

test('JSON writes reject unsupported media, malformed/object-invalid/invalid-UTF8 and advertised oversized bodies', async () => {
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonp', '']) await secure(await handler(request('/api/unknown', { method: 'POST', rawBody: '{}', headers: { 'Content-Type': type } }), env), 415);
  for (const rawBody of ['{', 'null', '[]', '"router-buyer@example.invalid"', new Uint8Array([0xc3, 0x28])]) await secure(await handler(request('/api/unknown', { method: 'POST', rawBody }), env), 400);
  await secure(await handler(request('/api/unknown', { method: 'POST', rawBody: '{}', headers: { 'Content-Length': '65537' } }), env), 413);
  await secure(await handler(request('/api/unknown', { method: 'POST', rawBody: '{}', headers: { 'Content-Type': 'application/json; charset=utf-8' } }), env), 404);
});

test('64KiB applies to actual streamed UTF8 bytes despite missing or forged Content-Length', async () => {
  const atLimit = JSON.stringify({ padding: 'x'.repeat(65522) });
  assert.equal(new TextEncoder().encode(atLimit).byteLength, 65536);
  await secure(await handler(request('/api/unknown', { method: 'POST', rawBody: atLimit }), env), 404);
  await secure(await handler(request('/api/unknown', { method: 'POST', rawBody: atLimit + ' ' }), env), 413);
  await secure(await handler(request('/api/unknown', { method: 'POST', rawBody: JSON.stringify({ text: '汉'.repeat(22000) }), headers: { 'Content-Length': '2' } }), env), 413);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(40000)); controller.enqueue(new Uint8Array(40000)); controller.close(); } });
  const streamed = new Request(origin + '/api/unknown', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'Content-Length': '1' }, body: stream, duplex: 'half' });
  await secure(await handler(streamed, env), 413);
});

test('untrusted localSynthetic flags cannot bypass closed collection or draft notices', async () => {
  const count = (await db.prepare('SELECT count(*) AS n FROM leads').first()).n;
  const req = () => request('/api/inquiries', { method: 'POST', body: { ...payload('closed'), localSynthetic: true, actor }, headers: { 'Idempotency-Key': 'router_closed_' + crypto.randomUUID(), 'X-Local-Synthetic': 'true', 'X-Actor': JSON.stringify(actor) } });
  const bindings = { ...env, LOCAL_SYNTHETIC: true, localSynthetic: true, COLLECTION_ENABLED: 'false', LEGAL_APPROVED: 'true' };
  assert.deepEqual(await secure(await handler(req(), bindings, { localSynthetic: true, actor }), 503), { error: 'collection_unavailable' });
  assert.deepEqual(await secure(await handler(req(), { ...bindings, COLLECTION_ENABLED:'true', NOTICE_VERSION:'unapproved-draft' }, { localSynthetic:true, actor }), 503), { error:'collection_unavailable' });
  const session = await secure(await handler(request('/api/admin/session', { authenticated: true, headers: { 'X-Local-Synthetic': 'true' } }), bindings, { localSynthetic: true }), 200);
  assert.equal(session.localSynthetic, false);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM leads').first()).n, count);
});

test('explicit Node factory injection permits only localhost synthetic writes and still requires authentication', async () => {
  const site = 'http://127.0.0.1:4179';
  const localEnv = { ...env, SITE_ORIGIN: site };
  const local = createApiHandler({ authenticate: verifyLocalSignature, localSynthetic: true });
  const req = () => request('/api/inquiries', { site, method: 'POST', body: { ...payload('local'), email: 'router-local@example.com', phone: '+1 202 555 0140' }, headers: { 'Idempotency-Key': 'router_local_' + crypto.randomUUID() } });
  await secure(await handler(req(), { ...localEnv, LOCAL_SYNTHETIC: true }), 403);
  const saved = await secure(await local(req(), localEnv), 201);
  assert.equal(saved.saved, true);
  await secure(await local(request('/api/admin/leads/' + saved.reference, { site }), localEnv), 403);
  await secure(await local(request('/api/inquiries', { method: 'POST', body: payload(), headers: { 'Idempotency-Key': 'router_remote_' + crypto.randomUUID() } }), env), 403);
});

test('localhost synthetic collection rejects non-fixture email or phone independently without persistence', async () => {
  const site = 'http://127.0.0.1:4179';
  const local = createApiHandler({ authenticate: verifyLocalSignature, localSynthetic: true });
  const localEnv = { ...env, SITE_ORIGIN: site };
  const beforeCount = (await db.prepare('SELECT count(*) AS n FROM leads').first()).n;
  const fixture = { ...payload('guard'), email: 'router-local@example.com', phone: '+1 202 555 0140' };
  for (const override of [
    { email: 'router-local@example.invalid' }, { email: 'router-local@example.com.evil.invalid' },
    { phone: '+1 202 555 0141' }, { phone: '+44 7700 900987' },
  ]) {
    const req = request('/api/inquiries', { site, method: 'POST', body: { ...fixture, ...override }, headers: { 'Idempotency-Key': 'router_guard_' + crypto.randomUUID() } });
    assert.deepEqual(await secure(await local(req, localEnv), 422), { errors: { email: 'synthetic_only', phone: 'synthetic_only' } });
  }
  assert.equal((await db.prepare('SELECT count(*) AS n FROM leads').first()).n, beforeCount);
});

test('unexpected database/auth failures stay generic and never echo PII, stack text or caller redirect targets', async () => {
  const failingEnv = { ...env, DB: { prepare() { throw new Error('private-stack-marker SELECT router-buyer@example.invalid'); } } };
  assert.deepEqual(await secure(await handler(request('/api/admin/leads/' + reference + '?next=https://evil.invalid/', { authenticated: true }), failingEnv), 503), { error: 'service_unavailable' });
  const brokenAuth = createApiHandler({ authenticate: async () => { throw new Error('private-stack-marker access-secret'); } });
  assert.deepEqual(await secure(await brokenAuth(request('/api/admin/session'), env), 503), { error: 'service_unavailable' });
  const result = secureApi(new Response('{}', { headers: { 'Access-Control-Allow-Origin': '*', 'Set-Cookie': 'sensitive=value', 'Cache-Control': 'public' } }));
  await secure(result, 200);
});

test('method and unknown/public reference lookups cannot bypass admin protection', async () => {
  for (const method of ['OPTIONS', 'PUT', 'HEAD']) {
    await secure(await handler(request('/api/admin/leads/' + reference, { method }), env), 405);
  }
  for (const path of ['/api/inquiries/' + reference, '/api/leads/' + reference, '/api/lookup?reference=' + reference, '/api/adminish/leads/' + reference]) await secure(await handler(request(path), env), 404);
  await secure(await handler(request('/api/admin/leads/' + reference, { headers: { Authorization: 'Bearer ' + token } }), env), 403);
});

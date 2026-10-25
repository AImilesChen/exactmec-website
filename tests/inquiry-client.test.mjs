import test from 'node:test';
import assert from 'node:assert/strict';
import { createInquiryClient, sameOriginEndpoint } from '../src/inquiry/client.mjs';

const origin = 'https://example.test';
const reference = 'EM_OPAQUE_12345678';
const response = (status, data = {}, headers = {}) => new Response(JSON.stringify(data), { status, headers });
const client = (fetchImpl, options = {}) => createInquiryClient({ origin, submitEnabled: true, fetchImpl, createId: () => 'request_12345678901234567890', ...options });

test('submission is closed by default, even when an endpoint and fetch are configured', async () => {
  let calls = 0;
  const api = createInquiryClient({ origin, fetchImpl: () => { calls++; } });
  assert.deepEqual(await api.submit({}), { state: 'unavailable' });
  assert.equal(calls, 0);
});

test('an unserializable payload or unavailable secure key cannot trigger a request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response(200, { saved: true, reference }); };
  const circular = {}; circular.self = circular;
  assert.equal((await client(fetchImpl).submit(circular)).state, 'unavailable');
  assert.equal((await client(fetchImpl).submit(undefined)).state, 'unavailable');
  assert.equal((await client(fetchImpl, { createId: () => { throw new Error('no secure RNG'); } }).submit({})).state, 'unavailable');
  assert.equal(calls, 0);
});

test('endpoint guard blocks cross-origin, credentials, query, fragment and non-HTTP URLs', async () => {
  assert.equal(sameOriginEndpoint('/api/inquiries', origin), `${origin}/api/inquiries`);
  assert.equal(sameOriginEndpoint(`${origin}/api/inquiries`, origin), `${origin}/api/inquiries`);
  for (const endpoint of ['https://other.test/api', '//other.test/api', 'javascript:alert(1)', 'https://user@example.test/api', '/api?email=private', '/api#private', '']) {
    let calls = 0;
    assert.equal(sameOriginEndpoint(endpoint, origin), null, endpoint);
    assert.deepEqual(await client(() => { calls++; }, { endpoint }).submit({}), { state: 'unavailable' });
    assert.equal(calls, 0);
  }
});

test('JSON POST uses same-origin credentials, no redirects, abort signal and idempotency header', async () => {
  let request;
  const api = client(async (url, options) => { request = { url, options }; return response(201, { saved: true, reference }); });
  assert.deepEqual(await api.submit({ component: 'Housing' }), { state: 'saved', reference });
  assert.equal(request.url, `${origin}/api/inquiries`);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.ok(request.options.headers['Idempotency-Key']);
  assert.equal(request.options.body, '{"component":"Housing"}');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.ok(request.options.signal instanceof AbortSignal);
});

test('only explicit saved true plus a safe reference can confirm success', async () => {
  for (const data of [{}, { success: true, reference }, { saved: 'true', reference }, { saved: true }, { saved: false, reference }, { saved: true, reference: 'user@example.com' }]) assert.equal((await client(async () => response(200, data)).submit({})).state, 'pending');
  assert.equal((await client(async () => response(202, { saved: true, reference })).submit({})).state, 'pending');
  assert.equal((await client(async () => new Response('invalid json', { status: 200 })).submit({})).state, 'pending');
});

test('duplicate needs explicit saved confirmation and reference, including HTTP 409', async () => {
  assert.deepEqual(await client(async () => response(409, { saved: true, status: 'duplicate', reference })).submit({}), { state: 'duplicate', reference });
  assert.equal((await client(async () => response(409, { saved: false, status: 'duplicate', reference })).submit({})).state, 'pending');
  assert.equal((await client(async () => response(409, { saved: true, reference })).submit({})).state, 'pending');
});

test('422 exposes only field keys; 429 returns bounded retry delay; 4xx and 5xx stay distinct', async () => {
  assert.deepEqual(await client(async () => response(422, { errors: { email: 'echo of private data' } })).submit({}), { state: 'invalid', fields: ['email'] });
  assert.deepEqual(await client(async () => response(429, {}, { 'Retry-After': '99999' })).submit({}), { state: 'rate_limit', retryAfter: 3600 });
  assert.equal((await client(async () => response(403)).submit({})).state, 'failed');
  assert.equal((await client(async () => response(503)).submit({})).state, 'pending');
});

test('network failure and timeout are unconfirmed; timeout aborts a hung request', async () => {
  assert.deepEqual(await client(async () => { throw new TypeError('network'); }).submit({}), { state: 'pending' });
  let signal;
  const api = client(async (_url, options) => { signal = options.signal; return new Promise(() => {}); }, { timeoutMs: 5 });
  assert.deepEqual(await api.submit({}), { state: 'pending' });
  assert.equal(signal.aborted, true);
});

test('timeout covers body parsing and a late success cannot replace pending', async () => {
  let finish;
  const api = client(async () => ({ status: 200, ok: true, json: () => new Promise(resolve => { finish = resolve; }) }), { timeoutMs: 5 });
  const result = await api.submit({});
  assert.deepEqual(result, { state: 'pending' });
  finish({ saved: true, reference });
  await Promise.resolve();
  assert.deepEqual(result, { state: 'pending' });
});

test('ambiguous retry reuses key, changed payload gets a fresh key, and no automatic retry runs', async () => {
  const keys = [];
  let sequence = 0;
  const api = client(async (_url, options) => { keys.push(options.headers['Idempotency-Key']); throw new Error('network'); }, { createId: () => `request_${String(++sequence).padStart(20, '0')}` });
  await api.submit({ component: 'A' });
  await api.submit({ component: 'A' });
  await api.submit({ component: 'B' });
  assert.equal(keys.length, 3);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});

test('concurrent submits share one request before React can disable the button', async () => {
  let calls = 0;
  let finish;
  const api = client(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = api.submit({});
  const second = api.submit({});
  assert.equal(first, second);
  assert.equal(calls, 1);
  finish(response(200, { saved: true, reference }));
  assert.deepEqual(await first, { state: 'saved', reference });
});

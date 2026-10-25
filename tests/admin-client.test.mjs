import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminClient, AdminApiError } from '../src/admin/client.mjs';
import { canContact, contactDestination, emptyReview } from '../src/admin/model.mjs';

const reference = 'EM_SYNTHETIC_00000001';
const item = { reference, revision: 1, payload: { email: 'synthetic@example.invalid', phone: '+44 (7700) 900-123', name: 'Synthetic Person', description: 'Private project' }, contact: { whatsapp_allowed: true, email_allowed: true, stopped: false } };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const session = () => json({ user: { email: 'operator@example.invalid' }, csrfToken: 'memory-only-csrf', localSynthetic: true });
const list = () => json({ items: [item], total: 1, page: 1, pageSize: 25 });
const kind = expected => error => error instanceof AdminApiError && error.kind === expected;

test('writes require a session; search is POST with bounded allowlisted body and secure fetch options', async () => {
  const calls = [];
  const client = createAdminClient({ fetchImpl: async (url, init) => { calls.push({ url, init }); return url.endsWith('/session') ? session() : list(); } });
  await assert.rejects(client.search({ search: 'synthetic@example.invalid' }), kind('csrf'));
  assert.equal(calls.length, 0);
  const visibleSession = await client.session();
  assert.deepEqual(visibleSession, { user: { email: 'operator@example.invalid' }, localSynthetic: true });
  assert.equal(visibleSession.csrfToken, undefined);
  await client.search({ search: 'synthetic@example.invalid', status: 'New', name: 'must not send', email: 'must not send' });
  const { url, init } = calls[1];
  assert.equal(url, '/api/admin/leads/search');
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'same-origin');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.redirect, 'error');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.equal(init.headers['X-CSRF-Token'], 'memory-only-csrf');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { search: 'synthetic@example.invalid', status: 'New', qualification: '', priority: '', drawing_status: '', page: 1, pageSize: 25 });
  assert.doesNotMatch(url, /example|\?|#/);
  await assert.rejects(client.search({ pageSize: 101 }), kind('invalid'));
  await assert.rejects(client.search({ search: 'a'.repeat(201) }), kind('invalid'));
  assert.equal(calls.length, 2);
});

test('review, opt-out, retry and delete send exact contract bodies with revision and CSRF', async () => {
  const calls = [];
  const client = createAdminClient({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/session')) return session();
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.endsWith('/retry-notification')) return json({ notification: { state: 'pending', attempts: 0 } });
    return json({ lead: item });
  } });
  await client.session();
  await client.update(reference, { revision: 1, review: { ...emptyReview(), owner: 'Owner', payload: item.payload, whatsapp_allowed: true }, note: 'Observation', extra: 'discard' });
  const patch = JSON.parse(calls[1].init.body);
  assert.deepEqual(Object.keys(patch).sort(), ['note', 'review', 'revision']);
  assert.deepEqual(Object.keys(patch.review).sort(), Object.keys(emptyReview()).sort());
  assert.equal(patch.revision, 1);
  await client.optOut(reference, { revision: 1, channel: 'whatsapp', reason: 'Customer request', payload: item.payload });
  assert.deepEqual(JSON.parse(calls[2].init.body), { revision: 1, channel: 'whatsapp', reason: 'Customer request' });
  await client.retryNotification(reference);
  assert.deepEqual(JSON.parse(calls[3].init.body), {});
  await assert.rejects(client.delete(reference, { revision: 1, confirmation: 'wrong' }), kind('invalid'));
  await client.delete(reference, { revision: 1, confirmation: reference });
  assert.equal(calls[4].init.method, 'DELETE');
  assert.deepEqual(JSON.parse(calls[4].init.body), { revision: 1, confirmation: reference });
  assert.ok(calls.slice(1).every(call => call.init.headers['X-CSRF-Token'] === 'memory-only-csrf'));
});

test('rejects references, review values and impossible dates before making a request', async () => {
  let calls = 0;
  const client = createAdminClient({ fetchImpl: async () => { calls++; return session(); } });
  await client.session();
  for (const value of ['../../private', reference + '?email=synthetic', reference + '/delete', 'https://evil.invalid/']) await assert.rejects(client.get(value), kind('invalid'));
  for (const input of [
    { revision: 0, review: {} }, { revision: 1, review: { status: 'Fake' } },
    { revision: 1, review: { owner: 'a'.repeat(121) } }, { revision: 1, review: { next_follow_up: '2026-02-30' } },
  ]) await assert.rejects(client.update(reference, input), kind('invalid'));
  await assert.rejects(client.optOut(reference, { revision: 1, channel: 'calls' }), kind('invalid'));
  assert.equal(calls, 1);
});

test('auth, CSRF, conflict and outage are distinct; raw server messages never escape and writes are not retried', async () => {
  for (const [status, code, expected] of [[401, 'auth_required', 'auth_required'], [403, 'forbidden', 'forbidden'], [403, 'csrf_invalid', 'csrf'], [409, 'revision_conflict', 'conflict'], [503, 'not_configured', 'unavailable']]) {
    const calls = [];
    const client = createAdminClient({ fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return url.endsWith('/session') ? session() : json({ error: code, message: 'private@example.invalid should not escape' }, status);
    } });
    await client.session();
    await assert.rejects(client.update(reference, { revision: 1, review: {}, note: '' }), error => {
      assert.equal(error.kind, expected);
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /private|example|revision_conflict/);
      return true;
    });
    assert.equal(calls.length, 2);
    if (['auth_required', 'forbidden', 'csrf'].includes(expected)) {
      await assert.rejects(client.search({}), kind('csrf'));
      assert.equal(calls.length, 2);
    }
  }
});

test('malformed success, HTML auth pages and transport failures never become synthetic data', async () => {
  const outcomes = [
    () => new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => json({ items: [], total: 'invalid', page: 1, pageSize: 25 }),
    () => new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
  ];
  for (const outcome of outcomes) {
    const client = createAdminClient({ fetchImpl: async url => url.endsWith('/session') ? session() : outcome() });
    await client.session();
    await assert.rejects(client.search({}), kind('invalid_response'));
  }
  const client = createAdminClient({ fetchImpl: async () => { throw Error('private customer text'); } });
  await assert.rejects(client.session(), error => error.kind === 'network' && !error.message.includes('private'));
});

test('CSV export is an authenticated POST and returns a Blob without a remote download URL', async () => {
  const calls = [];
  const client = createAdminClient({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return url.endsWith('/session') ? session() : new Response('\uFEFF"Reference"\r\n"Synthetic"', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
  } });
  await client.session();
  const csv = await client.export({ search: 'synthetic@example.invalid' });
  assert.ok(csv instanceof Blob);
  assert.match(await csv.text(), /Reference/);
  assert.equal(calls[1].url, '/api/admin/leads/export');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.headers['X-CSRF-Token'], 'memory-only-csrf');
  assert.equal(calls[1].init.headers.Accept, 'text/csv');
});

test('contact URLs require server permission; WhatsApp withdrawal does not disable an allowed email reply', () => {
  assert.equal(canContact(item, 'whatsapp'), true);
  const whatsapp = contactDestination(item, 'whatsapp');
  assert.match(whatsapp, /^https:\/\/wa\.me\/447700900123\?text=/);
  const draft = new URL(whatsapp).searchParams.get('text');
  assert.ok(draft.includes(reference));
  assert.doesNotMatch(draft, /Synthetic Person|Private project|example/);
  const stopped = { ...item, contact: { whatsapp_allowed: false, email_allowed: true, stopped: true } };
  assert.equal(contactDestination(stopped, 'whatsapp'), null);
  assert.equal(canContact(stopped, 'whatsapp'), false);
  assert.ok(contactDestination(stopped, 'email'));
  assert.equal(contactDestination({ ...item, contact: { whatsapp_allowed: 'true' } }, 'whatsapp'), null);
  assert.equal(contactDestination({ ...item, payload: { ...item.payload, phone: 'javascript:alert(1)' } }, 'whatsapp'), null);
  assert.equal(contactDestination({ ...item, payload: { ...item.payload, email: 'customer@example.invalid\r\nBcc:private@example.invalid' } }, 'email'), null);
  assert.equal(contactDestination({ ...item, contact: { whatsapp_allowed: false, email_allowed: false, stopped: true } }, 'email'), null);
});

test('destroy clears credentials, aborts active work and prevents further API calls', async () => {
  let calls = 0;
  let signal;
  const client = createAdminClient({ fetchImpl: async (url, init) => {
    calls++;
    if (url.endsWith('/session')) return session();
    signal = init.signal;
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  } });
  await client.session();
  const inFlight = client.get(reference);
  client.destroy();
  await assert.rejects(inFlight, kind('timeout'));
  assert.equal(signal.aborted, true);
  await assert.rejects(client.get(reference), kind('unavailable'));
  assert.equal(calls, 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalytics, sanitizeAnalyticsRoute, bindSiteAnalytics } from '../src/analytics/index.mjs';

test('default, disabled, missing adapter and unconsented configurations emit nothing', () => {
  const calls = [];
  const adapter = (...args) => calls.push(args);
  for (const config of [{ adapter }, { enabled: true, adapter }, { consent: true, adapter }, { enabled: true, consent: true }]) {
    assert.equal(createAnalytics(config).track('pageview', { route: '/' }), false);
  }
  assert.deepEqual(calls, []);
});

test('only registered event names and safe fields with enum values can reach the adapter', () => {
  const calls = [];
  const analytics = createAnalytics({ enabled: true, consent: true, adapter: (...args) => calls.push(args) });
  const input = { route: '/request-a-quote/?email=private@example.test#reference=secret', placement: 'form', status: 'validation_failed', name: 'Customer', email: 'private@example.test', phone: '+123456', company: 'Private', description: 'Private project', budget: 5000, drawing_status: 'ready', reference: 'private-reference' };
  assert.equal(analytics.track('inquiry_submit_failed', input), true);
  assert.deepEqual(calls, [['inquiry_submit_failed', { route: '/request-a-quote/', placement: 'form', status: 'validation_failed' }]]);
  assert.ok(Object.isFrozen(calls[0][1]));
  input.route = '/admin/leads/private-reference';
  assert.equal(calls[0][1].route, '/request-a-quote/');
  analytics.track('pageview', { route: '/', placement: 'private@example.test', status: 'drawing-ready' });
  assert.deepEqual(calls[1], ['pageview', { route: '/' }]);
  for (const name of ['signup', 'purchase', 'private@example.test']) assert.equal(analytics.track(name, { route: '/' }), false);
  assert.equal(calls.length, 2);
});

test('queries and fragments are removed; unknown, external, encoded and private routes never emit', () => {
  assert.equal(sanitizeAnalyticsRoute('/products?name=private#secret'), '/products/');
  assert.equal(sanitizeAnalyticsRoute('/privacy/?email=private'), '/privacy');
  const calls = [];
  const analytics = createAnalytics({ enabled: true, consent: true, adapter: (...args) => calls.push(args) });
  for (const route of ['/admin/leads/customer', '/design-system/', '/customer/private@example.test', '//evil.test/', 'https://evil.test/products/', '/%70roducts/', '/products/../', '/products\\', '/products//', null, {}]) {
    assert.equal(sanitizeAnalyticsRoute(route), null);
    assert.equal(analytics.track('pageview', { route }), false);
  }
  assert.deepEqual(calls, []);
});

test('withdrawal stops future events immediately; no backlog is replayed, destroy is final', () => {
  const calls = [];
  const analytics = createAnalytics({ enabled: true, adapter: (...args) => calls.push(args) });
  analytics.track('pageview', { route: '/' });
  analytics.setConsent(true);
  assert.equal(calls.length, 0);
  assert.equal(analytics.track('inquiry_started', { route: '/request-a-quote/', placement: 'form' }), true);
  analytics.setConsent(false);
  assert.equal(analytics.track('inquiry_submit_attempt', { route: '/request-a-quote/' }), false);
  analytics.setConsent('true');
  assert.equal(analytics.track('pageview', { route: '/' }), false);
  analytics.setConsent(true);
  analytics.destroy();
  analytics.setConsent(true);
  assert.equal(analytics.track('pageview', { route: '/' }), false);
  assert.equal(calls.length, 1);
});

test('adapter failures do not interrupt the caller or log customer data', async () => {
  const sync = createAnalytics({ enabled: true, consent: true, adapter: () => { throw Error('offline'); } });
  assert.equal(sync.track('pageview', { route: '/' }), false);
  const asyncAdapter = createAnalytics({ enabled: true, consent: true, adapter: async () => { throw Error('offline'); } });
  assert.equal(asyncAdapter.track('pageview', { route: '/' }), true);
  await new Promise(resolve => setImmediate(resolve));
});

test('click binding captures only quote and WhatsApp events with safe source route and removes its listener', () => {
  const calls = [];
  const analytics = createAnalytics({ enabled: true, consent: true, adapter: (...args) => calls.push(args) });
  let handler;
  const doc = {
    location: { href: 'https://exactmec.test/products/?email=private@example.test#customer', origin: 'https://exactmec.test', pathname: '/products/' },
    addEventListener(type, fn, capture) { assert.equal(type, 'click'); assert.equal(capture, true); handler = fn; },
    removeEventListener(type, fn, capture) { assert.equal(type, 'click'); assert.equal(fn, handler); assert.equal(capture, true); handler = null; },
  };
  const click = (href, region = null) => {
    const link = { getAttribute: key => key === 'href' ? href : null, closest: selector => selector === region ? {} : null };
    handler({ target: { closest: selector => selector === 'a[href]' ? link : null }, button: 0 });
  };
  const unbind = bindSiteAnalytics(doc, analytics);
  click('/request-a-quote/?email=private', 'header');
  click('https://wa.me/123456?text=private-reference', 'footer');
  click('https://evil.test/request-a-quote/');
  click('/products/');
  handler({ target: { closest: () => null }, button: 0 });
  assert.deepEqual(calls, [
    ['quote_cta_click', { route: '/products/', placement: 'header' }],
    ['whatsapp_click', { route: '/products/', placement: 'footer' }],
  ]);
  analytics.setConsent(false);
  click('/request-a-quote/');
  assert.equal(calls.length, 2);
  unbind();
  unbind();
  assert.equal(handler, null);
});

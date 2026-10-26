import test from 'node:test';
import assert from 'node:assert/strict';
import { createVendorAnalytics, isVendorMarketingRoute, vendorMarketingRoute, clarityContextAllowed, VENDOR_ANALYTICS } from '../src/analytics/vendors.mjs';

function browser({ href = 'https://exactmec.com/', referrer = '', cookies = [], fetchImpl, failScript } = {}) {
  const scripts = [], calls = [], cookieWrites = [], nodes = new Map();
  const jar = new Map(cookies.map(name => [name, 'synthetic-value']));
  const element = () => ({ attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } });
  const root = element(); nodes.set('root', root);
  const window = { location: new URL(href) };
  const document = { title: 'PRIVATE-TITLE buyer@example.invalid', referrer, documentElement: element(), getElementById: id => nodes.get(id) || null, createElement: () => element() };
  document.head = { appendChild(node) {
    if (failScript?.(node)) throw new Error('PRIVATE blocked provider');
    scripts.push({ node, queueAtInsertion: window.dataLayer?.map(args => Array.from(args)) || [], maskAtInsertion: document.documentElement.attributes['data-clarity-mask'] });
    nodes.set(node.id, node);
    node.remove = () => nodes.delete(node.id);
    return node;
  } };
  Object.defineProperty(document, 'cookie', { get() { return Array.from(jar, ([name, value]) => name + '=' + value).join('; '); }, set(value) { cookieWrites.push(value); const name = value.split('=')[0]; if (value.includes('Max-Age=0')) jar.delete(name); } });
  window.document = document;
  const fetch = (url, init) => { calls.push({ url, init }); return fetchImpl ? fetchImpl(url, init) : Promise.resolve(new Response('{}', { status: 202 })); };
  const adapter = options => createVendorAnalytics({ enabled: true, window, document, fetchImpl: fetch, ...options });
  return { window, document, scripts, calls, cookieWrites, jar, adapter };
}
const googleCalls = window => window.dataLayer?.map(args => Array.from(args)) || [];
const plausibleBodies = fixture => fixture.calls.map(call => JSON.parse(call.init.body));

test('construction/default-disabled/unconsented tracking performs no request, tag insertion, queue or cookie access', () => {
  const fixture = browser(); const api = fixture.adapter();
  assert.equal(api.track('pageview', { route: '/' }), false);
  assert.deepEqual(fixture.scripts, []); assert.deepEqual(fixture.calls, []); assert.deepEqual(fixture.cookieWrites, []);
  assert.equal(fixture.window.gtag, undefined); assert.equal(fixture.window.clarity, undefined); assert.equal(api.hasStarted(), false);
  const disabled = fixture.adapter({ enabled: false });
  assert.equal(disabled.setConsent(true), false);
  assert.deepEqual(fixture.scripts, []); assert.deepEqual(fixture.calls, []);
});

test('basic GA consent/ads restrictions precede SDK insertion; Clarity is masked and analytics-only before its tag', () => {
  const fixture = browser(); const api = fixture.adapter();
  assert.equal(api.setConsent(true), true);
  assert.deepEqual(fixture.scripts.map(entry => entry.node.src), [VENDOR_ANALYTICS.googleScript, VENDOR_ANALYTICS.clarityScript, VENDOR_ANALYTICS.ahrefsScript]);
  for (const { node } of fixture.scripts) { assert.equal(node.async, true); assert.equal(node.referrerPolicy, 'no-referrer'); assert.equal(node.textContent, undefined); }
  const queue = fixture.scripts[0].queueAtInsertion;
  assert.deepEqual(queue[0], ['consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]);
  assert.deepEqual(queue.find(call => call[0] === 'consent' && call[1] === 'update')[2], { ad_storage: 'denied', analytics_storage: 'granted', ad_user_data: 'denied', ad_personalization: 'denied' });
  const config = queue.find(call => call[0] === 'config');
  assert.equal(config[1], 'G-E8EBN552MZ'); assert.equal(config[2].send_page_view, false); assert.equal(config[2].allow_google_signals, false); assert.equal(config[2].allow_ad_personalization_signals, false);
  assert.equal(config[2].page_location, 'https://exactmec.com/'); assert.equal(config[2].page_referrer, ''); assert.equal(config[2].page_title, '');
  assert.equal(fixture.scripts[1].maskAtInsertion, 'true'); assert.equal(fixture.document.getElementById('root').attributes['data-clarity-mask'], 'true');
  assert.deepEqual(Array.from(fixture.window.clarity.q[0]), ['consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }]);
  assert.equal(api.hasStarted(), true);
});

test('GA/Plausible only receive synthetic safe URLs and closed event fields; Clarity skips query/hash and unsafe referrer', () => {
  const fixture = browser({ href: 'https://exactmec.com/products/?email=buyer@example.invalid#PRIVATE-REFERENCE', referrer: 'https://external.invalid/customer/private@example.invalid?secret=PRIVATE' });
  const api = fixture.adapter(); api.setConsent(true);
  assert.deepEqual(fixture.scripts.map(entry => entry.node.src), [VENDOR_ANALYTICS.googleScript]);
  assert.equal(api.track('quote_cta_click', { route: '/products/?email=buyer@example.invalid#PRIVATE', placement: 'hero', email: 'buyer@example.invalid', phone: '+123456789', reference: 'PRIVATE', description: 'PRIVATE', props: { hidden: 'PRIVATE' } }), true);
  assert.equal(api.track('inquiry_submit_success', { route: '/products/' }), false);
  assert.equal(api.track('purchase', { route: '/products/' }), false);
  assert.equal(api.track('whatsapp_click', { route: '/about/' }), false);
  const bodies = plausibleBodies(fixture);
  assert.deepEqual(bodies.at(-1), { name: 'quote_cta_click', url: 'https://exactmec.com/products/', domain: 'exactmec.com', referrer: null, props: { route: '/products/', placement: 'hero' } });
  const metadata = JSON.stringify([...googleCalls(fixture.window), ...bodies]);
  assert.doesNotMatch(metadata, /buyer@example|PRIVATE|123456789|description|email|phone|reference/);
  for (const call of fixture.calls) { assert.equal(call.url, VENDOR_ANALYTICS.plausibleEndpoint); assert.equal(call.init.credentials, 'omit'); assert.equal(call.init.referrerPolicy, 'no-referrer'); assert.equal(call.init.redirect, 'error'); assert.equal(call.init.cache, 'no-store'); assert.equal(call.init.keepalive, true); }
});

test('private/legal/form/unknown routes and noncanonical hosts never load any external provider', () => {
  for (const path of ['/request-a-quote/', '/inquiry-received/', '/privacy', '/terms/', '/cookies', '/project-information', '/account/login/', '/account/inquiries/EM_PRIVATE_REFERENCE/', '/admin/leads/', '/api/inquiries', '/design-system/', '/404', '/private-person/', '/%70roducts/', '/products//']) {
    const fixture = browser({ href: 'https://exactmec.com' + path }); const api = fixture.adapter();
    assert.equal(api.setConsent(true), false, path); assert.equal(api.track('pageview', { route: '/' }), false, path);
    assert.equal(fixture.calls.length, 0, path); assert.equal(fixture.scripts.length, 0, path);
  }
  for (const href of ['http://exactmec.com/', 'https://www.exactmec.com/', 'https://exactmec.com.evil.invalid/', 'https://localhost/', 'https://exactmec.com:8443/', 'https://user:pass@exactmec.com/']) {
    const fixture = browser({ href }); assert.equal(fixture.adapter().setConsent(true), false, href); assert.equal(fixture.scripts.length + fixture.calls.length, 0);
  }
});

test('Clarity referrer guard accepts only empty, registered clean same-origin or pure external origins', () => {
  for (const referrer of ['', 'https://exactmec.com/products/', 'https://www.google.com/']) { const fixture = browser({ referrer }); assert.equal(clarityContextAllowed(fixture.window, fixture.document), true, referrer); }
  for (const referrer of ['https://exactmec.com/request-a-quote/', 'https://exactmec.com/account/inquiries/', 'https://exactmec.com/private-person/', 'https://exactmec.com/products/?email=private', 'https://www.google.com/search?q=private', 'https://external.invalid/person-name/', 'https://user:pass@external.invalid/', 'http://localhost/', 'javascript:alert(1)']) {
    const fixture = browser({ referrer }); const api = fixture.adapter(); api.setConsent(true);
    assert.equal(clarityContextAllowed(fixture.window, fixture.document), false, referrer);
    assert.ok(fixture.scripts.every(entry => !entry.node.src.includes('clarity.ms')), referrer);
  }
});

test('pageviews are manual and deduplicated within the document while intentional repeated clicks remain distinct', () => {
  const fixture = browser(); const api = fixture.adapter();
  api.setConsent(true); api.setConsent(true);
  assert.equal(api.track('pageview', { route: '/' }), false);
  assert.equal(fixture.scripts.length, 3);
  assert.equal(googleCalls(fixture.window).filter(args => args[0] === 'event' && args[1] === 'page_view').length, 1);
  assert.equal(plausibleBodies(fixture).filter(body => body.name === 'pageview').length, 1);
  api.track('whatsapp_click', { route: '/', placement: 'header' }); api.track('whatsapp_click', { route: '/', placement: 'header' });
  assert.equal(plausibleBodies(fixture).filter(body => body.name === 'whatsapp_click').length, 2);
});

test('withdrawal disables known APIs, aborts pending manual sends and deletes analytics cookies only', () => {
  const fixture = browser({ cookies: ['_ga', '_ga_E8EBN552MZ', '_clck', '_clsk', '__Host-exactmec_customer', 'necessary_cookie'], fetchImpl: () => new Promise(() => {}) });
  const api = fixture.adapter(); api.setConsent(true);
  const signal = fixture.calls[0].init.signal;
  api.setConsent(false);
  assert.equal(signal.aborted, true); assert.equal(fixture.window['ga-disable-G-E8EBN552MZ'], true);
  assert.deepEqual(googleCalls(fixture.window).at(-1), ['consent', 'update', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]);
  assert.deepEqual(Array.from(fixture.window.clarity.q.at(-2)), ['consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' }]);
  assert.deepEqual(Array.from(fixture.window.clarity.q.at(-1)), ['stop']);
  assert.ok(googleCalls(fixture.window).every(call => call[0] !== 'event' && !(call[0] === 'consent' && call[1] === 'update' && call[2].analytics_storage === 'granted')), 'late Google runtime has no granted events queued');
  assert.ok(fixture.window.clarity.q.every(args => !(args[0] === 'consentv2' && args[1].analytics_Storage === 'granted')), 'late Clarity runtime has no granted capture queued');
  assert.equal(fixture.jar.has('_ga'), false); assert.equal(fixture.jar.has('_clck'), false);
  assert.equal(fixture.jar.has('__Host-exactmec_customer'), true); assert.equal(fixture.jar.has('necessary_cookie'), true);
  assert.ok(fixture.cookieWrites.every(value => !value.includes('customer') && !value.includes('necessary_cookie')));
  assert.equal(api.track('quote_cta_click', { route: '/', placement: 'header' }), false);
  assert.equal(api.setConsent(true), false, 'loaded SDKs require a fresh document after withdrawal');
  assert.equal(api.hasStarted(), true, 'host still must reload after removing loaded script elements');
});

test('unplanned navigation into another DOM stops the adapter before it can emit on the new route', () => {
  const fixture = browser(); const api = fixture.adapter(); api.setConsent(true);
  const before = fixture.calls.length;
  fixture.window.location = new URL('https://exactmec.com/request-a-quote/?email=PRIVATE');
  assert.equal(api.track('inquiry_started', { route: '/request-a-quote/' }), false);
  assert.equal(api.track('pageview', { route: '/request-a-quote/' }), false);
  assert.equal(fixture.calls.length, before);
  assert.equal(fixture.window['ga-disable-G-E8EBN552MZ'], true);
});

test('provider blockers and rejected/synchronous network failures never throw or automatically retry', async () => {
  const fixture = browser({ fetchImpl: () => Promise.reject(new Error('PRIVATE network failure')), failScript: node => node.src.includes('clarity.ms') });
  fixture.window.gtag = () => { throw new Error('PRIVATE provider error'); };
  const api = fixture.adapter();
  assert.doesNotThrow(() => api.setConsent(true));
  assert.doesNotThrow(() => api.track('whatsapp_click', { route: '/', placement: 'PRIVATE' }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fixture.calls.length, 2);
  assert.doesNotMatch(JSON.stringify(plausibleBodies(fixture)), /PRIVATE/);
  assert.doesNotThrow(() => api.setConsent(false)); assert.doesNotThrow(() => api.destroy());
  const syncFailure = browser({ fetchImpl: () => { throw new Error('Blocked'); } });
  assert.doesNotThrow(() => syncFailure.adapter().setConsent(true));
});

test('destroy is final and trusted published route additions cannot enable private/reserved surfaces', () => {
  assert.equal(isVendorMarketingRoute('/products?email=private'), true);
  assert.equal(vendorMarketingRoute('/products'), '/products/');
  assert.equal(isVendorMarketingRoute('/resources/new-cms-article/', ['/resources/new-cms-article/']), true);
  assert.equal(isVendorMarketingRoute('/account/private/', ['/account/private/']), false);
  assert.equal(isVendorMarketingRoute('/private-person/'), false);
  const fixture = browser({ href: 'https://exactmec.com/resources/new-cms-article/' });
  const api = fixture.adapter({ knownPaths: ['/resources/new-cms-article/'] }); api.setConsent(true);
  assert.equal(plausibleBodies(fixture)[0].url, 'https://exactmec.com/resources/new-cms-article/');
  api.destroy(); const count = fixture.calls.length;
  assert.equal(api.setConsent(true), false); assert.equal(api.track('pageview', { route: '/resources/new-cms-article/' }), false); assert.equal(fixture.calls.length, count);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createVendorAnalytics, VENDOR_ANALYTICS } from '../src/analytics/vendors.mjs';
import { readSavedMeasurementChoice, MEASUREMENT_CHOICE_KEY } from '../src/analytics/transport.mjs';
import { createMeasurementController, navigateForExternalMeasurement } from '../src/analytics/controller.mjs';

function environment({ href = 'https://exactmec.com/about/', referrer = '', enabled = true, pending = false, knownPaths } = {}) {
  const scripts = [], requests = [], deleted = [], attributes = {};
  const nodes = new Map();
  const document = { referrer, createElement(tag) { return { tagName: tag, setAttribute(key, value) { this[key] = value; }, remove() { this.removed = true; } }; }, getElementById(id) { return nodes.get(id); }, documentElement: { setAttribute(key, value) { attributes[key] = value; } }, head: { appendChild(node) { scripts.push(node); nodes.set(node.id, node); } } };
  Object.defineProperty(document, 'cookie', { get: () => '_ga=synthetic; _ga_E8EBN552MZ=synthetic; _ga_ANOTHER=keep; _clck=synthetic; _clsk=synthetic; __Host-exactmec_customer=keep; business=keep', set: value => deleted.push(value) });
  const window = { location: { href }, document };
  const adapter = createVendorAnalytics({ enabled, window, document, knownPaths, fetchImpl: (url, options) => { requests.push({ url, options, body: JSON.parse(options.body) }); return pending ? new Promise(() => {}) : Promise.resolve({ status: 202 }); } });
  return { adapter, window, document, scripts, requests, deleted, attributes };
}

test('external vendors do nothing before a fresh affirmative choice, including legacy allow or read-only stored allow', () => {
  const app = environment();
  app.adapter.track('pageview', { route: '/about/' });
  assert.deepEqual(app.scripts, []);
  assert.deepEqual(app.requests, []);
  assert.equal(app.window.dataLayer, undefined);
  app.adapter.setConsent(false);
  assert.deepEqual(app.scripts, []);
  assert.deepEqual(app.requests, []);
  const old = new Map([['exactmec_measurement_choice', 'allow']]);
  assert.equal(readSavedMeasurementChoice({ getItem: key => old.get(key) || null }), null);
  assert.equal(readSavedMeasurementChoice({ getItem: key => key === MEASUREMENT_CHOICE_KEY ? 'allow' : null, setItem() { throw new Error('read-only'); } }), null);
});

test('actual location/query/fragment/referrer and poisoned event fields never enter manual GA/Plausible data', () => {
  const app = environment({ href: 'https://exactmec.com/about/?email=SYNTHETIC@example.invalid#PRIVATE_REFERENCE', referrer: 'https://source.example/private?phone=SYNTHETIC' });
  assert.equal(app.adapter.setConsent(true), true);
  assert.deepEqual(app.scripts.map(script => script.id), ['exactmec-ga4'], 'unsafe metadata skips the entire Clarity SDK');
  assert.ok(app.scripts.every(script => script.referrerPolicy === 'no-referrer'));
  assert.equal(app.adapter.track('quote_cta_click', { route: '/about/?email=SYNTHETIC@example.invalid', placement: 'header', reference: 'PRIVATE_REFERENCE', email: 'SYNTHETIC@example.invalid', description: 'PRIVATE_PROJECT', status: 'PRIVATE_STATUS', referrer: 'PRIVATE_SOURCE' }), true);
  const payload = JSON.stringify({ commands: app.window.dataLayer.map(args => Array.from(args)), bodies: app.requests.map(request => request.body) });
  assert.doesNotMatch(payload, /SYNTHETIC|PRIVATE_REFERENCE|PRIVATE_PROJECT|PRIVATE_STATUS|PRIVATE_SOURCE|\?|#/);
  for (const { url, options, body } of app.requests) {
    assert.equal(url, VENDOR_ANALYTICS.plausibleEndpoint);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.redirect, 'error');
    assert.equal(body.referrer, null);
    assert.equal(body.url, 'https://exactmec.com/about/');
    assert.deepEqual(Object.keys(body).sort(), ['domain', 'name', 'props', 'referrer', 'url']);
  }
  assert.equal(app.scripts.some(script => script.src.includes('plausible')), false, 'the actual raw-referrer Plausible SDK is never loaded');
});

test('strict private/unknown/origin exclusion applies before any SDK queue, mask or network is created', () => {
  for (const path of ['/request-a-quote/', '/inquiry-received/', '/privacy', '/terms', '/cookies', '/project-information', '/account/login/', '/account/inquiries/EM_PRIVATE_1234/', '/admin/login/', '/api/inquiries', '/unknown/', '/404']) {
    const app = environment({ href: 'https://exactmec.com' + path });
    assert.equal(app.adapter.setConsent(true), false, path);
    assert.equal(app.adapter.track('pageview', { route: path }), false, path);
    assert.equal(app.scripts.length, 0, path);
    assert.equal(app.requests.length, 0, path);
    assert.equal(app.window.dataLayer, undefined, path);
    assert.equal(app.attributes['data-clarity-mask'], undefined, path);
  }
  for (const href of ['http://exactmec.com/about/', 'https://www.exactmec.com/about/', 'https://exactmec.com.evil.invalid/about/', 'https://127.0.0.1/about/', 'https://fake:secret@exactmec.com/about/']) {
    const app = environment({ href });
    assert.equal(app.adapter.setConsent(true), false, href);
    assert.equal(app.scripts.length + app.requests.length, 0, href);
  }
});

test('Clarity is masked before insertion, and private or unknown referrers suppress it without stopping sanitized GA/Plausible', () => {
  const clean = environment();
  clean.adapter.setConsent(true);
  assert.equal(clean.attributes['data-clarity-mask'], 'true');
  assert.ok(clean.scripts.some(script => script.id === 'exactmec-clarity'));
  const commands = clean.window.clarity.q.map(args => Array.from(args));
  assert.deepEqual(commands[0], ['consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }]);
  for (const referrer of ['https://exactmec.com/request-a-quote/', 'https://exactmec.com/account/inquiries/EM_PRIVATE_12345/', 'https://exactmec.com/unknown-private/', 'https://source.example/users/synthetic-buyer', 'https://source.example/?email=SYNTHETIC@example.invalid']) {
    const app = environment({ referrer });
    assert.equal(app.adapter.setConsent(true), true);
    assert.equal(app.scripts.some(script => script.id === 'exactmec-clarity'), false, referrer);
    assert.equal(app.requests.length, 1, 'safe pageview can still reach Plausible');
  }
});

test('withdrawal aborts pending manual events, disables SDKs, removes only analytics cookies and cannot resume without a new document', () => {
  const app = environment({ pending: true });
  app.adapter.setConsent(true);
  assert.equal(app.requests.length, 1);
  const first = app.requests[0];
  assert.equal(first.options.signal.aborted, false);
  app.adapter.setConsent(false);
  assert.equal(first.options.signal.aborted, true);
  assert.equal(app.window['ga-disable-' + VENDOR_ANALYTICS.ga4Id], true);
  assert.ok(app.scripts.every(script => script.removed));
  assert.ok(app.window.clarity.q.some(args => args[0] === 'stop'));
  assert.doesNotMatch(app.deleted.join('\n'), /__Host-exactmec_customer|business=|_ga_ANOTHER/);
  assert.ok(app.deleted.some(cookie => cookie.startsWith('_ga=;')));
  assert.ok(app.deleted.some(cookie => cookie.startsWith('_clck=;')));
  assert.equal(app.adapter.hasStarted(), true, 'host needs to fully reload, not just remove tags');
  assert.equal(app.adapter.setConsent(true), false);
  assert.equal(app.adapter.track('pageview', { route: '/about/' }), false);
  assert.equal(app.requests.length, 1);
});

test('pageview is not double-counted and accidental SPA movement into a form permanently stops this adapter', () => {
  const app = environment();
  app.adapter.setConsent(true);
  assert.equal(app.adapter.track('pageview', { route: '/about/' }), false);
  assert.equal(app.requests.length, 1);
  app.window.location.href = 'https://exactmec.com/request-a-quote/?email=SYNTHETIC@example.invalid';
  assert.equal(app.adapter.track('inquiry_submit_success', { route: '/request-a-quote/', reference: 'PRIVATE_REFERENCE' }), false);
  assert.equal(app.adapter.track('pageview', { route: '/request-a-quote/' }), false);
  assert.equal(app.window['ga-disable-' + VENDOR_ANALYTICS.ga4Id], true);
  assert.equal(app.requests.length, 1);
  app.window.location.href = 'https://exactmec.com/about/';
  assert.equal(app.adapter.setConsent(true), false);
});

test('host withdrawal really requests a new document even when its marker changes only the URL fragment', () => {
  const app = environment();
  let current = new URL(app.window.location.href), newDocuments = 0;
  // Model standard browser navigation: fragment-only Location.replace changes
  // the URL but preserves the document and therefore loaded SDK listeners.
  app.window.location = {
    get href() { return current.href; }, get origin() { return current.origin; },
    get pathname() { return current.pathname; }, get search() { return current.search; }, get hash() { return current.hash; },
    replace(value) { const next = new URL(value, current); if (next.origin !== current.origin || next.pathname !== current.pathname || next.search !== current.search) newDocuments++; current = next; },
    reload() { newDocuments++; },
  };
  const controller = createMeasurementController({ externalEnabled: true, vendors: app.adapter, window: app.window });
  controller.setConsent(true);
  controller.setConsent(false);
  assert.equal(current.hash, '#measurement-declined');
  assert.ok(newDocuments >= 1, 'a fragment marker alone does not unload vendor code');
  assert.equal(app.window['ga-disable-' + VENDOR_ANALYTICS.ga4Id], true);
});

test('hard-navigation helper decides fragment reload before Location.assign synchronously changes the hash', () => {
  let current = new URL('https://exactmec.com/resources/#old'), newDocuments = 0, assignments = 0;
  const window = { location: {
    get href() { return current.href; }, get origin() { return current.origin; },
    get pathname() { return current.pathname; }, get search() { return current.search; }, get hash() { return current.hash; },
    assign(value) { const next = new URL(value, current); assignments++; if (next.origin !== current.origin || next.pathname !== current.pathname || next.search !== current.search) newDocuments++; current = next; },
    reload() { newDocuments++; },
  } };
  assert.equal(navigateForExternalMeasurement(window, '/resources/#cost'), true);
  assert.equal(current.hash, '#cost');
  assert.equal(newDocuments, 1, 'same-document anchor navigation must unload SDK listeners');
  assert.equal(navigateForExternalMeasurement(window, '/request-a-quote/'), true);
  assert.equal(current.pathname, '/request-a-quote/');
  assert.equal(newDocuments, 2, 'moving to the RFQ is a real document navigation');
  assert.equal(navigateForExternalMeasurement(window, 'https://other.example/private'), false);
  assert.equal(assignments, 2, 'helper does not intercept cross-origin links');
});

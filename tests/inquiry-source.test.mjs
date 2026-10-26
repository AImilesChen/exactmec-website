import test from 'node:test';
import assert from 'node:assert/strict';
import { createInquirySourceTracker, normalizeInquirySource, sourcePage, sourceReferrer, sourceTag } from '../src/source/inquiry-source.mjs';
import { buildInquiryPayload } from '../src/inquiry/model.mjs';

test('source tracker distinguishes first available page from submission without persisting or leaking raw URLs', () => {
  let url = 'https://exactmec.com/industries/led-lighting/?utm_source=google&utm_medium=cpc&utm_campaign=led-molds&email=private%40example.com&gclid=discard#project-private';
  const tracker = createInquirySourceTracker({ getUrl: () => url, getReferrer: () => 'https://www.google.com/search?q=private-project' });
  url = 'https://exactmec.com/request-a-quote/?utm_content=quote-button&name=Private';
  const snapshot = tracker.snapshot();
  assert.equal(snapshot.first.page, '/industries/led-lighting/');
  assert.equal(snapshot.first.utm_campaign, 'led-molds');
  assert.equal(snapshot.first.referrer, 'https://www.google.com');
  assert.equal(snapshot.submission.page, '/request-a-quote/');
  assert.equal(snapshot.submission.utm_content, 'quote-button');
  assert.equal(snapshot.submission.utm_source, null);
  assert.doesNotMatch(JSON.stringify(snapshot), /private|Private|gclid|email|search\?|#/);
  snapshot.first.page = '/';
  assert.equal(tracker.snapshot().first.page, '/industries/led-lighting/', 'caller cannot mutate the first snapshot');
});

test('unknown SSR context remains unknown and a fresh page does not invent a previous visit', () => {
  const missing = createInquirySourceTracker({ getUrl: () => undefined, getReferrer: () => undefined }).snapshot();
  assert.ok(Object.values(missing.first).every(value => value === null));
  assert.ok(Object.values(missing.submission).every(value => value === null));
  const refreshed = createInquirySourceTracker({ getUrl: () => 'https://exactmec.com/request-a-quote/', getReferrer: () => '' }).snapshot();
  assert.equal(refreshed.first.page, '/request-a-quote/');
  assert.equal(refreshed.first.utm_source, null);
});

test('source sanitization drops arbitrary paths, PII query strings, unsafe referrers and suspicious campaign labels', () => {
  for (const page of ['/customers/private-person/', '/request-a-quote/?email=private', '//evil.com/', '/privacy', '/404/', '/admin/leads/', '/industries/led-lighting/%2e%2e/']) assert.equal(sourcePage(page), null, page);
  for (const referrer of ['https://user:pass@example.com/private', 'javascript:alert(1)', 'http://localhost/', 'http://127.0.0.1/', 'https://example.com:8443/', null]) assert.equal(sourceReferrer(referrer), null);
  assert.equal(sourceReferrer('https://www.google.com/search?q=private#private'), 'https://www.google.com');
  for (const tag of ['private@example.com', '+8615990661727', '15990661727', 'person name', 'https://example.com', 'private%40example.com', 'x'.repeat(81), '=SUM(1)', ['cpc']]) assert.equal(sourceTag(tag), null);
  assert.equal(sourceTag('global-molds_Q4'), 'global-molds_Q4');
  const clean = normalizeInquirySource({ first: { page: '/', referrer: 'https://www.google.com/search?q=private', utm_source: 'google', email: 'private@example.com' }, submission: { page: '/request-a-quote/', utm_campaign: 'private@example.com' }, raw_url: 'private@example.com' });
  assert.equal(clean.first.utm_source, 'google');
  assert.equal(clean.submission.utm_campaign, null);
  assert.doesNotMatch(JSON.stringify(clean), /private|email|raw_url|\?/);
});

test('trusted published CMS paths survive tracker and payload cleaning but cannot be registered by source JSON', () => {
  const knownPaths = ['/industries/new-cms-mold-slug/'];
  let url = 'https://exactmec.com/industries/new-cms-mold-slug/?utm_source=google';
  const tracker = createInquirySourceTracker({ getUrl: () => url, knownPaths });
  url = 'https://exactmec.com/request-a-quote/';
  const source = tracker.snapshot();
  assert.equal(source.first.page, knownPaths[0]);
  assert.equal(buildInquiryPayload({}, source, knownPaths).source.first.page, knownPaths[0]);
  assert.equal(sourcePage(knownPaths[0]), null);
  assert.equal(normalizeInquirySource({ first: { page: knownPaths[0] }, knownPaths }).first.page, null);
  for (const path of ['/admin/private/', '/api/private/', '/new-cms/?email=private', '/new%2Dcms/', '/new-cms/#private']) assert.equal(sourcePage(path, [path]), null);
  assert.equal(sourcePage('/industries/led-lighting/', [], ['/industries/led-lighting/']), null, 'trusted withdrawal can block a static route');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildInquiryPayload, initialValues, notifyInquiryEvent, requiredFields, validateInquiry, whatsappContactHref, whatsappHref } from '../src/inquiry/model.mjs';

const { groups } = JSON.parse(readFileSync(new URL('../src/data/inquiry-copy.json', import.meta.url), 'utf8'));
const valid = () => ({ ...initialValues(), name: 'Sample Buyer', company: 'Individual / new business', email: 'buyer@example.com', phone: '+44 7700 900123', country: 'United Kingdom', city: 'London', component: 'Lighting housing', description: 'A custom aluminum mold inquiry.', drawing_status: 'Clear 2D part drawings', processing: true });

test('every contact/project requirement and purpose-limited processing choice is enforced', () => {
  assert.deepEqual(validateInquiry(valid(), groups), {});
  for (const key of requiredFields) assert.ok(validateInquiry({ ...valid(), [key]: '  ' }, groups)[key], key);
  assert.ok(validateInquiry({ ...valid(), processing: false }, groups).processing);
  assert.ok(validateInquiry({ ...valid(), processing: 'true' }, groups).processing);
  assert.equal(initialValues().whatsapp, false);
});

test('optional budget, timing, website and WhatsApp never prevent an ordinary inquiry', () => {
  const values = valid();
  for (const key of ['budget_status', 'budget_min', 'budget_max', 'currency', 'purchase_timing', 'website']) delete values[key];
  assert.deepEqual(validateInquiry(values, groups), {});
  assert.equal(buildInquiryPayload(values).whatsapp_messages_opt_in, false);
  assert.equal(buildInquiryPayload({ ...values, whatsapp: 'true' }).whatsapp_messages_opt_in, false);
});

test('clear 2D, 3D or physical sample declarations are accepted without upload', () => {
  for (const drawing_status of ['Clear 2D part drawings', '3D part model / drawings', 'A physical sample']) assert.deepEqual(validateInquiry({ ...valid(), drawing_status }, groups), {});
  assert.ok(validateInquiry({ ...valid(), drawing_status: 'Drawings received and verified' }, groups).drawing_status);
});

test('email, international number, safe website and field limits reject malformed values', () => {
  for (const email of ['a@', 'no-address', 'a b@example.com']) assert.ok(validateInquiry({ ...valid(), email }, groups).email);
  for (const phone of ['07700900123', '+abc1234567', '+1 234', '+1234567890123456']) assert.ok(validateInquiry({ ...valid(), phone }, groups).phone);
  for (const website of ['example.com', 'javascript:alert(1)', 'https://user:pass@example.com']) assert.ok(validateInquiry({ ...valid(), website }, groups).website);
  assert.ok(validateInquiry({ ...valid(), description: 'a'.repeat(4001) }, groups).description);
});

test('country and quantity conditional fields are validated and normalized', () => {
  assert.ok(validateInquiry({ ...valid(), country: 'Other country / region' }, groups).country_other);
  assert.ok(validateInquiry({ ...valid(), mold_sets: '0' }, groups).mold_sets);
  for (const mold_sets_other of ['5', '6.5', 'Infinity', '9007199254740992']) assert.ok(validateInquiry({ ...valid(), mold_sets: 'More than 5', mold_sets_other }, groups).mold_sets_other);
  const values = { ...valid(), country: 'Other country / region', country_other: ' New Zealand ', mold_sets: 'More than 5', mold_sets_other: '6' };
  assert.deepEqual(validateInquiry(values, groups), {});
  assert.equal(buildInquiryPayload(values).country, 'New Zealand');
  assert.equal(buildInquiryPayload(values).mold_sets, 6);
  assert.equal(buildInquiryPayload({ ...valid(), mold_sets: 'Not sure' }).mold_sets, null);
  assert.equal(buildInquiryPayload({ ...valid(), mold_sets: 'Not sure' }).mold_sets_unsure, true);
});

test('budget supports blank estimates, positive single amounts and ordered ranges', () => {
  const values = { ...valid(), budget_status: 'I have an estimated budget' };
  assert.deepEqual(validateInquiry(values, groups), {});
  for (const budget_min of ['0', '-1', 'garbage', 'Infinity', '1e1000']) assert.ok(validateInquiry({ ...values, budget_min, currency: 'USD' }, groups).budget_min);
  assert.ok(validateInquiry({ ...values, budget_min: '500' }, groups).currency);
  assert.ok(validateInquiry({ ...values, budget_min: '500', budget_max: '400', currency: 'USD' }, groups).budget_max);
  assert.deepEqual(validateInquiry({ ...values, budget_min: '500.50', budget_max: '500.50', currency: 'USD' }, groups), {});
  assert.ok(validateInquiry({ ...values, budget_min: '500', currency: 'Other currency', currency_other: 'dollars' }, groups).currency_other);
  assert.equal(buildInquiryPayload({ ...values, budget_min: '500', currency: 'Other currency', currency_other: 'nzd' }).currency, 'NZD');
});

test('payload is an allowlist; hidden budget values and unrelated data are discarded', () => {
  const payload = buildInquiryPayload({ ...valid(), budget_min: '500', budget_max: '1000', currency: 'USD', secret: 'not an inquiry field', analytics: { email: 'never' }, whatsapp: true });
  assert.equal(payload.budget_min, null);
  assert.equal(payload.budget_max, null);
  assert.equal(payload.currency, null);
  assert.equal(payload.budget_basis, 'per_mold_set');
  assert.equal(payload.whatsapp_messages_opt_in, true);
  assert.equal(payload.calls_opt_in, false);
  assert.equal(payload.secret, undefined);
  assert.equal(payload.analytics, undefined);
  assert.equal(payload.submitted_at, undefined, 'server owns receipt time');
});

test('WhatsApp URL contains only approved business number and generic reference draft', () => {
  const url = new URL(whatsappHref('+447700900999', 'EM_RANDOM_1234'));
  assert.equal(url.pathname, '/447700900999');
  assert.equal(url.searchParams.get('text'), 'Hello ExactMec, I would like to discuss my mold inquiry. Reference: EM_RANDOM_1234.');
  for (const reference of ['', '123', 'buyer@example.com', 'ref?email=private', '../secret']) assert.equal(whatsappHref('+447700900999', reference), null);
  for (const number of ['', 'example.com', '+000000000', '447700900999?secret=yes']) assert.equal(whatsappHref(number, 'EM_RANDOM_1234'), null);
});

test('manual WhatsApp contact has no customer text, reference or URL parameters', () => {
  const href = whatsappContactHref('+8615990661727');
  assert.equal(href, 'https://wa.me/8615990661727');
  assert.equal(new URL(href).search, '');
  assert.equal(new URL(href).hash, '');
  assert.equal(whatsappContactHref(''), null);
  assert.equal(whatsappContactHref(null), null);
});

test('inquiry callbacks emit only allowlisted anonymous names and statuses', () => {
  const events = [];
  const onEvent = (name, payload) => events.push({ name, payload });
  notifyInquiryEvent(onEvent, false, 'inquiry_started', { email: 'must never appear' });
  notifyInquiryEvent(onEvent, false, 'inquiry_submit_attempt', { description: 'must never appear' });
  for (const status of ['saved', 'duplicate']) notifyInquiryEvent(onEvent, false, 'inquiry_submit_success', status);
  for (const status of ['failed', 'pending', 'rate_limit', 'invalid']) notifyInquiryEvent(onEvent, false, 'inquiry_submit_failed', status);
  assert.deepEqual(events.slice(0, 2), [{ name: 'inquiry_started', payload: {} }, { name: 'inquiry_submit_attempt', payload: {} }]);
  assert.deepEqual(events.slice(2).map(event => event.payload), ['saved', 'duplicate', 'failed', 'pending', 'rate_limit', 'invalid'].map(status => ({ status })));
  const count = events.length;
  assert.equal(notifyInquiryEvent(onEvent, false, 'inquiry_submit_success', 'pending'), false);
  assert.equal(notifyInquiryEvent(onEvent, false, 'inquiry_submit_failed', { email: 'private@example.com' }), false);
  assert.equal(notifyInquiryEvent(onEvent, false, 'unknown_event', 'saved'), false);
  assert.equal(events.length, count);
});

test('review mode never invokes callbacks, and callback exceptions do not affect the form', () => {
  let called = false;
  assert.equal(notifyInquiryEvent(() => { called = true; }, true, 'inquiry_started'), false);
  assert.equal(notifyInquiryEvent(() => { called = true; }, true, 'inquiry_submit_success', 'saved'), false);
  assert.equal(called, false);
  assert.equal(notifyInquiryEvent(() => { throw new Error('optional adapter failed'); }, false, 'inquiry_submit_attempt'), false);
});

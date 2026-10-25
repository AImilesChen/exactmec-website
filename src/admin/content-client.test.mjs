import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminClient, AdminApiError } from './client.mjs';
import { buildContentPatch, createContentForm, validateContentPatch } from './content-model.mjs';
import pages from '../data/site-content.json' with { type: 'json' };

const hash = 'a'.repeat(64);
const page = { id: 'home', path: '/', title: 'Source title', h1: 'Source heading', description: 'Source description', phase: 'P0', sections: [{ id: 'main', heading: 'Source section', paragraphs: ['First source paragraph', 'Second source paragraph'], bullets: ['Source bullet'], cards: [{ title: 'Fixed card', href: '/products/' }], cta: { label: 'Fixed action', href: '/request-a-quote/' } }], faqs: [{ q: 'Source question?', a: 'Source answer.' }] };
const detail = () => ({ page, draft: null, revision: 0, sourceHash: hash, stale: false });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const session = () => json({ user: { email: 'operator@example.invalid' }, csrfToken: 'content-memory-csrf', localSynthetic: true });
const kind = expected => error => error instanceof AdminApiError && error.kind === expected;

test('content APIs use fixed same-origin paths and authenticated CSRF writes with revision zero', async () => {
  const calls = [];
  const client = createAdminClient({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/session')) return session();
    if (url === '/api/admin/content') return json({ items: [{ id: 'home', path: '/', h1: page.h1, title: page.title, phase: 'P0' }] });
    if (init.method === 'PATCH') return json({ ...detail(), draft: JSON.parse(init.body).patch, revision: 1 });
    return json(detail());
  } });
  await assert.rejects(client.saveContent('home', { revision: 0, sourceHash: hash, patch: { title: 'New title' } }), kind('csrf'));
  assert.equal(calls.length, 0);
  await client.session();
  const list = await client.listContent();
  assert.equal(list[0].id, 'home');
  assert.equal((await client.getContent('home')).revision, 0);
  const saved = await client.saveContent('home', { revision: 0, sourceHash: hash, patch: { title: 'New title' }, deploy: true });
  assert.equal(saved.revision, 1);
  const { url, init } = calls[3];
  assert.equal(url, '/api/admin/content/home');
  assert.equal(init.method, 'PATCH');
  assert.equal(init.headers['X-CSRF-Token'], 'content-memory-csrf');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.credentials, 'same-origin');
  assert.equal(init.redirect, 'error');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.deepEqual(JSON.parse(init.body), { revision: 0, sourceHash: hash, patch: { title: 'New title' } });
  assert.deepEqual(calls.map(call => call.url), ['/api/admin/session', '/api/admin/content', '/api/admin/content/home', '/api/admin/content/home']);
});

test('closed patch schema rejects routes, links, cards, tables, HTML and invalid controls without requests', async () => {
  let calls = 0;
  const client = createAdminClient({ fetchImpl: async () => { calls++; return session(); } });
  await client.session();
  const invalidPatches = [
    { path: '/changed/' }, { title: '<script>bad</script>' }, { title: 'Title\nnot single-line' },
    { description: 'a'.repeat(501) }, { title: 'Text \u0085 control' },
    { sections: [{ id: 'main', heading: 'Heading', cards: [] }] },
    { sections: [{ id: 'main', heading: 'Heading', table: {} }] },
    { sections: [{ id: 'main', heading: 'Heading', paragraphs: ['Text\twith tab'] }] },
    { sections: [{ id: 'main', heading: 'Heading', paragraphs: ['a'.repeat(4001)] }] },
    { sections: [{ id: 'main', heading: 'Heading', bullets: Array(31).fill('Bullet') }] },
    { sections: [{ id: 'main', heading: 'Heading' }, { id: 'main', heading: 'Duplicate id' }] },
    { faqs: [{ q: 'Question', a: 'Answer', href: 'https://outside.invalid' }] },
  ];
  for (const patch of invalidPatches) {
    assert.equal(validateContentPatch(patch), null);
    await assert.rejects(client.saveContent('home', { revision: 0, sourceHash: hash, patch }), kind('invalid'));
  }
  for (const id of ['../home', 'home?publish=true', 'https://outside.invalid', 'home/export']) await assert.rejects(client.getContent(id), kind('invalid'));
  await assert.rejects(client.saveContent('home', { revision: -1, sourceHash: hash, patch: {} }), kind('invalid'));
  await assert.rejects(client.saveContent('home', { revision: 0, sourceHash: 'old', patch: {} }), kind('invalid'));
  await assert.rejects(client.saveContent('home', { revision: 0, sourceHash: hash, patch: { sections: [{ id: 'main', heading: 'Heading', paragraphs: Array(20).fill('a'.repeat(4000)) }] } }), kind('invalid'));
  assert.equal(calls, 1);
});

test('form conversion merges editable draft text, preserves paragraph boundaries, and excludes fixed layout fields', () => {
  const form = createContentForm({ ...detail(), draft: { title: 'Draft title', sections: [{ id: 'main', heading: 'Draft section', paragraphs: ['Draft first', 'Draft second'] }], faqs: [{ q: 'Draft question', a: 'Draft answer' }] } });
  assert.equal(form.title, 'Draft title');
  assert.equal(form.h1, page.h1);
  assert.equal(form.sections[0].paragraphsText, 'Draft first\n\nDraft second');
  assert.equal(form.sections[0].bulletsText, 'Source bullet');
  form.sections[0].paragraphsText = 'One line\ncontinued paragraph\n\nSecond paragraph';
  form.sections[0].bulletsText = 'First item\nSecond item\n';
  form.sections[0].cards = [{ href: 'https://should-never-be-sent.invalid' }];
  form.path = '/never-send/';
  const patch = buildContentPatch(form);
  assert.deepEqual(patch.sections[0], { id: 'main', heading: 'Draft section', paragraphs: ['One line\ncontinued paragraph', 'Second paragraph'], bullets: ['First item', 'Second item'] });
  assert.deepEqual(Object.keys(patch).sort(), ['description', 'faqs', 'h1', 'sections', 'title']);
  assert.doesNotMatch(JSON.stringify(patch), /never-send|should-never|cards|cta|href/);
  assert.equal(page.sections[0].cards[0].href, '/products/');
});

test('every actual baseline page opens as a valid form without changing source objects', () => {
  const before = JSON.stringify(pages);
  assert.equal(pages.length, 24);
  for (const baseline of pages) assert.ok(buildContentPatch(createContentForm({ page: baseline, draft: null })), baseline.id);
  assert.equal(JSON.stringify(pages), before);
});

test('source and revision conflicts remain distinct and are never automatically replayed', async () => {
  for (const [code, expected] of [['source_conflict', 'source_conflict'], ['revision_conflict', 'conflict']]) {
    let calls = 0;
    const client = createAdminClient({ fetchImpl: async url => { calls++; return url.endsWith('/session') ? session() : json({ error: code, message: 'raw backend detail' }, 409); } });
    await client.session();
    await assert.rejects(client.saveContent('home', { revision: 0, sourceHash: hash, patch: { h1: 'Changed heading' } }), error => error.kind === expected && !error.message.includes('raw backend'));
    assert.equal(calls, 2);
  }
});

test('stale drafts load for review but export is rejected until rebased; export has only sourceHash and returns JSON Blob', async () => {
  const calls = [];
  let stale = true;
  const client = createAdminClient({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/session')) return session();
    if (url.endsWith('/export')) return stale ? json({ error: 'source_conflict' }, 409) : json(page);
    if (init.method === 'PATCH') { stale = false; return json({ ...detail(), draft: JSON.parse(init.body).patch, revision: 2 }); }
    return json({ ...detail(), draft: { title: 'Old draft' }, revision: 1, stale: true });
  } });
  await client.session();
  assert.equal((await client.getContent('home')).stale, true);
  await assert.rejects(client.exportContent('home', { sourceHash: hash }), kind('source_conflict'));
  await client.saveContent('home', { revision: 1, sourceHash: hash, patch: { title: 'Reviewed against current source' } });
  const file = await client.exportContent('home', { sourceHash: hash, publish: true });
  assert.ok(file instanceof Blob);
  assert.equal(JSON.parse(await file.text()).id, 'home');
  const exported = calls.at(-1);
  assert.equal(exported.url, '/api/admin/content/home/export');
  assert.equal(exported.init.method, 'POST');
  assert.equal(exported.init.headers['X-CSRF-Token'], 'content-memory-csrf');
  assert.deepEqual(JSON.parse(exported.init.body), { sourceHash: hash });
});

test('content failures never fall back to static baseline or expose raw backend text', async () => {
  const client = createAdminClient({ fetchImpl: async url => url.endsWith('/session') ? session() : json({ error: 'service_unavailable', message: 'private internal text' }, 503) });
  await client.session();
  await assert.rejects(client.listContent(), error => error.kind === 'unavailable' && !error.message.includes('private'));
  await assert.rejects(client.getContent('home'), kind('unavailable'));
  const malformed = createAdminClient({ fetchImpl: async url => url.endsWith('/session') ? session() : json({ ...detail(), sourceHash: 'untrusted' }) });
  await malformed.session();
  await assert.rejects(malformed.getContent('home'), kind('invalid_response'));
});

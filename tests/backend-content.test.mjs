import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleContent } from '../backend/content.mjs';

const baseline = JSON.parse(readFileSync(new URL('../src/data/site-content.json', import.meta.url), 'utf8'));
const home = baseline.find(page => page.id === 'home');
const actor = { id: 'synthetic-content-editor', email: 'editor@example.invalid' };
let mf; let db; let env;
const request = (path = '', method = 'GET', body) => new Request(`https://exactmec.com/api/admin/content${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}) });
const call = (path = '', method = 'GET', body) => handleContent(request(path, method, body), env, { actor });
const detail = async (id = 'home') => (await call(`/${id}`)).json();
const savedAudits = async () => (await db.prepare("SELECT count(*) AS n FROM content_audit WHERE action='saved'").first()).n;

before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("synthetic-content-only")}}', compatibilityDate: '2026-10-01', d1Databases: { DB: 'synthetic-content-tests' } }));
  db = await mf.getD1Database('DB');
  const migration = ['0002_content_drafts.sql','0004_content_publication.sql'].map(file => readFileSync(new URL('../migrations/'+file, import.meta.url), 'utf8')).join('\n');
  await db.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  env = { DB: db, CONTACT_HASH_SECRET: 'synthetic-content-secret-32-characters-minimum' };
});
after(async () => { await mf?.dispose(); });

test('content routes require verified actor, DB and strong configured audit secret', async () => {
  assert.equal((await handleContent(request(), env, {})).status, 401);
  assert.equal((await handleContent(request(), {}, { actor })).status, 503);
  assert.equal((await handleContent(request(), { ...env, CONTACT_HASH_SECRET: 'short' }, { actor })).status, 503);
  assert.equal((await handleContent(request('/home'), env, { actor: { email: actor.email } })).status, 401);
});

test('public API paths never return any draft, even to a caller with admin context', async () => {
  for (const path of ['/api/content', '/api/content/home', '/api/inquiries', '/about/', '/api/admin/content-other']) assert.equal(await handleContent(new Request(`https://exactmec.com${path}`), env, { actor }), null);
});

test('list and initial detail expose versioned baseline without mutating it', async () => {
  const response = await call();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const list = await response.json();
  assert.equal(list.items.length, baseline.length);
  assert.deepEqual(list.items[0], { id: home.id, path: home.path, h1: home.h1, title: home.title, phase: home.phase });
  const data = await detail();
  assert.deepEqual(data.page, home);
  assert.equal(data.draft, null);
  assert.equal(data.revision, 0);
  assert.equal(data.stale, false);
  assert.match(data.sourceHash, /^[a-f0-9]{64}$/);
});

test('unknown page ids and traversal-like paths cannot create draft routes', async () => {
  assert.equal((await call('/unknown-page')).status, 404);
  assert.equal((await call('/home%2Fexport')).status, 404);
  assert.equal((await call('/home/export', 'GET')).status, 405);
  assert.equal((await call('', 'PATCH', {})).status, 405);
  assert.equal((await call('/unknown-page', 'PATCH', { revision: 0, sourceHash: '0'.repeat(64), patch: { title: 'Synthetic title' } })).status, 404);
});

test('strict patch schema protects fixed identities, unsafe links, malformed collections and lead data envelopes', async () => {
  const { sourceHash } = await detail();
  const patches = [
    { path: '/invented-route/' }, { id: 'invented' }, { phase: 'P0' }, { kind: 'other' }, { email: 'private@example.invalid' }, { payload: { name: 'Synthetic lead' } },
    { sections: [{ id: 'project-facts', heading: 'Synthetic', href: 'https://example.invalid' }] },
    { sections: [{ id: 'project-facts', heading: 'Synthetic', cards: [{title:'Unsafe',text:'Unsafe',href:'https://example.invalid'}] }] },
    { sections: [{ id: 'project-facts', heading: 'Synthetic', table: [] }] },
    { sections: [{ id: 'project-facts', heading: 'Synthetic', image: '/invented.webp' }] },
    { sections: [{ id: 'unknown-section', heading: 'Synthetic' }] },
    { sections: [{ id: 'tooling', heading: 'Synthetic' }, { id: 'tooling', heading: 'Duplicate' }] },
    { faqs: [{ q: 'Synthetic?', a: 'Synthetic.', href: '/invented/' }] }
  ];
  for (const patch of patches) assert.equal((await call('/home', 'PATCH', { revision: 0, sourceHash, patch })).status, 422, JSON.stringify(Object.keys(patch)));
  assert.equal((await detail()).revision, 0);
});

test('bad types, control characters, HTML, oversized fields and arrays are rejected safely', async () => {
  const { sourceHash } = await detail();
  const patches = [null, [], { title: '' }, { title: 'x'.repeat(161) }, { title: 'Synthetic\nTitle' }, { h1: 'Synthetic\u0000heading' }, { h1: '<script>alert(1)</script>' }, { description: 123 }, { sections: [{ id: 'tooling' }] }, { sections: [{ id: 'tooling', heading: 'Synthetic', paragraphs: ['bad\ttext'] }] }, { sections: [{ id: 'tooling', heading: 'Synthetic', paragraphs: Array(21).fill('Synthetic') }] }, { faqs: Array(31).fill({ q: 'Synthetic?', a: 'Synthetic.' }) }, { faqs: [{ q: 'Synthetic?', a: 'x'.repeat(4001) }] }];
  for (const patch of patches) assert.equal((await call('/home', 'PATCH', { revision: 0, sourceHash, patch })).status, 422);
  const malformed = new Request('https://exactmec.com/api/admin/content/home', { method: 'PATCH', body: '{invalid json' });
  assert.deepEqual(await (await handleContent(malformed, env, { actor })).json(), { error: 'invalid_request' });
  assert.equal((await call('/home', 'PATCH', { revision: 0, sourceHash, patch: { title: 'x'.repeat(65536) } })).status, 400);
  assert.equal((await call('/home', 'PATCH', { revision: -1, sourceHash, patch: {} })).status, 422);
});

test('saving and export merge only editable copy while retaining baseline structure and links', async () => {
  const { sourceHash } = await detail();
  const patch = { title: 'Synthetic reviewed page title', h1: 'Synthetic reviewed heading', description: 'Synthetic description for an unpublished draft.', sections: [{ id: 'project-facts', heading: 'Synthetic section heading', paragraphs: ['Synthetic paragraph one.\nSynthetic continuation.'], bullets: ['Synthetic bullet.'] }], faqs: [{ q: 'Synthetic question?', a: 'Synthetic answer.' }] };
  const response = await call('/home', 'PATCH', { revision: 0, sourceHash, patch });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.revision, 1);
  assert.equal(data.stale, false);
  assert.deepEqual(data.page, home);
  assert.deepEqual(data.draft, patch);
  const list = await (await call()).json();
  assert.ok(list.items.find(page => page.id === 'home').draftUpdatedAt);
  assert.equal(list.items.find(page => page.id === 'home').title, home.title);
  const exported = await call('/home/export', 'POST', { sourceHash });
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('Content-Type'), /^application\/json/);
  assert.equal(exported.headers.get('Content-Disposition'), 'attachment; filename="home.json"');
  const merged = await exported.json();
  assert.equal(merged.h1, patch.h1);
  assert.equal(merged.path, home.path);
  assert.deepEqual(merged.sections[0].cards, home.sections[0].cards);
  assert.equal(merged.sections[0].heading, patch.sections[0].heading);
  assert.equal(merged.sections.length, home.sections.length);
  assert.deepEqual(merged.sections[1], home.sections[1]);
  assert.deepEqual(merged.faqs, patch.faqs);
  for (const key of Object.keys(home).filter(key => !['title', 'h1', 'description', 'sections', 'faqs'].includes(key))) assert.deepEqual(merged[key], home[key], key);
  assert.deepEqual((await detail()).page, home, 'export must never mutate the source');
});

test('revision conflicts and simultaneous edits allow only one atomic winner', async () => {
  const data = await detail();
  const before = await savedAudits();
  assert.equal((await call('/home', 'PATCH', { revision: 0, sourceHash: data.sourceHash, patch: {} })).status, 409);
  const responses = await Promise.all(['first', 'second'].map(suffix => call('/home', 'PATCH', { revision: data.revision, sourceHash: data.sourceHash, patch: { title: `Synthetic concurrent ${suffix}` } })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal((await detail()).revision, data.revision + 1);
  assert.equal(await savedAudits(), before + 1);
});

test('stale baseline hash is visible and blocks export until a deliberate reviewed rebase save', async () => {
  const data = await detail();
  const oldHash = '0'.repeat(64);
  assert.notEqual(data.sourceHash, oldHash);
  assert.equal((await call('/home', 'PATCH', { revision: data.revision, sourceHash: oldHash, patch: { title: 'Synthetic stale source' } })).status, 409);
  await db.prepare('UPDATE content_drafts SET source_hash=?,patch_json=? WHERE page_id=?').bind(oldHash, JSON.stringify({ sections: [{ id: 'old-removed-section', heading: 'Synthetic prior-baseline section' }] }), 'home').run();
  const stale = await detail();
  assert.equal(stale.stale, true);
  assert.equal(stale.sourceHash, data.sourceHash);
  assert.equal(stale.draft.sections[0].id, 'old-removed-section');
  const blocked = await call('/home/export', 'POST', { sourceHash: stale.sourceHash });
  assert.equal(blocked.status, 409);
  assert.deepEqual(await blocked.json(), { error: 'source_conflict' });
  const rebased = await call('/home', 'PATCH', { revision: stale.revision, sourceHash: stale.sourceHash, patch: { title: 'Synthetic reviewed rebase' } });
  assert.equal(rebased.status, 200);
  assert.equal((await rebased.json()).stale, false);
  assert.equal((await call('/home/export', 'POST', { sourceHash: oldHash })).status, 409);
  const exported = await (await call('/home/export', 'POST', { sourceHash: stale.sourceHash })).json();
  assert.deepEqual(exported.sections, home.sections);
  assert.equal(exported.h1, home.h1, 'each save replaces the patch; absent fields fall back to baseline');
});

test('D1 failure rolls back the draft and audit together, for insert and update', async () => {
  const failingDb = { prepare: sql => db.prepare(sql), batch: statements => db.batch([...statements, db.prepare("INSERT INTO content_audit(id,actor_hash,page_hash,action,revision,created_at) VALUES('synthetic-rollback','hash','hash','invalid-action',1,'synthetic')")]) };
  const brokenEnv = { ...env, DB: failingDb };
  const before = await savedAudits();
  const initial = await detail('about');
  const insert = await handleContent(request('/about', 'PATCH', { revision: 0, sourceHash: initial.sourceHash, patch: { title: 'Synthetic rolled-back insert' } }), brokenEnv, { actor });
  assert.equal(insert.status, 503);
  assert.equal((await detail('about')).revision, 0);
  const current = await detail();
  const update = await handleContent(request('/home', 'PATCH', { revision: current.revision, sourceHash: current.sourceHash, patch: { title: 'Synthetic rolled-back update' } }), brokenEnv, { actor });
  assert.equal(update.status, 503);
  assert.deepEqual((await detail()).draft, current.draft);
  assert.equal((await detail()).revision, current.revision);
  assert.equal(await savedAudits(), before);
  assert.deepEqual(await update.json(), { error: 'service_unavailable' });
});

test('audit stores only hashes, event, revision and time, never copy or contact text', async () => {
  const audit = await db.prepare('SELECT * FROM content_audit').all();
  assert.ok(audit.results.length > 0);
  assert.ok(audit.results.some(row => row.action === 'saved'));
  assert.ok(audit.results.some(row => row.action === 'exported'));
  for (const row of audit.results) {
    assert.match(row.actor_hash, /^[a-f0-9]{64}$/);
    assert.match(row.page_hash, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(row).sort(), ['action', 'actor_hash', 'created_at', 'id', 'page_hash', 'revision']);
  }
  assert.doesNotMatch(JSON.stringify(audit.results), /editor@example|Synthetic reviewed|Synthetic paragraph|old-removed-section/);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../src/data/site-content.json', import.meta.url), 'utf8')), baseline, 'draft operations never write source files');
});

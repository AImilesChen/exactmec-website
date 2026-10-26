import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleContent, loadContentPreview } from '../backend/content.mjs';
import { loadPublicContent, resolvePublishedContent, publishedSitemapPages } from '../backend/content-public.mjs';
import { validateContentPatch, mediaLibrary } from '../src/cms/schema.mjs';

let mf, db, env;
const actor = { id: 'synthetic-publisher', email: 'publisher@example.invalid' };
const request = (path, method = 'GET', body) => new Request('https://exactmec.com/api/admin/' + path, { method, ...(method === 'GET' ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) });
const call = (path, method = 'GET', body) => handleContent(request(path, method, body), env, { actor });
const detail = async id => (await call('content/' + id)).json();
const confirmation = data => ({ revision: data.revision, sourceHash: data.sourceHash, publicationRevision: data.publication.revision });
async function save(id, patch) { const data = await detail(id); const response = await call('content/' + id, 'PATCH', { revision: data.revision, sourceHash: data.sourceHash, patch }); assert.equal(response.status, 200); return response.json(); }
before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default{fetch(){return new Response("synthetic-cms")}}', compatibilityDate: '2026-10-01', d1Databases: { DB: 'synthetic-publication-tests' } }));
  db = await mf.getD1Database('DB');
  for (const file of ['0002_content_drafts.sql', '0004_content_publication.sql']) {
    await db.batch(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8').split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  }
  env = { DB: db, CMS_ENABLED: 'true', CONTACT_HASH_SECRET: 'synthetic-cms-audit-secret-at-least-32-characters' };
});
after(async () => { await mf?.dispose(); });

test('CMS off performs zero DB reads and public reader never exposes unpublished drafts', async () => {
  let reads = 0;
  assert.deepEqual(await loadPublicContent({ CMS_ENABLED: 'false', DB: { prepare() { reads++; throw Error(); } } }), { pages: [], routes: {}, withdrawn: [], settings: {} });
  assert.equal(reads, 0);
  await save('about', { h1: 'Synthetic private draft heading' });
  const bundle = await loadPublicContent(env);
  assert.equal(bundle.pages.length, 0);
  assert.doesNotMatch(JSON.stringify(bundle), /private draft heading/);
});

test('reviewed publication creates an immutable snapshot; later draft changes do not leak publicly', async () => {
  const data = await detail('about');
  const response = await call('content/about/publish', 'POST', confirmation(data));
  assert.equal(response.status, 200);
  const published = await response.json();
  assert.equal(published.publication.revision, 1);
  assert.equal(published.publication.state, 'published');
  const bundle = await loadPublicContent(env);
  assert.equal(resolvePublishedContent('/about/', bundle).page.h1, 'Synthetic private draft heading');
  assert.ok(bundle.pages[0].publishedAt);
  await save('about', { h1: 'Synthetic newer unapproved draft' });
  assert.equal(resolvePublishedContent('/about/', await loadPublicContent(env)).page.h1, 'Synthetic private draft heading');
  const preview = await loadContentPreview(env, 'about');
  assert.equal(preview.page.h1, 'Synthetic newer unapproved draft');
  assert.equal(preview.bundle.preview, true);
});

test('publish rejects stale draft/source/publication versions and simultaneous publishers have one winner', async () => {
  const data = await detail('about');
  assert.equal((await call('content/about/publish', 'POST', { ...confirmation(data), revision: data.revision - 1 })).status, 409);
  assert.equal((await call('content/about/publish', 'POST', { ...confirmation(data), sourceHash: 'f'.repeat(64) })).status, 409);
  assert.equal((await call('content/about/publish', 'POST', { ...confirmation(data), publicationRevision: 0 })).status, 409);
  const results = await Promise.all([call('content/about/publish', 'POST', confirmation(data)), call('content/about/publish', 'POST', confirmation(data))]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
  const audits = await db.prepare("SELECT count(*) AS n FROM content_publication_audit WHERE action='published'").first();
  assert.equal(audits.n, 2);
});

test('safe slug changes keep original and prior aliases; baseline/private/path conflicts are rejected', async () => {
  const saved = await save('about', { path: '/company-profile/', h1: 'Synthetic profile' });
  assert.equal((await call('content/about/publish', 'POST', confirmation(saved))).status, 200);
  let bundle = await loadPublicContent(env);
  assert.equal(resolvePublishedContent('/about/', bundle).redirect, '/company-profile/');
  assert.equal(resolvePublishedContent('/company-profile', bundle).redirect, '/company-profile/');
  assert.equal(resolvePublishedContent('/company-profile/', bundle).status, 200);
  const next = await save('about', { path: '/company/', h1: 'Synthetic company' });
  assert.equal((await call('content/about/publish', 'POST', confirmation(next))).status, 200);
  bundle = await loadPublicContent(env);
  assert.equal(resolvePublishedContent('/company-profile/', bundle).redirect, '/company/');
  assert.ok(publishedSitemapPages(bundle).some(page => page.path === '/company/'));
  assert.ok(!publishedSitemapPages(bundle).some(page => page.path === '/about/'));
  const data = await detail('resources');
  for(const path of ['/products/','/privacy/','/terms/','/404/','/privacy-policy/']) assert.equal((await call('content/resources', 'PATCH', { revision: data.revision, sourceHash: data.sourceHash, patch: { path } })).status, 422);
  const competing = await save('resources', { path: '/company/' });
  assert.equal((await call('content/resources/publish', 'POST', confirmation(competing))).status, 409);
  for (const path of ['/api/leads/', '/admin/', '//outside.invalid/', '/a%2fb/', '/a/../b/']) assert.equal(validateContentPatch({ path }), null);
});

test('withdraw removes public page and aliases from sitemap; a deliberate republish restores it', async () => {
  let data = await detail('about');
  const response = await call('content/about/withdraw', 'POST', confirmation(data));
  assert.equal(response.status, 200);
  let bundle = await loadPublicContent(env);
  assert.equal(bundle.pages.some(page => page.id === 'about'), false);
  assert.equal(resolvePublishedContent('/about/', bundle).status, 410);
  assert.equal(resolvePublishedContent('/company-profile/', bundle).status, 410);
  assert.equal(publishedSitemapPages(bundle).some(page => page.path === '/company/'), false);
  data = await detail('about');
  assert.equal((await call('content/about/publish', 'POST', confirmation(data))).status, 200);
  bundle = await loadPublicContent(env);
  assert.equal(resolvePublishedContent('/company/', bundle).status, 200);
  const home = await save('home', { h1: 'Synthetic home' });
  assert.equal((await call('content/home/publish', 'POST', confirmation(home))).status, 200);
  assert.equal((await call('content/home/withdraw', 'POST', confirmation(await detail('home')))).status, 422);
});

test('media schema binds known local assets, Alt, honest public captions and source notes', async () => {
  const image = { original: mediaLibrary[0].path, path: mediaLibrary[1].path, alt: 'Illustrative mold machining', caption: 'Illustrative manufacturing scene', source: 'Original generated asset, not delivered work.', kind: 'generated' };
  assert.ok(validateContentPatch({ media: [image] }));
  for (const change of [{ path: 'https://tracking.invalid/pixel.png' }, { path: '/assets/not-known.webp' }, { alt: '<img onerror=alert(1)>' }, { kind: 'own-factory' }, { caption: 'Our certified factory' }, { source: '' }]) assert.equal(validateContentPatch({ media: [{ ...image, ...change }] }), null);
  const data = await save('core-mold', { media: [image], sections: [{ id: 'requirements', heading: 'Synthetic requirements', cards: [{ title: 'Synthetic card', text: 'Synthetic plain text.', href: '/request-a-quote/' }] }] });
  assert.equal((await call('content/core-mold/publish', 'POST', confirmation(data))).status, 200);
  const page = resolvePublishedContent('/aluminum-die-casting-molds/', await loadPublicContent(env)).page;
  assert.deepEqual(page.media, [image]);
  assert.equal(page.sections[0].cards[0].title, 'Synthetic card');
});

test('settings only permit verified public email, retain optimism and never change notification/login bindings', async () => {
  const first = await (await call('content-settings')).json();
  const settings = { ...first.settings, address: 'Synthetic public correspondence address' };
  assert.equal((await call('content-settings', 'PATCH', { revision: first.revision, settings: { ...settings, contactEmail: 'unverified@example.invalid' } })).status, 422);
  assert.equal((await call('content-settings', 'PATCH', { revision: first.revision, settings, NOTIFY_TO: 'other@example.invalid' })).status, 422);
  assert.equal((await call('content-settings', 'PATCH', { revision: first.revision, settings })).status, 200);
  assert.equal((await call('content-settings', 'PATCH', { revision: first.revision, settings })).status, 409);
  const bundle = await loadPublicContent(env);
  assert.equal(bundle.settings.address, settings.address);
  assert.equal(bundle.settings.contactEmail, 'sales@exactmec.com');
  assert.equal(env.NOTIFY_TO, undefined);
  assert.equal(env.ACCESS_ALLOWED_EMAILS, undefined);
});

test('publications, versions, aliases and audit roll back together on DB failure', async () => {
  const data = await save('quality-control', { path: '/quality-review/', h1: 'Synthetic atomic publication' });
  const badEnv = { ...env, DB: { prepare: sql => db.prepare(sql), batch: statements => db.batch([...statements, db.prepare("INSERT INTO content_publication_audit(id,actor_hash,page_hash,action,revision,created_at) VALUES('synthetic-invalid','h','h','invalid',1,'time')")]) } };
  const response = await handleContent(request('content/quality-control/publish', 'POST', confirmation(data)), badEnv, { actor });
  assert.equal(response.status, 503);
  assert.equal((await detail('quality-control')).publication.revision, 0);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM content_aliases WHERE page_id=?').bind('quality-control').first()).n, 0);
});


test('draft links can be unfinished, but publish rejects missing pages, missing hashes and withdrawn targets', async () => {
  const before=(await detail('resource-mold-cost')).publication.revision;
  const patches=[
    {related_links:[{label:'Unfinished',href:'/not-a-real-page/'}]},
    {related_links:[{label:'Missing hash',href:'/about/#not-a-real-anchor'}]},
    {related_links:[{label:'Missing legal hash',href:'/privacy#legal-9999'}]},
    {sections:[{id:'cost-drivers',heading:'Synthetic',cards:[{title:'Broken card',text:'Synthetic text.',href:'/does-not-exist/'}]}]},
    {sections:[{id:'cost-drivers',heading:'Synthetic',cta:{label:'Broken action',href:'/does-not-exist/'}}]},
    {final_cta:{heading:'Synthetic CTA',text:'Synthetic body.',label:'Broken final action',href:'/no-such-page/'}},
  ];
  // Use a real section ID, independently of the source copy labels.
  const source=(await detail('resource-mold-cost')).page;
  for(const patch of patches){if(patch.sections)patch.sections[0].id=source.sections[0].id;const data=await save(source.id,patch);const response=await call(`content/${source.id}/publish`,'POST',confirmation(data));assert.equal(response.status,422);assert.equal((await response.json()).error,'invalid_links');assert.equal((await detail(source.id)).publication.revision,before);}
  let target=await save('quality-control',{h1:'Synthetic quality target'});
  assert.equal((await call('content/quality-control/publish','POST',confirmation(target))).status,200);
  target=await detail('quality-control');
  assert.equal((await call('content/quality-control/withdraw','POST',confirmation(target))).status,200);
  const blocked=await save(source.id,{related_links:[{label:'Withdrawn target',href:'/quality-control/'}]});
  assert.equal((await call(`content/${source.id}/publish`,'POST',confirmation(blocked))).status,422);
  const good=await save(source.id,{related_links:[{label:'Renamed page with original path',href:'/about/#operator'},{label:'Renamed page canonical',href:'/company/#operator'},{label:'Legal section',href:'/privacy#legal-1'},{label:'Prepared application fallback',href:'/industries/automotive/'}]});
  const response=await call(`content/${source.id}/publish`,'POST',confirmation(good));assert.equal(response.status,200);
});

test('a target publication changing after link validation prevents a stale publish commit',async()=>{
  const data=await save('resource-development-process',{related_links:[{label:'Current company',href:'/company/#operator'}]});
  const before=(await detail('resource-development-process')).publication.revision;
  let intercepted=false;
  const racedEnv={...env,DB:{prepare:sql=>db.prepare(sql),batch:async statements=>{
    if(!intercepted){intercepted=true;await db.prepare("UPDATE content_publications SET state='withdrawn',revision=revision+1 WHERE page_id='about'").run();}
    return db.batch(statements);
  }}};
  const response=await handleContent(request('content/resource-development-process/publish','POST',confirmation(data)),racedEnv,{actor});
  assert.equal(response.status,409);assert.equal((await detail('resource-development-process')).publication.revision,before);
  // Restore only this synthetic fixture for other tests.
  await db.prepare("UPDATE content_publications SET state='published',revision=revision+1 WHERE page_id='about'").run();
});

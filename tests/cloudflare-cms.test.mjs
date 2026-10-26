import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import worker from '../cloudflare/worker.mjs';
import { handleContent, loadContentPreview } from '../backend/content.mjs';
import { renderPublishedHtml } from '../cloudflare/cms-response.mjs';

const actor = { id: 'synthetic-worker-content-editor', email: 'editor@example.invalid' };
let mf, db, env;
const output = new URL('../dist/public/', import.meta.url);
const call = (id, method = 'GET', body, suffix = '') => handleContent(new Request(`https://exactmec.com/api/admin/content/${id}${suffix}`, {
  method, headers: { 'Content-Type': 'application/json' }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
}), env, { actor });
const detail = async id => (await call(id)).json();
const confirmation = data => ({ revision: data.revision, sourceHash: data.sourceHash, publicationRevision: data.publication.revision });
async function save(id, patch) {
  const data = await detail(id);
  const response = await call(id, 'PATCH', { revision: data.revision, sourceHash: data.sourceHash, patch });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  return response.json();
}
async function publish(id, patch) {
  const data = await save(id, patch);
  const response = await call(id, 'POST', confirmation(data), '/publish');
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  return response.json();
}
const request = (path, overrides = {}, init) => worker.fetch(new Request('https://exactmec.com' + path, init), { ...env, ...overrides });
const bootstrap = html => JSON.parse(html.match(/<script type="application\/json" id="site-bootstrap">([\s\S]*?)<\/script>/)?.[1] || 'null');

before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("synthetic-only"); } }', compatibilityDate: '2026-10-01', d1Databases: { DB: 'synthetic-worker-cms-tests' } }));
  db = await mf.getD1Database('DB');
  for (const file of ['0002_content_drafts.sql', '0004_content_publication.sql']) {
    const sql = await fs.readFile(new URL('../migrations/' + file, import.meta.url), 'utf8');
    await db.batch(sql.split(';').map(part => part.trim()).filter(Boolean).map(part => db.prepare(part)));
  }
  env = { DB: db, SITE_ORIGIN: 'https://exactmec.com', CMS_ENABLED: 'true', RELEASE: 'false', LEGAL_APPROVED: 'false', COLLECTION_ENABLED: 'false', CONTACT_HASH_SECRET: 'synthetic-content-worker-audit-secret-at-least-32', ASSETS: { async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path.includes('..')) return new Response('Not found', { status: 404 });
    try { const body = await fs.readFile(new URL('.' + path, output)); return new Response(body, { headers: { 'Content-Type': path.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  } } };
});
after(async () => { await mf?.dispose(); });

test('unpublished draft never enters Worker HTML; publication supplies SSR metadata and matching hydration data', async () => {
  await save('about', { h1: 'Synthetic private draft heading', title: 'Synthetic private draft title' });
  const before = await request('/about/');
  assert.equal(before.status, 200);
  assert.doesNotMatch(await before.text(), /Synthetic private draft/);
  await publish('about', { h1: 'Synthetic published heading', title: 'Synthetic published title', description: 'Synthetic published description.' });
  const response = await request('/about/');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex,nofollow');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Set-Cookie'), null);
  const html = await response.text();
  assert.match(html, /<h1[^>]*>Synthetic published heading<\/h1>/);
  assert.match(html, /<title>Synthetic published title<\/title>/);
  assert.match(html, /<meta name="description" content="Synthetic published description\."/);
  const data = bootstrap(html);
  assert.equal(data.initialUrl, '/about/');
  assert.equal(data.cmsBundle.pages.find(page => page.id === 'about').h1, 'Synthetic published heading');
  assert.equal(data.config.inquiryEnabled, false);
  assert.equal(data.config.analyticsEnabled, false);
  assert.equal((html.match(/id="root"/g) || []).length, 1);
  assert.equal((html.match(/id="site-bootstrap"/g) || []).length, 1);
  assert.doesNotMatch(html, /Synthetic private draft/);
});

test('renaming a published page rewrites canonical, old path redirect, navigation and sitemap without alias chains', async () => {
  await publish('about', { path: '/company-background/', h1: 'Synthetic renamed company heading', title: 'Synthetic renamed title' });
  const old = await request('/about/');
  assert.equal(old.status, 308);
  assert.equal(old.headers.get('Location'), '/company-background/');
  const response = await request('/company-background/', { RELEASE: 'true', LEGAL_APPROVED: 'true' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Robots-Tag'), 'index,follow');
  const html = await response.text();
  assert.match(html, /<h1[^>]*>Synthetic renamed company heading<\/h1>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/exactmec\.com\/company-background\/"/);
  assert.equal(bootstrap(html).initialUrl, '/company-background/');
  const home = await (await request('/')).text();
  assert.match(home, /href="\/company-background\/"/);
  const sitemap = await (await request('/sitemap.xml', { RELEASE: 'true' })).text();
  assert.match(sitemap, /<loc>https:\/\/exactmec\.com\/company-background\/<\/loc>/);
  assert.doesNotMatch(sitemap, /<loc>https:\/\/exactmec\.com\/about\/<\/loc>/);
  await publish('about', { path: '/company-story/', h1: 'Synthetic second renamed heading' });
  for (const path of ['/about/', '/company-background/']) {
    const alias = await request(path);
    assert.equal(alias.status, 308);
    assert.equal(alias.headers.get('Location'), '/company-story/');
  }
});

test('withdrawal returns 410 at original, current and alias paths and removes public navigation/sitemap entries', async () => {
  const data = await detail('about');
  const withdrawn = await call('about', 'POST', confirmation(data), '/withdraw');
  assert.equal(withdrawn.status, 200);
  for (const path of ['/about/', '/company-background/', '/company-story/']) assert.equal((await request(path)).status, 410, path);
  const html = await (await request('/')).text();
  assert.doesNotMatch(html, /href="\/(?:about|company-background|company-story)\/"/);
  const sitemap = await (await request('/sitemap.xml', { RELEASE: 'true' })).text();
  assert.doesNotMatch(sitemap, /<loc>https:\/\/exactmec\.com\/(?:about|company-background|company-story)\/<\/loc>/);
});

test('CMS rendering cannot bypass legal gate or independently enable RFQ collection', async () => {
  assert.equal((await request('/privacy', { RELEASE: 'true', LEGAL_APPROVED: 'false' })).status, 404);
  const data = await publish('rfq', { h1: 'Synthetic edited inquiry heading', intro: 'Synthetic edited inquiry introduction.' });
  assert.equal((await call('rfq', 'POST', confirmation(data), '/withdraw')).status, 422);
  const response = await request('/request-a-quote/', { RELEASE: 'true', LEGAL_APPROVED: 'true', COLLECTION_ENABLED: 'true', BACKEND_VERIFIED: 'false', CONTACT_EMAIL_VERIFIED: 'true' });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<h1[^>]*>Synthetic edited inquiry heading<\/h1>/);
  assert.match(html, /Synthetic edited inquiry introduction\./);
  assert.equal(bootstrap(html).config.inquiryEnabled, false);
  assert.match(html, /Online submission unavailable/);
  assert.equal((await request('/api/inquiries', {}, { method: 'POST', headers: { Origin: 'https://exactmec.com', 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
});

test('saved preview bootstrap uses the rendered public path so iframe hydration does not resolve its authenticated URL as 404', async () => {
  await save('about', { path: '/company-preview/', h1: 'Synthetic preview-only heading' });
  const preview = await loadContentPreview(env, 'about');
  const shell = await fs.readFile(new URL('about/index.html', output), 'utf8');
  const response = renderPublishedHtml(shell, preview.page.path, env, preview.bundle, preview.page, preview.originalPath);
  const html = await response.text();
  assert.match(html, /<h1[^>]*>Synthetic preview-only heading<\/h1>/);
  assert.equal(bootstrap(html).initialUrl, '/company-preview/');
  assert.equal(bootstrap(html).cmsBundle.preview, true);
  assert.equal(bootstrap(html).config.release, false);
  assert.equal((await request('/company-preview/')).status, 404);
  assert.equal((await request('/admin/content/about/preview')).status, 404);
});

test('authenticated preview remains private, no-store, noindex and only same-origin frameable', async t => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'worker-closeout', alg: 'RS256', use: 'sig' };
  const team = 'closeout-test.cloudflareaccess.com';
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    if (String(input) === `https://${team}/cdn-cgi/access/certs`) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } });
    return originalFetch(input, init);
  });
  const token = await new SignJWT({ email: actor.email, type: 'app' }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(`https://${team}`).setAudience('worker-cms-test').setSubject(actor.id).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const response = await request('/admin/content/about/preview', { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: 'worker-cms-test', ADMIN_EMAILS: actor.email }, { headers: { 'Cf-Access-Jwt-Assertion': token } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex,nofollow');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'self'/);
  assert.equal(bootstrap(await response.text()).initialUrl, '/company-preview/');
});

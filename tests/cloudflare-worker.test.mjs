import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../cloudflare/worker.mjs';

function harness({ release = false, approved = false, files = {} } = {}) {
  const calls = [];
  const env = { RELEASE: String(release), LEGAL_APPROVED: String(approved), ASSETS: { fetch: async request => {
    const path = new URL(request.url).pathname;
    calls.push(path);
    const file = files[path];
    return new Response(file?.body || 'Missing', { status: file ? 200 : 404, headers: { 'Content-Type': file?.type || 'text/plain', 'Set-Cookie': 'unexpected=true' } });
  } } };
  return { calls, fetch: (path, options) => worker.fetch(new Request('https://preview.example' + path, options), env) };
}
const html = body => ({ body, type: 'text/html; charset=utf-8' });

test('serves route-specific static HTML and keeps staging and drafts noindex', async () => {
  const app = harness({ files: { '/index.html': html('Home'), '/about/index.html': html('About'), '/privacy/index.html': html('Draft privacy') } });
  for (const [path, expected] of [['/', 'Home'], ['/about/?utm_source=test', 'About'], ['/privacy', 'Draft privacy']]) {
    const response = await app.fetch(path);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), expected);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex,nofollow');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Set-Cookie'), null);
  }
  assert.deepEqual(app.calls, ['/index.html', '/about/index.html', '/privacy/index.html']);
});

test('release approval gates legal pages and distinguishes marketing and system robots', async () => {
  const files = { '/index.html': html('Home'), '/privacy/index.html': html('Privacy'), '/inquiry-received/index.html': html('Start an inquiry'), '/404.html': html('Not found') };
  const blocked = harness({ release: true, files });
  assert.equal((await blocked.fetch('/privacy')).status, 404);
  assert.ok(!blocked.calls.includes('/privacy/index.html'));
  const released = harness({ release: true, approved: true, files });
  assert.equal((await released.fetch('/')).headers.get('X-Robots-Tag'), 'index,follow');
  assert.equal((await released.fetch('/privacy')).headers.get('X-Robots-Tag'), 'noindex,follow');
  assert.equal((await released.fetch('/inquiry-received/')).headers.get('X-Robots-Tag'), 'noindex,nofollow');
});

test('unknown, prepared and aliases have explicit status instead of a 200 SPA fallback', async () => {
  const app = harness({ files: { '/index.html': html('Home'), '/404.html': html('Not found') } });
  const unknown = await app.fetch('/unknown/');
  assert.equal(unknown.status, 404);
  assert.equal(await unknown.text(), 'Not found');
  assert.ok(!app.calls.includes('/index.html'));
  for (const [from, to] of [['/industries/automotive/', '/industries/#industry-automotive'], ['/about', '/about/'], ['/privacy-policy/', '/privacy']]) {
    const response = await app.fetch(from);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('Location'), to);
  }
});

test('API returns unavailable and write methods never invoke assets or process form data', async () => {
  const app = harness();
  for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await app.fetch('/api/inquiries', { method, ...(method === 'POST' ? { body: 'synthetic-only' } : {}) });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex,nofollow');
  }
  assert.equal((await app.fetch('/request-a-quote/', { method: 'POST', body: 'synthetic-only' })).status, 405);
  assert.deepEqual(app.calls, []);
});

test('only runtime asset allowlist is served, with no internal artifacts or host fallback HTML', async () => {
  const app = harness({ files: { '/assets/app.js': { body: 'code', type: 'text/javascript' }, '/assets/missing.js': html('host SPA fallback'), '/downloads/package.zip': { body: 'private package', type: 'application/zip' }, '/404.html': html('Missing') } });
  assert.equal((await app.fetch('/assets/app.js')).status, 200);
  assert.equal((await app.fetch('/assets/missing.js')).status, 404);
  for (const path of ['/downloads/package.zip', '/source/App.jsx', '/src/seo/metadata.mjs', '/design-previews/home.jpg', '/design-system/', '/admin/leads/', '/.git/config', '/assets/file.zip', '/assets/app.js.map']) assert.equal((await app.fetch(path)).status, 404, path);
  assert.ok(!app.calls.includes('/downloads/package.zip'));
  assert.ok(!app.calls.includes('/src/seo/metadata.mjs'));
});

test('HEAD has representation headers and no body, and responses carry static-compatible security headers', async () => {
  const app = harness({ files: { '/index.html': html('Home') } });
  const response = await app.fetch('/', { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Content-Security-Policy'), /script-src 'self'/);
  assert.match(response.headers.get('Content-Security-Policy'), /style-src 'self' 'unsafe-inline'/);
  assert.equal((await app.fetch('/missing', { method: 'HEAD' })).status, 404);
});

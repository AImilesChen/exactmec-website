import assert from 'node:assert/strict';
import test from 'node:test';
import pages from '../src/data/site-content.json' with { type: 'json' };
import manifest from '../src/data/site-manifest.json' with { type: 'json' };
import { getPageMeta } from '../src/seo/metadata.mjs';
import { PUBLIC_ROUTES, resolvePublicRoute } from '../src/seo/route-contract.mjs';

test('public contract contains twenty-four P0 marketing pages, four legal contracts and two systems', () => {
  assert.equal(PUBLIC_ROUTES.length, 30);
  assert.equal(PUBLIC_ROUTES.filter(route => !['legal', 'system'].includes(route.kind)).length, 24);
  assert.equal(PUBLIC_ROUTES.filter(route => route.kind === 'legal').length, 4);
  assert.equal(PUBLIC_ROUTES.filter(route => route.kind === 'system').length, 2);
  for (const route of PUBLIC_ROUTES) assert.equal(resolvePublicRoute(route.path).status, route.id === '404' ? 404 : 200);
  assert.equal(resolvePublicRoute('/how-we-work/').redirect, '/about/#how-we-work');
});

test('prepared industry details redirect directly to the remaining P0 anchors', () => {
  for (const [path, target] of Object.entries(manifest.p0_link_fallbacks)) {
    for (const candidate of [path, path.slice(0, -1)]) {
      const route = resolvePublicRoute(candidate);
      assert.equal(route.status, 308);
      assert.equal(route.redirect, target);
    }
  }
});

test('canonical paths, queries, legal aliases and draft gates are deterministic', () => {
  assert.equal(resolvePublicRoute('/about?utm_source=test').redirect, '/about/');
  assert.equal(resolvePublicRoute('/about/?utm_source=test#details').status, 200);
  for (const [alias, target] of [['privacy-policy', 'privacy'], ['terms-of-use', 'terms'], ['cookie-policy', 'cookies'], ['confidentiality', 'project-information']]) {
    assert.equal(resolvePublicRoute('/' + alias + '/').redirect, '/' + target);
    assert.equal(resolvePublicRoute('/' + alias, { allowLegalDrafts: false }).status, 404);
    assert.equal(resolvePublicRoute('/' + target + '/').redirect, '/' + target);
    assert.equal(resolvePublicRoute('/' + target, { allowLegalDrafts: false }).status, 404);
  }
});

test('internal, unknown and ambiguous paths never become public pages', () => {
  for (const path of ['/admin/leads/', '/design-system/', '/downloads/package.zip', '/source/App.jsx', '/design-previews/home.jpg', '/assets/../../about/', '/%61bout/', '//about/', '/privacy\\anything', '/%252e%252e', '/missing/', 'https://example.test/about/']) {
    assert.equal(resolvePublicRoute(path).status, 404, path);
    assert.equal(resolvePublicRoute(path).redirect, null, path);
  }
});

test('metadata preserves source title and description and does not invent URL fields without origin', () => {
  for (const page of pages.filter(page => page.phase === 'P0' && page.id !== 'how-we-work')) {
    const meta = getPageMeta(page.path);
    assert.equal(meta.title, page.title);
    assert.equal(meta.description, page.description);
    assert.equal(meta.robots, 'noindex,nofollow');
    for (const key of ['canonical', 'ogUrl', 'image', 'jsonLd']) assert.equal(meta[key], null);
    assert.equal(getPageMeta(page.path, { release: true }).jsonLd, null);
  }
});

test('release metadata indexes exactly the twenty-four marketing routes, with consistent schema URLs', () => {
  const origin = 'https://confirmed.example';
  for (const route of PUBLIC_ROUTES) {
    const meta = getPageMeta(route.path + '?utm_source=ignored#section', { release: true, indexingEnabled: true, origin });
    const marketing = !['legal', 'system'].includes(route.kind);
    assert.equal(meta.robots, marketing ? 'index,follow' : route.kind === 'legal' ? 'noindex,follow' : 'noindex,nofollow');
    assert.equal(meta.canonical, route.kind === 'system' ? null : origin + route.path);
    if (marketing) {
      const serialized = JSON.stringify(meta.jsonLd);
      assert.ok(meta.jsonLd['@graph'].some(node => node.url === meta.canonical));
      assert.ok(!serialized.includes('SITE_ORIGIN'));
      for (const forbidden of ['telephone', 'address', 'aggregateRating', 'Offer', 'sameAs', 'datePublished']) assert.ok(!serialized.includes('"' + forbidden + '"'));
      assert.equal(meta.jsonLd['@graph'][0].name, 'Taizhou Xunfeng Trading Co., Ltd.');
    } else assert.equal(meta.jsonLd, null);
  }
  assert.equal(getPageMeta('/request-a-quote/', { release: true, indexingEnabled: true, origin }).jsonLd['@graph'][2].headline, 'Tell Us About Your Mold Project');
  assert.equal(getPageMeta('/inquiry-received/').title, 'Inquiry Received | ExactMec');
  for (const route of PUBLIC_ROUTES.filter(route => route.kind === 'legal')) {
    assert.ok(getPageMeta(route.path).description.length > 20, route.path);
    assert.doesNotMatch(getPageMeta(route.path).description, /REVIEW COPY|\[[A-Z_]+\]/);
  }
});

test('staging and non-public paths remain noindex, without published schema', () => {
  for (const path of ['/', '/privacy', '/industries/automotive/', '/admin/', '/missing']) {
    assert.equal(getPageMeta(path, { origin: 'https://preview.example' }).robots, 'noindex,nofollow');
    assert.equal(getPageMeta(path, { origin: 'https://preview.example' }).jsonLd, null);
  }
  for (const path of ['/admin/', '/missing']) {
    const meta = getPageMeta(path, { origin: 'https://confirmed.example', release: true });
    assert.equal(meta.robots, 'noindex,nofollow');
    assert.equal(meta.canonical, null);
  }
  for (const origin of ['http://example.test', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test/?query=1']) assert.throws(() => getPageMeta('/', { origin }));
});

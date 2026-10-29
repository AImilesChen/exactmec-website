import pages from '../data/site-content.json' with { type: 'json' };
import legal from '../data/legal-drafts.json' with { type: 'json' };
import systems from '../data/systems.json' with { type: 'json' };
import { PUBLIC_ROUTES, publicPath, resolvePublicRoute } from './route-contract.mjs';

const schemaTypes = { home: 'WebPage', collection: 'CollectionPage', article: 'Article', about: 'AboutPage', contact: 'ContactPage' };

export function confirmedOrigin(value = '') {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new TypeError('Expected a confirmed HTTPS site origin.');
  return url.origin;
}

function schema(page, origin) {
  const pageUrl = origin + page.path;
  const graph = [
    { '@type': 'Organization', '@id': origin + '/#operator', name: '台州巽风贸易有限公司', url: origin },
    { '@type': 'WebSite', '@id': origin + '/#website', name: 'ExactMec', url: origin + '/', publisher: { '@id': origin + '/#operator' } },
    { '@type': schemaTypes[page.kind] || 'WebPage', '@id': pageUrl + '#page', url: pageUrl, name: page.title,
      headline: page.id === 'rfq' ? 'Tell Us About Your Mold Project' : page.h1,
      description: page.description, inLanguage: 'en', isPartOf: { '@id': origin + '/#website' } },
  ];
  if (page.path !== '/') {
    const crumbs = [{ name: 'Home', item: origin + '/' }];
    if (page.kind === 'industry') crumbs.push({ name: 'Applications', item: origin + '/industries/' });
    if (page.kind === 'article') crumbs.push({ name: 'Resources', item: origin + '/resources/' });
    crumbs.push({ name: graph[2].headline, item: pageUrl });
    graph.push({ '@type': 'BreadcrumbList', '@id': pageUrl + '#breadcrumbs', itemListElement: crumbs.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, ...crumb })) });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function getPageMeta(input, { origin = '', release = false, indexingEnabled = false, whatsappNumber = '8615990661727',pageOverride } = {}) {
  // The confirmed WhatsApp channel is deliberately not an Organization telephone.
  void whatsappNumber;
  const base = confirmedOrigin(origin);
  const path = publicPath(input);
  const route = resolvePublicRoute(input);
  const direct = route.status === 200 || (route.id === '404' && path === '/404');
  const contract = direct ? PUBLIC_ROUTES.find(item => item.path === path) : null;
  const page = pageOverride || (contract ? pages.find(item => item.path === path) : null);
  const policy = contract?.kind === 'legal' ? legal.find(item => item.path === path) : null;
  const system = !contract || contract.kind === 'system' ? systems.pages.find(item => item.id === (contract?.id || '404')) : null;
  const title = page?.title || (policy ? policy.title + ' | ExactMec' : system?.title || 'Page Not Found | ExactMec');
  const description = page?.description || policy?.summary || system?.intro || '';
  const indexing = release && indexingEnabled === true;
  const indexable = !!(path !== '/how-we-work/' && indexing && (pageOverride || contract && contract.kind !== 'legal' && contract.kind !== 'system' && contract.phase === 'P0'));
  const canonical = path === '/how-we-work/' ? (base ? base + '/about/' : null) : base && (pageOverride || contract && contract.kind !== 'system') ? base + (pageOverride?.path || contract.path) : null;
  return {
    title, description,
    robots: !indexing ? 'noindex,nofollow' : indexable ? 'index,follow' : contract?.kind === 'legal' ? 'noindex,follow' : 'noindex,nofollow',
    canonical, ogUrl: canonical, image: base && (contract||pageOverride) ? base + '/og-image.png' : null,
    jsonLd: base && indexable && page ? schema(page, base) : null,
  };
}

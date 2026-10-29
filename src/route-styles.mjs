// Page-specific styles stay out of the shared public bundle. Keep the order
// consistent with the original entry-public.jsx imports for cascading rules.
export const routeStyleFiles = Object.freeze({
  home: ['home-v2.css'],
  products: ['products.css'],
  'core-mold': ['core-mold.css'],
  manufacturing: ['manufacturing.css'],
  'mold-development-process': ['mold-process.css'],
  'mold-design-review': ['design-review.css'],
  'quality-control': ['quality-control.css'],
  'mold-handover': ['mold-handover.css'],
  industries: ['industries-index.css'],
  'industry-automotive': ['motor-industry.css', 'automotive-industry.css'],
  'industry-motorcycle': ['motorcycle-industry.css'],
  'industry-led': ['led-industry.css'],
  'industry-motor': ['motor-industry.css'],
  'industry-electronics': ['electronics-industry.css'],
  'industry-energy': ['energy-industry.css'],
  'industry-industrial': ['industrial-industry.css'],
  'industry-tools': ['tools-industry.css'],
  'resource-mold-cost': ['cost-guide.css'],
  'resource-quotation-requirements': ['quotation-guide.css'],
  'resource-development-process': ['buyer-planning.css'],
  about: ['about.css'],
});

export function routeStylesFor(path, routes, assetUrls) {
  const id = routes.find(route => route.path === path)?.id;
  return (routeStyleFiles[id] || []).map(file => assetUrls[file]).filter(Boolean);
}

export function ensureRouteStyles(path, routes, doc = document) {
  const manifest = doc.getElementById('route-style-manifest');
  if (!manifest) return Promise.resolve();
  let assetUrls;
  try { assetUrls = JSON.parse(manifest.textContent); }
  catch { return Promise.resolve(); }
  return Promise.all(routeStylesFor(path, routes, assetUrls).map(href => {
    const existing = [...doc.querySelectorAll('link[rel="stylesheet"]')].find(link => link.getAttribute('href') === href);
    if (existing) return Promise.resolve();
    return new Promise(resolve => {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = resolve;
      doc.head.append(link);
    });
  })).then(() => {});
}

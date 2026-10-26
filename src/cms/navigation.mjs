const pathKey = path => path === '/' ? '/' : path.replace(/\/$/, '') + '/';

/** Resolve current slugs and safe overview fallbacks consistently for all React links. */
export function cmsHref(href, cms = {}) {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return href;
  const [path, hash] = href.split('#'), canonical = pathKey(path);
  if (cms.withdrawn?.includes(canonical)) {
    const overview = canonical.startsWith('/industries/') ? '/industries/' : canonical.startsWith('/resources/') ? '/resources/' : '/';
    if (overview === canonical || cms.withdrawn?.includes(overview)) return '/';
    return cms.routes?.[overview] || overview;
  }
  return (cms.routes?.[canonical] || path) + (hash ? '#' + hash : '');
}

export function orderCmsCards(cards, cms = {}) {
  return cards.map((card, index) => {
    const original = typeof card.href === 'string' && card.href.startsWith('/') ? pathKey(card.href.split('#')[0]) : null;
    const current = original && (cms.routes?.[original] || original);
    return { card, index, order: cms.pages?.find(page => pathKey(page.path) === current)?.order };
  }).sort((a, b) => (a.order ?? 10001 + a.index) - (b.order ?? 10001 + b.index)).map(item => item.card);
}

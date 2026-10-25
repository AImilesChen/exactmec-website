import manifest from '../data/site-manifest.json' with { type: 'json' };

// A contract for a future public build, not evidence that any route is released.
export const PUBLIC_ROUTES = Object.freeze(manifest.routes
  .filter(route => route.include_in_p0_plan)
  .map(route => Object.freeze({ ...route })));

const routes = new Map(PUBLIC_ROUTES.map(route => [route.path, route]));
const prepared = new Map(Object.entries(manifest.p0_link_fallbacks));
const legalAliases = new Map([
  ['/privacy-policy', '/privacy'], ['/terms-of-use', '/terms'],
  ['/cookie-policy', '/cookies'], ['/confidentiality', '/project-information'],
]);

export function publicPath(input = '/') {
  if (typeof input !== 'string' || !input.startsWith('/') || input.startsWith('//')) return null;
  const path = input.split(/[?#]/, 1)[0];
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { return null; }
  // Reject ambiguous encodings and traversal rather than normalizing private paths.
  if (decoded !== path || /[\\\u0000-\u0020\u007f]/.test(path) || path.includes('//') || path.split('/').some(part => part === '.' || part === '..')) return null;
  return path;
}

function result(path, status, redirect = null, route = null) {
  return { path, status, redirect, kind: route?.kind || 'system', id: route?.id || '404' };
}

export function resolvePublicRoute(input, { allowLegalDrafts = true } = {}) {
  const path = publicPath(input);
  if (!path) return result(typeof input === 'string' ? input.split(/[?#]/, 1)[0] : '/', 404);
  const withoutSlash = path.length > 1 ? path.replace(/\/$/, '') : path;
  const alias = legalAliases.get(withoutSlash);
  if (alias) {
    const route = routes.get(alias);
    return allowLegalDrafts ? result(path, 308, alias, route) : result(path, 404);
  }
  const preparedTarget = prepared.get(path.endsWith('/') ? path : path + '/');
  if (preparedTarget) return result(path, 308, preparedTarget, { kind: 'industry', id: manifest.routes.find(route => route.p0_link_target === preparedTarget)?.id });
  const route = routes.get(path) || routes.get(path.endsWith('/') ? withoutSlash : path + '/');
  if (!route || (route.kind === 'legal' && !allowLegalDrafts)) return result(path, 404);
  if (route.path !== path) return result(path, 308, route.path, route);
  return result(route.path, route.id === '404' ? 404 : 200, null, route);
}

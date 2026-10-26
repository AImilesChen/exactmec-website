import { resolvePublicRoute } from '../seo/route-contract.mjs';

// Purpose-limited inquiry attribution, independent of optional analytics. No
// cookies, browser storage, visitor IDs, raw query strings or ad click IDs.
export const UTM_FIELDS = Object.freeze(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);
const FIELDS = ['page', 'referrer', ...UTM_FIELDS];

export function sourcePage(value, knownPaths = [], blockedPaths = []) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('?') || value.includes('#')) return null;
  if (Array.isArray(blockedPaths) && blockedPaths.includes(value)) return null;
  const route = resolvePublicRoute(value);
  // Do not retain arbitrary paths: they may contain names or other personal data.
  if (route.status === 200 && !['system', 'legal'].includes(route.kind) && route.path === value) return route.path;
  // Only the trusted published-content list may extend the static route list.
  // Never read this list from the inquiry JSON or URL. Public CMS paths are
  // canonical lowercase slugs; reserved/private surfaces stay excluded.
  return Array.isArray(knownPaths) && knownPaths.includes(value) && value.length <= 240 && /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+$/.test(value) && !/^\/(?:api|admin|design-system|assets|brand|privacy|terms|cookies|project-information|404|inquiry-received)(?:\/|$)/.test(value) ? value : null;
}

export function sourceReferrer(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname) || /^\d+(?:\.\d+){3}$/.test(url.hostname)) return null;
    return url.origin; // External paths, search terms and fragments are discarded.
  } catch { return null; }
}

export function sourceTag(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value) || /\d{7,}/.test(value)) return null;
  return value;
}

function cleanTouch(input, knownPaths, blockedPaths) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(FIELDS.map(key => [key, key === 'page' ? sourcePage(value[key], knownPaths, blockedPaths) : key === 'referrer' ? sourceReferrer(value[key]) : sourceTag(value[key])]));
}

/** Re-clean on the server too; malformed attribution never blocks an inquiry. */
export function normalizeInquirySource(input, knownPaths = [], blockedPaths = []) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return { first: cleanTouch(value.first, knownPaths, blockedPaths), submission: cleanTouch(value.submission, knownPaths, blockedPaths) };
}

function touch(url, referrer, knownPaths, blockedPaths) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return cleanTouch(null);
    return cleanTouch({ page: parsed.pathname, referrer, ...Object.fromEntries(UTM_FIELDS.map(key => [key, parsed.searchParams.get(key)])) }, knownPaths, blockedPaths);
  } catch { return cleanTouch(null); }
}

/** One instance per public app. Lifetime is this page/SPA only, never cross-tab. */
export function createInquirySourceTracker({ getUrl = () => globalThis.location?.href, getReferrer = () => globalThis.document?.referrer, knownPaths = [], blockedPaths = [] } = {}) {
  let first = null;
  function current() {
    try { return touch(getUrl(), getReferrer(), knownPaths, blockedPaths); } catch { return cleanTouch(null); }
  }
  function capture() {
    const value = current();
    if (!first && value.page) first = value;
    return value;
  }
  capture(); // SSR has no location: it records nothing and invents no landing page.
  return Object.freeze({
    snapshot() {
      const submission = capture();
      return normalizeInquirySource({ first, submission }, knownPaths, blockedPaths);
    },
  });
}

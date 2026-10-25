import manifest from '../data/site-manifest.json' with { type: 'json' };

export const ANALYTICS_EVENTS = Object.freeze([
  'pageview', 'quote_cta_click', 'inquiry_started', 'inquiry_submit_attempt',
  'inquiry_submit_success', 'inquiry_submit_failed', 'whatsapp_click',
]);
export const ANALYTICS_PLACEMENTS = Object.freeze([
  'header', 'hero', 'content', 'footer', 'form', 'success', 'mobile_navigation', 'mega_menu',
]);
export const ANALYTICS_STATUSES = Object.freeze([
  'started', 'valid', 'validation_failed', 'submitting', 'success', 'duplicate',
  'failed', 'network_error', 'rate_limited', 'unavailable', 'pending',
]);

const eventNames = new Set(ANALYTICS_EVENTS);
const placements = new Set(ANALYTICS_PLACEMENTS);
const statuses = new Set(ANALYTICS_STATUSES);
const siteRoutes = new Map(manifest.routes.filter(route => route.include_in_p0_plan).flatMap(({ path }) => [
  [path, path], [path === '/' ? '/' : path.endsWith('/') ? path.slice(0, -1) : path + '/', path],
]));

/** Accept only registered site paths. Never forward an origin, query, hash or unknown path. */
export function sanitizeAnalyticsRoute(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  const path = value.split(/[?#]/, 1)[0];
  return siteRoutes.get(path) ?? null;
}

/** A copied, closed schema: adding form fields here requires a deliberate contract change. */
export function sanitizeAnalyticsPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const route = sanitizeAnalyticsRoute(payload.route);
  if (!route) return null;
  const safe = { route };
  if (placements.has(payload.placement)) safe.placement = payload.placement;
  if (statuses.has(payload.status)) safe.status = payload.status;
  return Object.freeze(safe);
}

/** No transport, storage, identifiers, scripts, queue or implicit consent are created here. */
export function createAnalytics({ enabled = false, consent = false, adapter } = {}) {
  let permitted = consent === true;
  let destroyed = false;
  let send = typeof adapter === 'function' ? adapter : null;
  return Object.freeze({
    track(name, payload) {
      if (destroyed || enabled !== true || !permitted || !send || !eventNames.has(name)) return false;
      const safe = sanitizeAnalyticsPayload(payload);
      if (!safe) return false;
      try {
        const result = send(name, safe);
        // Adapter outages must not interrupt an inquiry or create unhandled rejections.
        Promise.resolve(result).catch(() => {});
        return true;
      } catch {
        return false;
      }
    },
    setConsent(value) {
      if (!destroyed) permitted = value === true;
    },
    destroy() {
      destroyed = true;
      permitted = false;
      send = null;
    },
  });
}

function linkPlacement(link) {
  const explicit = link.getAttribute('data-analytics-placement');
  if (placements.has(explicit)) return explicit;
  if (link.closest('header')) return 'header';
  if (link.closest('footer')) return 'footer';
  if (link.closest('form')) return 'form';
  return 'content';
}

/** Observe only intentional quote/WhatsApp link clicks; never read a form input or link query. */
export function bindSiteAnalytics(document, analytics) {
  if (!document?.addEventListener || typeof analytics?.track !== 'function') return () => {};
  const onClick = event => {
    if (event.button != null && event.button !== 0) return;
    const link = event.target?.closest?.('a[href]');
    if (!link) return;
    let target;
    try { target = new URL(link.getAttribute('href'), document.location.href); } catch { return; }
    let name;
    if (target.origin === document.location.origin && sanitizeAnalyticsRoute(target.pathname) === '/request-a-quote/') {
      name = 'quote_cta_click';
    } else if (target.protocol === 'https:' && (target.hostname === 'wa.me' || (target.hostname === 'api.whatsapp.com' && target.pathname === '/send'))) {
      name = 'whatsapp_click';
    }
    if (name) analytics.track(name, { route: document.location.pathname, placement: linkPlacement(link) });
  };
  // Capture retains the source route before the SPA router handles navigation.
  document.addEventListener('click', onClick, true);
  let bound = true;
  return () => {
    if (bound) document.removeEventListener('click', onClick, true);
    bound = false;
  };
}

import { PUBLIC_ROUTES } from '../seo/route-contract.mjs';

export const VENDOR_ANALYTICS = Object.freeze({
  origin: 'https://exactmec.com', ga4Id: 'G-E8EBN552MZ', clarityId: 'z3mu7j6fex',
  googleScript: 'https://www.googletagmanager.com/gtag/js?id=G-E8EBN552MZ',
  clarityScript: 'https://www.clarity.ms/tag/z3mu7j6fex',
  plausibleEndpoint: 'https://plausible.shipsolo.io/api/event', plausibleDomain: 'exactmec.com',
});
const denied = () => ({ ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
const granted = () => ({ ...denied(), analytics_storage: 'granted' });
const clarityChoice = allow => ({ ad_Storage: 'denied', analytics_Storage: allow ? 'granted' : 'denied' });
const events = new Set(['pageview', 'quote_cta_click', 'whatsapp_click']);
const placements = new Set(['header', 'hero', 'content', 'footer', 'mobile_navigation', 'mega_menu']);
const blocked = /^\/(?:api|admin|account|customer|design-system|request-a-quote|inquiry-received|privacy|terms|cookies|project-information|privacy-policy|cookie-policy|terms-of-use|confidentiality|404)(?:\/|$)/;
const canonicalSyntax = value => typeof value === 'string' && value.length <= 240 && (value === '/' || /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+$/.test(value)) && !blocked.test(value);
const marketing = PUBLIC_ROUTES.filter(route => !['legal', 'system', 'contact'].includes(route.kind) && canonicalSyntax(route.path)).map(route => route.path);

/** Extra paths come only from a trusted published CMS bundle, never event JSON. */
export function vendorMarketingRoute(value, knownPaths = []) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  const path = value.split(/[?#]/, 1)[0];
  const paths = [...marketing, ...(Array.isArray(knownPaths) ? knownPaths.filter(canonicalSyntax) : [])];
  return paths.find(candidate => candidate === path || candidate !== '/' && candidate.slice(0, -1) === path) || null;
}
export const isVendorMarketingRoute = (value, knownPaths = []) => vendorMarketingRoute(value, knownPaths) !== null;

/** Clarity cannot override its automatic URL/referrer metadata, so skip unsafe contexts. */
export function clarityContextAllowed(window, document, knownPaths = []) {
  try {
    const current = new URL(window.location.href);
    if (current.origin !== VENDOR_ANALYTICS.origin || current.username || current.password || current.search || current.hash || !isVendorMarketingRoute(current.pathname, knownPaths)) return false;
    const raw = document.referrer || '';
    if (!raw) return true;
    const referrer = new URL(raw);
    if (!['https:', 'http:'].includes(referrer.protocol) || referrer.username || referrer.password || referrer.port || referrer.search || referrer.hash) return false;
    if (referrer.origin === current.origin) return isVendorMarketingRoute(referrer.pathname, knownPaths);
    return referrer.pathname === '/' && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(referrer.hostname);
  } catch { return false; }
}

/**
 * Basic opt-in mode. Construction/denial creates no tag, API queue or network.
 * A document must hard-navigate before rendering form/private routes. Withdrawal
 * disables calls immediately; the host then reloads to unload vendor listeners.
 */
export function createVendorAnalytics({ enabled = false, window = globalThis.window, document = window?.document, fetchImpl = window?.fetch?.bind(window), knownPaths = [] } = {}) {
  let permitted = false, destroyed = false, revoked = false, sdkStarted = false;
  let googleAttempted = false, googleReady = false, clarityAttempted = false, clarityReady = false;
  let bootPath = null;
  const seenPageviews = new Set();
  const scripts = new Set();
  const pending = new Set();
  const registered = Array.isArray(knownPaths) ? knownPaths.filter(canonicalSyntax) : [];

  function currentRoute() {
    try {
      const location = new URL(window.location.href);
      return location.origin === VENDOR_ANALYTICS.origin && !location.username && !location.password ? vendorMarketingRoute(location.pathname, registered) : null;
    } catch { return null; }
  }
  function appendScript(id, src) {
    if (document.getElementById?.(id)) return false; // Do not add duplicate tags.
    const script = document.createElement('script');
    script.id = id; script.src = src; script.async = true; script.referrerPolicy = 'no-referrer';
    script.setAttribute('data-exactmec-analytics', 'opt-in');
    script.setAttribute('data-exactmec-status', 'loading');
    script.onload = () => { if (permitted && !revoked) script.setAttribute('data-exactmec-status', 'loaded'); };
    script.onerror = () => { script.setAttribute('data-exactmec-status', 'blocked'); }; // No raw errors or visitor data.
    (document.head || document.documentElement).appendChild(script);
    scripts.add(script); sdkStarted = true;
    return true;
  }
  function startGoogle(route) {
    if (googleAttempted) return;
    googleAttempted = true;
    try {
      window['ga-disable-' + VENDOR_ANALYTICS.ga4Id] = false;
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('consent', 'default', denied());
      window.gtag('set', 'ads_data_redaction', true);
      window.gtag('set', 'url_passthrough', false);
      window.gtag('consent', 'update', granted());
      window.gtag('js', new Date());
      window.gtag('config', VENDOR_ANALYTICS.ga4Id, {
        send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
        page_location: VENDOR_ANALYTICS.origin + route, page_referrer: '', page_title: '',
        campaign_id: '', campaign_source: '', campaign_medium: '', campaign_name: '', campaign_term: '', campaign_content: '',
      });
      googleReady = appendScript('exactmec-ga4', VENDOR_ANALYTICS.googleScript);
    } catch { googleReady = false; }
  }
  function startClarity() {
    if (clarityAttempted) return;
    clarityAttempted = true;
    if (!clarityContextAllowed(window, document, registered)) return;
    try {
      // Set masking before the runtime can inspect any content.
      document.documentElement.setAttribute('data-clarity-mask', 'true');
      document.getElementById?.('root')?.setAttribute('data-clarity-mask', 'true');
      window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
      window.clarity('consentv2', clarityChoice(true));
      clarityReady = appendScript('exactmec-clarity', VENDOR_ANALYTICS.clarityScript);
    } catch { clarityReady = false; }
  }
  function start(route) {
    if (!bootPath) bootPath = route;
    if (bootPath !== route) return false; // Adapter never follows SPA into another DOM.
    startGoogle(route); startClarity();
    return true;
  }
  function clearAnalyticsCookies() {
    try {
      const names = (document.cookie || '').split(';').map(value => value.trim().split('=')[0]);
      const owned = names.filter(name => name === '_ga' || name === '_ga_E8EBN552MZ' || name === '_gid' || name === '_gat_gtag_G_E8EBN552MZ' || name === '_clck' || name === '_clsk');
      for (const name of owned) for (const domain of ['', '; Domain=exactmec.com', '; Domain=.exactmec.com']) document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure${domain}`;
    } catch { /* Restricted cookies must not block withdrawal. */ }
  }
  function stop(clearCookies) {
    permitted = false;
    for (const controller of pending) controller.abort();
    pending.clear();
    try { document.documentElement.removeAttribute?.('data-exactmec-plausible'); } catch {}
    if (googleAttempted) try {
      window['ga-disable-' + VENDOR_ANALYTICS.ga4Id] = true;
      // If loading is delayed, do not leave granted/config/event commands for
      // that late runtime to replay after withdrawal. Keep unrelated commands.
      if (Array.isArray(window.dataLayer)) for (let index = window.dataLayer.length - 1; index >= 0; index--) {
        const item = window.dataLayer[index];
        if (item?.[0] === 'config' && item[1] === VENDOR_ANALYTICS.ga4Id || item?.[0] === 'event' && item[2]?.send_to === VENDOR_ANALYTICS.ga4Id || item?.[0] === 'consent' && item[1] === 'update' && item[2]?.analytics_storage === 'granted') window.dataLayer.splice(index, 1);
      }
      window.gtag?.('consent', 'update', denied());
    } catch { /* Disable independent providers even if one throws. */ }
    if (clarityAttempted && clarityReady) try {
      if (Array.isArray(window.clarity?.q)) window.clarity.q.length = 0;
      window.clarity?.('consentv2', clarityChoice(false));
      window.clarity?.('stop');
    } catch { /* Host reload removes remaining SDK state. */ }
    for (const script of scripts) try { script.remove(); } catch { /* Reload remains required. */ }
    scripts.clear();
    if (clearCookies) clearAnalyticsCookies();
  }
  function track(name, input) {
    if (destroyed || revoked || enabled !== true || !permitted) return false;
    const route = currentRoute();
    if (!route || bootPath && bootPath !== route) { revoked = sdkStarted; stop(true); return false; }
    if (!events.has(name) || !input || typeof input !== 'object' || Array.isArray(input) || vendorMarketingRoute(input.route, registered) !== route || !start(route)) return false;
    if (name === 'pageview') {
      if (seenPageviews.has(route)) return false;
      seenPageviews.add(route);
    }
    const props = { route };
    if (placements.has(input.placement)) props.placement = input.placement;
    let dispatched = false;
    if (googleReady) try {
      window.gtag('event', name === 'pageview' ? 'page_view' : name, {
        send_to: VENDOR_ANALYTICS.ga4Id, page_location: VENDOR_ANALYTICS.origin + route, page_referrer: '', page_title: '',
        allow_google_signals: false, allow_ad_personalization_signals: false, ...props,
      });
      dispatched = true;
    } catch { /* Another provider may still record the sanitized event. */ }
    if (clarityReady && name !== 'pageview') try { window.clarity('event', name); dispatched = true; } catch { /* No arbitrary properties or identifiers go to Clarity. */ }
    if (typeof fetchImpl === 'function') try {
      const controller = new AbortController(); pending.add(controller);
      const request = fetchImpl(VENDOR_ANALYTICS.plausibleEndpoint, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', keepalive: true,
        headers: { 'Content-Type': 'text/plain' }, signal: controller.signal,
        body: JSON.stringify({ name, url: VENDOR_ANALYTICS.origin + route, domain: VENDOR_ANALYTICS.plausibleDomain, referrer: null, props }),
      });
      Promise.resolve(request).then(response => {
        if (permitted && !revoked && !destroyed) document.documentElement.setAttribute('data-exactmec-plausible', response.status >= 200 && response.status < 300 ? 'accepted' : 'http-error');
      }).catch(() => {
        if (permitted && !revoked && !destroyed) try { document.documentElement.setAttribute('data-exactmec-plausible', 'blocked'); } catch {}
      }).finally(() => pending.delete(controller));
      dispatched = true;
    } catch { /* No queue, automatic retry or exposed raw error. */ }
    return dispatched;
  }
  return Object.freeze({
    track,
    setConsent(value) {
      if (destroyed) return false;
      if (value !== true) { if (permitted && sdkStarted) revoked = true; stop(true); return false; }
      if (enabled !== true || revoked) return false;
      const route = currentRoute();
      if (!route) return false;
      permitted = true;
      if (!start(route)) return false;
      track('pageview', { route });
      return true;
    },
    hasStarted() { return sdkStarted; },
    destroy() { if (!destroyed) { destroyed = true; stop(false); } },
  });
}

# Optional analytics adapter

This module supplies a local integration seam, not a configured analytics service. It imports no SDK, creates no network request or browser storage, and stays off unless both `enabled` and analytics `consent` are explicitly `true` and a transport adapter is supplied. The current provider/configuration is unknown: keep the site instance disabled. Do not treat RFQ processing agreement or WhatsApp permission as analytics consent. Declining optional analytics must never prevent inquiry submission.

```js
import { createAnalytics, bindSiteAnalytics } from './analytics/index.mjs';

// Safe current configuration. No transport and no real reporting.
const analytics = createAnalytics();
const unbind = bindSiteAnalytics(document, analytics);

// SPA route effect: pass pathname only; the sanitizer also strips query/hash.
analytics.track('pageview', { route: window.location.pathname });

// Explicit form state hooks, without passing event/form/values/errors/result.
analytics.track('inquiry_started', { route: '/request-a-quote/', placement: 'form' });
analytics.track('inquiry_submit_attempt', { route: '/request-a-quote/', placement: 'form' });
analytics.track('inquiry_submit_failed', { route: '/request-a-quote/', placement: 'form', status: 'validation_failed' });
analytics.track('inquiry_submit_success', { route: '/request-a-quote/', placement: 'form', status: 'success' });

// Only after a separate analytics choice on an approved, enabled adapter:
analytics.setConsent(true);
analytics.setConsent(false); // Stops future calls immediately; no queued events.

// App teardown:
unbind();
analytics.destroy();
```

Future reviewed transport shape: `createAnalytics({ enabled: true, consent: false, adapter: (name, safePayload) => {} })`. The adapter gets only the sanitized event name and a frozen copy of the safe payload. It must not enrich events with form/customer details, full URLs, identifiers or browser storage. `track` returns whether it called the adapter, not network delivery success. Adapter errors are isolated from the inquiry flow. Withdrawal prevents future adapter calls; an already dispatched request cannot be recalled. Destroyed instances cannot resume.

Supported events: `pageview`, `quote_cta_click`, `inquiry_started`, `inquiry_submit_attempt`, `inquiry_submit_success`, `inquiry_submit_failed`, `whatsapp_click`. Emit `inquiry_started` once per form interaction, attempts on explicit submit, success only after a server-confirmed saved inquiry, and failures from categorized state. A review/demo success is not a saved inquiry and must not emit success. Clicking WhatsApp does not prove a message was sent or confer contact permission.

Every event needs a `route` that matches a registered P0 site-manifest path; canonical trailing slash is normalized, queries/fragments are removed, and unknown/admin/design/customer-specific paths are rejected. Absolute URLs are rejected: supply `location.pathname`. No event emits when route is missing/invalid. Allowed payload keys are only `route`, `placement`, `status`; other keys are discarded. Placement accepts only `header`, `hero`, `content`, `footer`, `form`, `success`, `mobile_navigation`, `mega_menu`. Status accepts only `started`, `valid`, `validation_failed`, `submitting`, `success`, `duplicate`, `failed`, `network_error`, `rate_limited`, `unavailable`, `pending`. Unknown placement/status values are dropped, so free text cannot escape through those fields. Status is event lifecycle, never drawing/project/review status.

`bindSiteAnalytics` delegates only link click events for same-origin RFQ paths and HTTPS `wa.me`/`api.whatsapp.com/send` links. It forwards the source page route, plus a fixed placement from `data-analytics-placement` or structural header/footer/form/content. It never forwards destination phone/query/reference, reads form input values, or listens to change/input events. Its return function removes the listener; use it alongside `destroy()` on teardown. Pageviews and form state events remain explicit so application state controls their meaning.

Privacy boundary follows `../../../compliance/form-and-followup-spec.md` sections 3–5 and `../../../compliance/handoff.md`: do not add name, email, phone, company, project text, budget, drawing status, reference IDs, form contents, console dumps or URL parameters to events. Optional service selection, notice, retention and production network verification remain launch work; this module does not satisfy a live-reporting gate.

Verify: `node --test tests/analytics-privacy.test.mjs` from `design-prototype/`. Tests use only mock adapters/documents, synthetic values and no external service.

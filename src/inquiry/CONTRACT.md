# Inquiry frontend contract · 07-frontend

Status: **[NEEDS_REVIEW] — frontend and backend implemented, local synthetic integration verified; live collection stays disabled until release and protected administration are ready.**

Read alongside `../../../compliance/form-and-followup-spec.md`, PRD section 85, `../data/inquiry-copy.json` and `../data/form-states.json`. This is a proposed integration contract, not evidence that any service exists or a legal publication has been approved.

## Component

```jsx
import { Inquiry } from './inquiry/Inquiry.jsx';
<Inquiry reviewMode={true} submitEnabled={false} endpoint="/api/inquiries" whatsappNumber="" onEvent={() => {}} />
```

These are the defaults. Review mode performs no requests and labels its completed demonstration as unsent/unsaved. `?demo=invalid|loading|failed|pending|rate_limit` is read only in review mode; it cannot force real success. A production request requires **both** `reviewMode={false}` and explicit `submitEnabled={true}` from the parent, plus a valid same-origin HTTP(S) endpoint. Filling environment/config values alone grants no permission to collect data. The existing light UI classes, fields, illustration and Phosphor icons are reused; parent owns route wiring and surrounding branding.

When public submission is unavailable and the host supplies a valid `whatsappNumber`, an ordinary manual contact link appears above the fields. It contains only the business number, with no draft text, reference or form data; clicking remains an explicit user action. Configuring it does not enable submission or automatically contact WhatsApp.

`onEvent(name, payload)` is optional and inert by default. Public mode emits `inquiry_started` once at the first edit of each fresh form and `inquiry_submit_attempt` for an accepted submit action, both with `{}`. Confirmed server outcomes emit `inquiry_submit_success` with only `{status: 'saved'|'duplicate'}`; local/server validation and other specified failures emit `inquiry_submit_failed` with only `{status: 'invalid'|'failed'|'pending'|'rate_limit'}`. Review mode never invokes the callback. Names and statuses are allowlisted; field names/values, contact/project data, references, raw errors and transport details are excluded. Callback errors are isolated. The host owns its analytics adapter and may add a canonical route; the component starts no analytics or third-party network request.

## Request

`POST /api/inquiries`, JSON body, `Content-Type: application/json`, `Idempotency-Key: <cryptographically generated UUID>`. Credentials are same-origin; redirects fail; requests are uncached and omit a referrer. Endpoint query/fragment/userinfo and cross-origin destinations are rejected. Default AbortController timeout is 15 seconds, covering fetch and response parsing. There are no automatic retries.

`buildInquiryPayload(values)` emits only:

- Contact: `name`, `company`, `email`, `phone`, `country` (resolved custom country), `city`, `website` (nullable).
- Project: `component`, `description`, `drawing_status`, `industry`/`requirements` (nullable), `mold_sets` (positive integer or null), `mold_sets_unsure` (boolean). Drawing status remains a declaration, not proof of files received or quotation readiness. No uploads.
- Purchase: `purchase_timing`, `budget_status`, `budget_min`, `budget_max`, `currency` (nullable), `budget_basis: "per_mold_set"`. Hidden budget amounts/currency are discarded; no budget or timing is required. A single entered budget remains a single bound for the server to normalize according to its model.
- Choices: `processing_choice` (true after required purpose-limited permission), `whatsapp_messages_opt_in` (independent boolean, default false), `calls_opt_in: false`.
- Copy versions: `notice_version`, `privacy_version`, `privacy_processing_basis`, `whatsapp_choice_text_version`. Current values explicitly identify draft copy. These must be reconciled with approved notices and the server before enabling collection. The server must own/validate timestamps, versions, processing basis and receipt records; a client value is not evidence of approval.

`source` is an independently normalized inquiry-only snapshot: `{first,submission}`, each with `page`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`. Missing values remain null. Pages must match known canonical public content routes; arbitrary paths, query strings and fragments are discarded. Referrers retain only a public HTTP(S) origin, never external paths, search terms, credentials, ports or local hosts. Activity labels are limited to 80 ASCII letters/digits/dots/underscores/hyphens; email addresses, long numbers, full URLs, spaces and other free text are discarded. Unrecognized labels remain unknown, never inferred as organic/direct/paid. The server repeats this cleaning and malformed optional attribution never prevents a valid inquiry.

The public app supplies an in-memory `createInquirySourceTracker()` through `getSourceSnapshot={() => tracker.snapshot()}`. Its first available page is captured on construction; SSR has no source. It records no cross-page-refresh history, cookies, session/local storage, visitor identifier or ad click IDs. On SPA navigation first and current sources remain separate. The first accepted form attempt freezes its snapshot across manual retries to preserve the idempotency body. No source value enters analytics or WhatsApp drafts. The snapshot is self-reported browser context, not verified attribution or customer authenticity.

Published CMS slugs extend the static page allowlist via the tracker `knownPaths` option and the Inquiry `sourceKnownPaths` prop; both are derived from the trusted public CMS bundle, not URL/input fields. Server validation independently loads published paths from D1 only when `CMS_ENABLED` is true; withdrawn current/original paths are blocked for new submissions. Client-supplied path lists are ignored. Saved source snapshots are immutable even when a page is subsequently withdrawn or a request is replayed.

Personal analytics, files, payment/account data, and arbitrary extra input keys are omitted. No real personal data, payload, reference or idempotency key is written to browser storage, logs or analytics. Values and the retry key live only in component/client memory. Navigating away or reloading loses this state; production backend deduplication must not rely on memory persistence alone.

The same JSON body reuses its idempotency key on manual retry. A changed body gets a new key. Concurrent submits share one in-flight request. A backend must validate all fields itself, scope/rate-limit keys, atomically deduplicate Lead creation, and decouple notification failure from a successful Lead save. Do not interpret a frontend-only validation pass as saved data.

## Responses

| HTTP / JSON | Frontend result |
| --- | --- |
| 200 or 201, `{ "saved": true, "reference": "EM_OPAQUE_12345678" }` | `saved` |
| 200/201 or 409, `{ "saved": true, "status": "duplicate", "reference": "EM_OPAQUE_12345678" }` | `duplicate` |
| 422, `{ "errors": { "email": "validation detail" } }` | `invalid`; known field names get generic safe inline errors |
| 429, optional numeric seconds `Retry-After` header | `rate_limit`; bounded retry countdown |
| Other explicit 4xx except 408/409 | `failed`; entries retained |
| 408, 5xx, network/timeout, malformed JSON, 202, missing/false `saved`, missing/unsafe reference, ambiguous 409 | `pending`; result unconfirmed, entries retained |

`saved` must be the boolean true. `reference` must be an opaque, non-enumerable public reference of 8–128 characters matching `[A-Za-z0-9][A-Za-z0-9_-]{7,127}`. It must not grant public Lead lookup access. All responses should use `Cache-Control: no-store`; internal exceptions and personal values should not be echoed. Unknown server field names and server text are not rendered. Do not return `saved:true` until the Lead is actually durably saved.

Only confirmed responses display received/saved wording and the real reference. Success remains on the form route in component memory, avoiding PII/reference query parameters. The parent must not redirect to a fake success route. No timeout or HTTP error is silently converted to success.

## WhatsApp and consent

After confirmation, `whatsappNumber` accepts an international business number (7–15 digits, optional leading `+`). An invalid/unconfigured number shows the email follow-up fallback. The link contains only this business number and `Hello ExactMec, I would like to discuss my mold inquiry. Reference: {reference}.` No name, email, customer number, budget, component or project body enters the URL. Link clicking does not imply a sent WhatsApp message or grant marketing/call permission. Unchecked WhatsApp permission does not block submission or remove the optional user-initiated continuation link.

## Verification

Run `node --test tests/inquiry-*.test.mjs` for pure field/payload/privacy checks and mock-fetch transport/state/idempotency tests. No test contacts a backend. Parent must additionally verify integration build, keyboard/focus, mobile layout and configured response handling before any separately authorized backend release.

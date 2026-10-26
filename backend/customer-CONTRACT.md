# Optional customer inquiry workspace

This feature is independent of inquiry submission. `POST /api/inquiries` remains anonymous, account-free and unchanged. Only a mailbox that already owns an inquiry can receive a sign-in code. It is not general account registration and grants no administrator privileges.

## Integration

```js
import { handleCustomer, customerPortalConfiguration } from './customer.mjs';
const context = {
  // Production factory supplies an actual separately configured email adapter.
  sendCode: async ({ email, code, expiresMinutes }) => ({ accepted: true }),
  waitUntil: execution.waitUntil.bind(execution),
  localSynthetic: false,
};
const response = await handleCustomer(request, env, context);
```

The example `sendCode` illustrates the contract only: it must not be used as a production transport or fake success. The adapter must send the user-requested authentication email and return `accepted: true` only after provider acceptance. A failed/unconfirmed send invalidates the challenge. No recipient, OTP, token or request body may be logged. Production Worker should always pass its `waitUntil` so mail latency does not distinguish known from unknown emails in the HTTP response. No new-inquiry notification binding, old mailbox login or existing sales-only recipient restriction is changed by this module.

`customerPortalConfiguration(env, context)` returns `{origin,localSynthetic,cookieName}` or null. Production requires:

- `DB` with `0001_inquiries.sql` and `0006_customer_portal.sql` applied.
- `SITE_ORIGIN=https://exactmec.com`.
- `CUSTOMER_PORTAL_ENABLED=true`, `RELEASE=true`, `LEGAL_APPROVED=true`.
- Strong independently generated `CUSTOMER_AUTH_SECRET`, `RATE_LIMIT_SECRET`, `CONTACT_HASH_SECRET` (minimum 32 characters, no default).
- An actual `context.sendCode` transport. Account/provider capability and spending approval are deployment prerequisites handled separately.

`context.localSynthetic=true` bypasses release flags only when configured origin is loopback `localhost`/`127.0.0.1`, with exact request origin. It must be injected only by the separate localhost test host, never environment bindings, headers or JSON. Local synthetic databases and transport remain isolated from production.

The root router must preserve trusted customer-handler `Set-Cookie` for sign-in/logout only while retaining `no-store/noindex`, no CORS and the API CSP. All non-customer API/marketing/static responses continue stripping cookies. An unmatched path outside `/api/customer/` returns null without touching a database or cookie.

## API

All writes are same-origin JSON and require an exact `Origin`, not `cross-site` fetch metadata, and a bounded body (16 KiB). API query strings/fragments are rejected. Authenticated writes additionally require a signed, session-bound `X-CSRF-Token`. Cookies/credentials are same-origin only. Customer/session data must not enter analytics, URL query/fragment, local/session storage or logs.

| Method/path | Request | Response |
|---|---|---|
| POST `/api/customer/auth/request-code` | `{email}` | Always `202 {accepted:true,challenge}` for known/unknown/invalid email or issuance throttling; no existence/code/delivery detail, no cookie |
| POST `/api/customer/auth/verify-code` | `{challenge,code}` | `200 {authenticated:true,csrfToken,expiresAt}` and session cookie; `400 {error:'invalid_code'}` for wrong/expired/consumed/exhausted/unknown challenge; verify-IP flood `429 rate_limited` |
| GET `/api/customer/session` | Cookie | `200 {authenticated:true,csrfToken,expiresAt}`; no email/role/OTP/token in JSON, no refreshed cookie |
| POST `/api/customer/logout` | `{}` plus cookie/CSRF | `204` and expired cookie; revokes this session only |
| GET `/api/customer/inquiries` | Cookie | `{items:[safeInquiry],total,limit:50}`; latest 50 by creation, list omits supplement note bodies (`supplements:[]`) |
| GET `/api/customer/inquiries/:reference` | Cookie | `{inquiry:safeInquiry}` |
| POST `/api/customer/inquiries/:reference/supplements` | `{revision,note}` plus cookie/CSRF | `201 {inquiry:safeInquiry}`; immutable note, 1–4000 characters, per-inquiry maximum 100 |
| POST `/api/customer/inquiries/:reference/withdraw` | `{revision}` plus cookie/CSRF | `200 {inquiry:safeInquiry}`; records withdrawal request, original inquiry and permission history retained |

Common failures: `503 portal_unavailable` when feature/config gates close; `503 service_unavailable` for backend failure; `401 unauthorized` for absent/expired/invalid session; `403 origin_denied` or `csrf_required`; `404 not_found` for absent or another customer's reference; `409 revision_conflict`, `withdrawn` or `supplement_limit`; `422 invalid_request` for mutation validation. No exception/raw SQL/PII is returned. Rate failures include bounded numeric `Retry-After`, except code issuance deliberately stays generic202.

Clients must not describe generic202 as proof an email was sent. Use: “If that email has matching inquiries, a code will arrive shortly.” After an ambiguous mutation, reload rather than automatically retrying.

## Identity, code and session boundaries

- Identity is the verified mailbox's HMAC email hash, using the same `email:<lowercase>` derivation as anonymous leads. No supplied customer/admin identity header is trusted.
- Six-digit random codes expire after 10 minutes. Only origin-bound challenge/code HMACs are stored. Every delivered challenge has at most five atomic attempts and exactly one successful consumption/session creation, including concurrent requests. A newly issued challenge invalidates older unconsumed codes for that mailbox.
- Code issuance is bounded per IP (12/15 minutes), per email (3/15 minutes), and atomic rolling per-email cooldown (60 seconds). Unknown addresses use the same generic response and hashed buckets. Verification is capped per IP (50/15 minutes). Only Cloudflare-supplied `CF-Connecting-IP` is used; root Worker controls header trust.
- Session tokens are fresh 256-bit random values, stored only as origin-bound HMACs; never raw tokens or OTPs. Production cookie is `__Host-exactmec_customer; Path=/; HttpOnly; Secure; SameSite=Lax`, absolute maximum age 8 hours. No Domain attribute or sliding extension.
- Local cookie `exactmec_customer_dev` is explicitly distinct and non-Secure only on the loopback test host. Origin-bound hashes also prevent a renamed local cookie or local OTP from working in production even if a test database were mistakenly shared.
- CSRF is HMAC-signed, exact-origin/session bound and expires within 15 minutes/the session lifetime. Cookie spoofing, duplicate cookie names, other-session CSRF and cross-origin writes fail closed.
- Expired rate buckets/challenges/sessions are purged on portal API use. Sessions lose access when no inquiry remains for their email hash. No independent raw-email account table is created.

## Customer projection

```text
safeInquiry = {
  reference, created_at, updated_at,
  revision, // independent portal revision; starts at 1
  status,   // received | under_review | needs_information | in_contact |
            // quotation_sent | closed | withdrawn
  submitted: {
    name, company, email, phone, country, city, website,
    component, description, drawing_status, industry, requirements,
    mold_sets, mold_sets_unsure, purchase_timing, budget_status,
    budget_min, budget_max, currency, budget_basis
  },
  supplements: [{id,note,created_at}], // detail only, at most100
  withdrawn, withdrawn_at
}
```

No internal review object/qualification/priority/owner/notes/history, attribution/source, notification status, hashed identifiers, suppression or consent receipt crosses the customer boundary. Known internal statuses map to the fixed public enum; all other values fall back to `received`. Notes are text, never executable HTML.

Every inquiry read/mutation and supplement lookup is constrained by both opaque reference and authenticated email hash. No unconstrained public reference lookup exists. Supplements and withdrawal use a separate `customer_inquiry_state.revision`, leaving the original lead payload, admin review/revision and consent unchanged. Atomic conditional writes prevent stale/replayed changes, cap supplements and keep note/history insertion tied to the winning mutation.

Withdrawal represents a request concerning this inquiry, not global contact permission. The root's protected admin integration exposes it and suppresses contact actions for this inquiry only; other projects remain unaffected. The customer UI must not claim that historical email/WhatsApp messages are cleared or an external conversation automatically closes. A withdrawn inquiry accepts no new supplements.

`customer_inquiry_state` and `customer_supplements` have `ON DELETE CASCADE` foreign keys to the lead. An operator deletion removes all customer adjuncts and cannot be undone by a racing customer mutation. No customer delete/original-field-edit endpoint, uploads, payments, automatic quotation, marketing enrollment, call permission or account privilege elevation is introduced.

## Verification

`node --test tests/backend-customer.test.mjs` uses isolated local Miniflare D1, synthetic inquiries and an in-memory synthetic code callback. It covers generic responses, ownership, production/local separation, code expiry/brute-force/replay/concurrency, rates, CSRF, session expiry/logout, immutable optimistic notes, supplement-cap race, withdrawal, deletion cascade and anonymous RFQ independence.

Independent full client/router/Worker checks live in `tests/customer-portal-integration.test.mjs`. Passing synthetic tests is not evidence production email transport, release/collection or customer login is enabled.

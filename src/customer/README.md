# Optional customer inquiry workspace

Entry: `CustomerPortal` from `App.jsx`; props `initialPath` (default `/account/login/`) optional `available` (default `true`), and optional `client` injection for isolated synthetic integration tests. Passing `available={false}` renders the review-closed design immediately, disables email/code controls, omits the availability retry action, and prevents session/list/detail/write API requests. Availability is a public configuration signal, not a substitute for backend security gates. Parent supplies a dedicated HTML/JS entry, local Manrope and IBM Plex fonts, and `styles.css`. No public/admin layouts or global tracking adapters are imported here. The stylesheet scopes the workspace, controls, responsive layout and reset to `.customer-portal`.

## Customer flow

Email-code access is optional. Every screen keeps the ordinary `/request-a-quote/` route available without sign-in. There are no passwords, registration, uploads, payment controls or automatic quotations. Request-code acceptance uses an address-independent conditional message; it never asserts delivery. A closed 503 shows sign-in unavailable, with the ordinary inquiry route still available. A code stays in component memory; challenge and CSRF remain in a client closure. No contact, token, code, note or record body is placed in a URL or browser storage. Detail URLs contain only the backend-issued opaque inquiry reference.

After a real session, the workspace loads the authenticated customer's latest 50 inquiries. It reads only the safe customer API projection. Original submitted information is read-only. Additional notes are immutable history entries (maximum 100 per inquiry); withdrawal requires a confirmation and prevents further notes. Ambiguous writes are never replayed; the user must reload, clear the pending note and inspect the current history. Email-change, route change, logout, expiry and component teardown invalidate stale challenges/responses and clear sensitive view state as appropriate.

## API contract

- POST `/api/customer/auth/request-code` `{email}` → 202 `{accepted:true,challenge}`. UI throttle 60 seconds; backend always owns enforcement and unknown-address handling.
- POST `/api/customer/auth/verify-code` `{challenge,code}` → 200 `{authenticated:true,csrfToken,expiresAt}` and HttpOnly session cookie. Six-digit codes expire in 10 minutes.
- GET `/api/customer/session` → same session projection; 401 without a session.
- GET `/api/customer/inquiries` → `{items,total,limit:50}`.
- GET `/api/customer/inquiries/:reference` → `{inquiry}`.
- POST `.../:reference/supplements` `{revision,note}` → 201 `{inquiry}`.
- POST `.../:reference/withdraw` `{revision}` → 200 `{inquiry}`.
- POST `/api/customer/logout` `{}` → 204.

Authenticated POSTs send the closure's `X-CSRF-Token`. All fetches use same-origin credentials, no-store, blocked redirects and no referrer. Explicit codes for invalid OTP, expiry, CSRF, conflicts, withdrawn inquiry, note limit, rate limit and unavailable service use fixed English messages. Backend messages are never rendered. Returned records are projected again to prevent internal review/notes/source fields from appearing. Server-side ownership, cookies, exact Origin enforcement, production gates and email delivery are mandatory parent/backend responsibilities; a working screen does not prove those are enabled.

## Validation

`node --test src/customer/customer-client.test.mjs` covers 12 meaningful client checks including challenge privacy, generic 202, unavailable state, safe projection, authenticated exact bodies, untrusted references, conflicts/expiry, no write replay, concurrency, timeout, logout and stale challenge invalidation. `App.jsx` also passes the JSX compiler. Parent must run actual mobile/desktop, keyboard and local synthetic backend flow checks. No real customer record or external email was used for these unit tests.

Review-closeout checks: `node --test src/customer/customer-client.test.mjs src/customer/customer-component.test.mjs` passes 15 checks. The three SSR checks verify the closed design, disabled controls and safe detail-route fallback without invented records. Actual mounted browser network silence is separately verified by the parent. Low-contrast secondary text, image captions, footer, helper copy and placeholders were darkened to #556b79 (5.58:1 on white; 5.24:1 on gray panel). Disabled primary labels have 4.93:1; layout and typography are unchanged.

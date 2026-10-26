# Inquiry backend and protected admin · local candidate

Confirmed site origin: https://exactmec.com. Business/privacy email is sales@exactmec.com; correspondence address is No. 46 Jinqing Avenue, Luqiao, Taizhou, Zhejiang, China (中国浙江台州路桥金清大道46号). Mailbox provisioning and basic incoming/outgoing verification are complete. The owner confirmed sales@exactmec.com as the inquiry-notification recipient, separately from administrator login. Personal admin setup is deferred by the owner; do not change the existing mail application login or identity providers. Production inquiry collection remains disabled.

## Implemented

- D1 migrations and atomic lead/consent-receipt/outbox persistence. A confirmed database save returns the public opaque reference; customer WhatsApp activity is not required.
- Independent server validation, exact notice versions, honeypot, short HMAC IP rate buckets and concurrency-safe idempotency. No automatic quality scoring.
- Protected list/search/detail, review and follow-up states, owner/date/notes, optimistic revisions, independent contact suppression, safe CSV, deletion and restricted audits.
- Notification outbox, manual retry and expired claim recovery. Provider failure cannot undo a saved lead. Sender and recipient are fixed server settings, never customer input. Messages contain only an opaque reference and protected dashboard link.
- Cloudflare Access JWT signature/issuer/audience/expiry and explicit administrator allowlist, actor-bound CSRF tokens, same-origin writes, actual UTF8 body limit and generic errors. A raw email header or hidden admin URL grants no access.

Production Access policies must protect both `/admin/*` and `/api/admin/*`; the Worker independently verifies the application JWT, including on static-asset-backed deployments. Public inquiry paths must remain accessible without an administrator login. Configure the actual Access team/audience/allowlist and verify anonymous denial before connecting any real database.

Set ADMIN_EMAILS, ACCESS_TEAM_DOMAIN and ACCESS_AUD as server-side Secrets. Public templates omit these fields so a deployment cannot accidentally publish or overwrite a private identity. The public contact mailbox is not an implicit administrator. Do not add a global identity provider without reviewing its effect on existing applications that accept all providers; keep unrelated application settings unchanged unless explicitly authorized.

## Local integration

`npm run dev:integration` starts a separate Node host **bound only to 127.0.0.1:4176**:

- `/request-a-quote/`: prefilled synthetic form. Select the processing choice and submit to the local D1 simulator.
- `/admin/leads/`: synthetic local administrator session, real local API calls and persisted local test records.

Use only `@example.com` emails and the test phone `+1 202 555 0140`; other contact values are rejected by this local router. State and generated local-only secrets live under ignored `.wrangler/backend-local/`. The Node identity stub and `local/entry-integration.jsx` are not included in the public site build. Production never enables the local factory option through a header, body, binding or execution context. Local credentials must never be reused for deployment. No emails or WhatsApp messages are sent by this host.

`npm run test:backend` runs synthetic tests against real local Miniflare D1 and controlled signatures/mail stubs. `npm run check:frontend` verifies the static site and protected admin build. `npm run check:cloudflare` only bundles locally. No command listed here deploys or migrates a remote database.

## Deployment and data operations

`wrangler.jsonc` remains a data-disabled configuration. `wrangler.backend.example.jsonc` is a configuration template, not evidence that a D1 database, Access policy, mail binding or production endpoint exists. Create and identify the actual account resources, set server secrets, apply migrations to the intended database, approve notices/retention/providers and verify access before opening collection. Keep secrets out of `VITE_*`, Git and browser configuration.

An independent `exactmec-leads` D1 database has been created and both schema migrations applied remotely. Its reported placement is WNAM; this is not a residency or jurisdiction guarantee. No customer records have been stored there. `wrangler.staging.jsonc` identifies this empty review database and disables workers.dev, preview URLs, routes and collection. Its notification transport is configured to send only from sales@exactmec.com to sales@exactmec.com, with both restrictions enforced by the native binding; the closed collection/admin endpoints cannot create or retry real jobs. Deployment evidence is recorded separately; a configuration file alone is not deployment evidence.

Approved copy identifiers live in `src/data/notice-versions.json`; match them exactly to the four server notice variables. Current values are drafts. The production save handler and release build reject draft/test copy. Setting approval flags alone cannot finalize the notices. Update the actual company contact details and policy text before review.

Keep `CONTACT_HASH_SECRET` stable. It protects contact suppression hashes and pseudonymous audit actors; rotating it without a migration breaks historical matching. Deleting a lead removes its payload, receipts, notes and outbox atomically, retaining minimum suppression hashes and non-payload audit evidence. Actual retention, correction-request verification, purge/backup and restoration procedures require the approved operator policy. Do not restore historical leads and reopen contact without restoring the latest suppression/deletion decisions first.

Rate bucket hashes expire after a ten-minute window and are deleted on subsequent submissions. `cleanupRateLimits` is also connected to the Worker's scheduled handler; no remote schedule is currently enabled. Select and verify a maintenance schedule before production so idle buckets are physically removed as intended.

Notification sending is **at least once**, not exactly once: a provider may accept a message and lose the response, so a later manual retry can generate another internal reminder. A stored `sent` state means the email service confirmed acceptance, not proof of inbox delivery. Claim attempts guard against stale completions overwriting a newer attempt. The sender mailbox and notification recipient have now been confirmed. Cloud delivery evidence is recorded separately in the local delivery report, rather than inferred from a source configuration or provider acceptance.

The protected admin now includes a content draft workspace backed by D1. Editors can save permitted text fields, reload drafts and export reviewed page JSON, with optimistic revisions and source-change checks. Saving a draft does not change public content or deploy the website. Public content still requires review and a repository rebuild. The old Operations workbench remains a design review mock.

## Native transport verification

The `scripts/fixtures/notification-binding-smoke.mjs` entry is an explicit short-lived diagnostic, never imported by the website Worker or frontend build. It sends only a `[TEST]` message to the approved sales mailbox, includes no D1 binding/customer records, and rejects alternate addresses. Its scheduled mode runs only at one exact supplied timestamp within a two-minute window. Private smoke configuration and transient tokens live under ignored `.wrangler/notification-smoke/`; remove the temporary trigger and Worker after verification. No public diagnostic route should be deployed. Backend tests separately verify atomic outbox claims, concurrent sends, failures, manual retry and customer-data exclusion.

## Primary technical references

- [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/) and [transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/).
- [Access application token validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
- [Email send bindings](https://developers.cloudflare.com/email-service/configuration/send-bindings/) and [Workers sending API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/). Account eligibility, domain onboarding and recipients must be verified before enabling the optional binding.

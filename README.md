# EXACTMEC website · frontend and inquiry backend

React frontend for custom aluminum die casting mold inquiries. The approved light industrial design, compact cube branding, product imagery and English copy are preserved. One mold set is accepted; production die casting is outside the current service scope.

## Run the frontend candidate

Node.js 22 or later is required (validated locally with Node 24).

```sh
npm ci
npm run check:frontend
npm run preview:frontend
```

Open http://127.0.0.1:4174/. With the preview running, `npm run smoke:frontend` checks real HTTP pages, packaged assets, redirects and error responses; results are in `dist/http-smoke-report.json`. The build generates 24 complete HTML pages in `dist/public`: 18 launch marketing pages, four legal drafts and two system templates. React hydrates these pages for navigation and interaction. JavaScript is not required to retrieve the page body. Build evidence is written to `dist/frontend-report.json`.

`npm run check:cloudflare` performs a local Wrangler dry run only. It does not deploy, change DNS, create a database or accept real inquiries. The Worker handles static routes, canonical redirects, true 404 responses and independently protected APIs. Uploading only the static folder to an arbitrary SPA host does not reproduce these response rules.

## Current release state

This is a staging candidate, not a launched lead collection service. Every page is `noindex,nofollow`, robots disallows crawling, and the sitemap contains no published URLs. The registered domain is https://exactmec.com. Business and privacy contact share sales@exactmec.com; the confirmed correspondence address is No. 46 Jinqing Avenue, Luqiao, Taizhou, Zhejiang, China (中国浙江台州路桥金清大道46号). These appear in the footer and legal draft copy. The mailbox still requires provisioning and send/receive verification, recorded separately by VITE_CONTACT_EMAIL_VERIFIED, which remains false. Administrator identity is not inferred from a public contact address. Registration alone is not evidence of DNS, HTTPS or deployment readiness. A confirmed manual WhatsApp link is available on the inquiry page and in the footer. Clicking the link does not send a message automatically.

Online inquiry collection is closed. With the default configuration, public saves return 503 and admin access is unavailable. The frontend implements validation, optional budget/timing, independent contact choices, timeout/error/retry handling and a strict saved-response contract. It cannot claim success without a backend-confirmed saved inquiry. Analytics is disabled: no provider SDK, tracking ID or real reporting is configured.

The backend now implements atomic D1 inquiry/consent/outbox persistence, idempotency, rate limits, Access JWT verification, CSRF, lead review/follow-up, channel suppression, CSV export, deletion and protected content drafts. The separate Chinese admin uses these APIs. `npm run test:backend` verifies synthetic records and controlled identity/mail fixtures; `npm run dev:integration` starts an isolated local test host at http://127.0.0.1:4176. See [backend operations](backend/README.md) and the [HTTP contract](backend/CONTRACT.md). Local success does not certify production identity or email delivery.

`wrangler.staging.jsonc` identifies the independent EXACTMEC D1 schema and a non-public review Worker: workers.dev, preview URLs and routes are disabled, as are collection and notifications. The presence of this configuration is not proof of an uploaded deployment. No production credentials belong in this file.

Before production release:

1. Provision and verify the confirmed domain mailbox; review actual processors and retention rules, then finalize the legal notices and notice versions. Contact names/addresses in source are confirmed, while reachability remains independently gated.
2. Configure production Access application/allowlist, secrets and internal mail transport, then verify anonymous denial, real storage, notification failures and data operations in the intended environment.
3. If measurement is enabled, choose the provider and implement its approved notice/choice flow; verify actual reporting without lead information. Otherwise explicitly retain measurement as disabled in the handoff.
4. Complete browser/mobile, accessibility and production smoke checks, and approve public deployment/domain changes.
5. Set the public configuration in `.env.example`, run `npm run build:release`, and deploy the reviewed commit through the approved Cloudflare account. Flags are not proof of legal or backend verification.

Only public `VITE_*` configuration belongs in the frontend. Never put API keys, Cloudflare tokens, customer records or GitHub credentials there or in this repository.

## Source map

| Source | Purpose |
| --- | --- |
| `src/PublicApp.jsx`, `src/entry-*` | Public app, metadata updates, client/server rendering |
| `src/seo/` | Route contract, frozen page metadata, future canonical/schema |
| `src/inquiry/CONTRACT.md` | Form fields, request/response and consent contract |
| `src/analytics/README.md` | Disabled analytics seam and data allowlist |
| `src/site-config.mjs` | Confirmed business contact and release checks |
| `cloudflare/` | Public routing, fail-closed API entry and protected admin |
| `backend/`, `migrations/` | Inquiry/content APIs, identity, outbox and D1 schema |
| `src/admin/` | Separate protected lead and content draft workspace |
| `tests/` | Unit and built-artifact checks |

`npm run dev` runs the public frontend with hot reload; `npm run build` produces the same public candidate as `build:frontend`. `npm run dev:review` / `npm run build:review` retain the earlier local design-review app and protected Sites adapter for compatibility. The review build is **not** the public Cloudflare candidate. Internal design screenshots and ZIP downloads are intentionally excluded from this source repository and from `dist/public`; archival workbench links require the separate local UI handoff. `/design-system/` and `/downloads/` are not public routes. `/admin/leads/` requires configured and verified Access identity; absent configuration keeps it inaccessible.

Images are illustrative examples, not evidence of delivered projects, owned facilities, certifications or customer endorsements. Public source visibility does not grant a license to the EXACTMEC brand or artwork; no open-source license has been assigned.

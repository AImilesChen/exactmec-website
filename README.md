# EXACTMEC website frontend

React frontend for custom aluminum die casting mold inquiries. The approved light industrial design, compact cube branding, product imagery and English copy are preserved. One mold set is accepted; production die casting is outside the current service scope.

## Run the frontend candidate

Node.js 22 or later is required (validated locally with Node 24).

```sh
npm ci
npm run check:frontend
npm run preview:frontend
```

Open http://127.0.0.1:4174/. With the preview running, `npm run smoke:frontend` checks real HTTP pages, packaged assets, redirects and error responses; results are in `dist/http-smoke-report.json`. The build generates 24 complete HTML pages in `dist/public`: 18 launch marketing pages, four legal drafts and two system templates. React hydrates these pages for navigation and interaction. JavaScript is not required to retrieve the page body. Build evidence is written to `dist/frontend-report.json`.

`npm run check:cloudflare` performs a local Wrangler dry run only. It does not deploy, change DNS, create a database or accept real inquiries. `wrangler.jsonc` binds the static assets to the separate read-only Worker. Runtime route handling includes canonical redirects and actual 404 responses. Uploading only the static folder to an arbitrary SPA host does not reproduce these response rules.

## Current release state

This is a staging candidate, not a launched lead collection service. Every page is `noindex,nofollow`, robots disallows crawling, and the sitemap contains no published URLs. Domain and domain email are unconfirmed; neither is invented in metadata. A confirmed manual WhatsApp link is available on the inquiry page and in the footer. Clicking the link does not send a message automatically.

Online inquiry collection is closed. The read-only Worker returns 503 for `/api/**`. The frontend implements validation, optional budget/timing, independent contact choices, timeout/error/retry handling and a strict saved-response contract. It cannot claim success without a backend-confirmed saved inquiry. Analytics is also disabled: no provider SDK, tracking ID or real reporting is configured.

Before production release:

1. Confirm the actual HTTPS domain, reachable domain email, company contact address, processors and retention rules; finalize the legal notices.
2. Implement and verify the inquiry backend, storage, deduplication, administrative access, notification and deletion flows. Replace the explicit API-unavailable Worker route.
3. Choose any analytics provider and implement its independent consent/withdrawal flow; verify actual reporting without lead information.
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
| `cloudflare/` | Independent read-only Worker and routing rules |
| `tests/` | Unit and built-artifact checks |

`npm run dev` runs the public frontend with hot reload; `npm run build` produces the same public candidate as `build:frontend`. `npm run dev:review` / `npm run build:review` retain the earlier local design-review app and protected Sites adapter for compatibility. The review build is **not** the public Cloudflare candidate. Internal design screenshots and ZIP downloads are intentionally excluded from this source repository and from `dist/public`; archival workbench links require the separate local UI handoff. The release candidate never exposes `/design-system/`, `/admin/` or `/downloads/`.

Images are illustrative examples, not evidence of delivered projects, owned facilities, certifications or customer endorsements. Public source visibility does not grant a license to the EXACTMEC brand or artwork; no open-source license has been assigned.

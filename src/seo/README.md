# Static frontend SEO and route contract

These modules are pure data/rendering helpers and do not release the website.

`PUBLIC_ROUTES` contains 19 P0 marketing contracts, four legal contracts and two system templates. `resolvePublicRoute(path, { allowLegalDrafts = true })` returns `{ path, status, redirect, kind, id }`. It strips query/hash for lookup, canonicalizes trailing slashes, resolves legal aliases in one 308, and sends five prepared industries to their approved P0 overview anchors. Unknown/internal/ambiguous paths return 404. `allowLegalDrafts: false` blocks both legal paths and aliases.

`getPageMeta(path, { origin = '', release = false, whatsappNumber = '8615990661727' })` returns `{ title, description, robots, canonical, ogUrl, image, jsonLd }`. Existing marketing titles/descriptions are unchanged. Legal descriptions remain empty because no approved SEO description exists; callers can omit an empty description tag. System titles and descriptions come from the existing system data. Unknown paths use its existing 404 copy.

With no confirmed HTTPS origin all URL fields and JSON-LD are null. Staging is always `noindex,nofollow`, with no JSON-LD. Only release-mode P0 marketing contracts emit indexable metadata/schema. Legal pages use `noindex,follow` in release mode; system/unknown/redirect sources remain noindex. The release build must independently require legal approval, confirmed origin, actual contacts and backend readiness. A true `release` parameter is not that approval.

Schema follows the source blueprint types, preserves the Chinese legal operator and ExactMec brand, and adds no address, telephone, offers, ratings, author/date or social account claims. RFQ schema uses the existing visible H1. Confirmed WhatsApp is intentionally not represented as a telephone number.

Run `node --test tests/frontend-seo.test.mjs tests/cloudflare-worker.test.mjs` from the prototype directory. Existing Sites SPA files are unchanged.

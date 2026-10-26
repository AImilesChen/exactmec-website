# Structured content publishing

CMS uses the existing approved React composition. Saving a draft never changes a public page. An explicit version-confirmed publish creates an immutable D1 snapshot; the public Worker renders only published snapshots. Public pages never read `content_drafts`. A later draft does not affect the published version. Withdrawals return 410, remove sitemap entries and cause navigation to fall back to relevant overviews. Old and original slugs redirect to the current published slug.

`CMS_ENABLED` gates public database reads and defaults off. Administration still requires verified Access and CSRF. No secret, collection flag, legal approval, internal notification recipient or login identity can be edited through the CMS. Public settings accept only a verified email from `APPROVED_PUBLIC_EMAILS` (default sales@exactmec.com), a valid WhatsApp number and plain correspondence address. Changing these does not broaden Email Service sender/recipient bindings. Legal body and notice-version publication remain separately reviewed release sources.

## Modules

- `schema.mjs`: shared, closed pure-text/structured schema, known local media registry and merge logic.
- `Rendering.jsx`: public content/media/slug context and selected-layout-preserving homepage overrides.
- `backend/content.mjs`: authenticated draft/list/save/export/preview and publish/withdraw routing; `loadContentPreview` must only be called after authentication.
- `backend/content-publication.mjs`: optimistic transactional snapshot publication, aliases, audit and public settings.
- `backend/content-public.mjs`: public snapshots only. Disabled mode reads no database. Invalid persisted publication data fails closed.
- `migrations/0004_content_publication.sql`: publications/aliases/audit/settings; existing draft tables are preserved.

API writes use exact draft revision, source hash and publication revision. Publish/revoke/audit use one D1 batch; simultaneous publishers have a single winner. Slug collisions, reserved/legal paths, traversal, arbitrary HTML/JS/remote assets and customer-data envelopes are rejected. System home/RFQ paths are fixed and cannot be withdrawn. Rebase review removes modules that no longer exist in the source. Preview is saved-draft-only, protected, no-store/noindex; no token is placed in its URL.

## Editing scope

The form supports page title/H1/summary, eyebrow, SEO description, slug, text, cards, tables, CTA, FAQ and related links, explicit module and card/FAQ ordering, collection ordering, optional real author/reviewer/category and server-set publication/update timestamps. Images are chosen from the existing reviewed local illustration library with Alt, public illustrative identity and source/rights notes. Existing illustration assets cannot be relabeled as factory photos or delivered work. This version does not offer uploads or a public customer drawing library; adding authorized new photography requires asset review and registry addition.

The source compositions contain some fixed explanatory diagrams and business facts. These remain source-controlled; the editable content fields are distinct and are applied in the corresponding visible text regions. The chosen default homepage headings and spacing stay unchanged until those fields are explicitly edited. Source and publication versions remain independently visible.

## Verification

`node --test tests/backend-content.test.mjs tests/backend-publication.test.mjs src/admin/content-client.test.mjs` verifies shared schema, source/revision conflicts, draft isolation, snapshot immutability, concurrent publication, alias routing, withdrawal/republication, media identity, settings boundaries and transactional rollback. Parent integration tests additionally verify the actual public SSR/bootstrap/metadata/route and authenticated preview boundary. Fixtures are synthetic and isolated in local D1.

Publication additionally resolves related links, cards and CTA targets against current source/published paths, aliases and actual content-anchor contracts. Incomplete links may remain in a draft; missing or withdrawn targets and missing anchors block publication. A publication-set fingerprint is rechecked inside the D1 batch so a concurrent target withdrawal cannot race past link review. Navigation follows renamed overview fallbacks and card ordering resolves original/canonical paths even when hashes are present.

# Frontend delivery status

Updated: 2026-10-25. Local staging candidate; not a production release.

| Item | Evidence / state |
| --- | --- |
| Approved UI and brand | Existing light v3 compositions and selected cube preserved |
| Static page body | 24 complete HTML pages, including 18 P0 marketing pages |
| Route/metadata/assets | Build artifact checks; explicit canonical redirects and hard 404 |
| Inquiry frontend | Required screening fields and optional budget/timing; validation and server-response contract |
| WhatsApp | Confirmed manual contact link; no automatic messaging |
| Analytics | Disabled adapter with strict field allowlist; no actual reporting configured |
| Automated checks | 50 frontend checks passed locally |
| HTTP smoke | 60 read-only requests passed against the built preview |
| Responsive/browser | Representative home, mold, inquiry and article pages at desktop/mobile; 320px inquiry and 768px mold checks |
| Cloudflare | Read-only Worker dry run passed; no deployment performed |
| Source synchronization | Confirm repository branch and commit; creation alone does not prove upload |

Use `npm run build` for the public candidate and `npm run dev` for its development server. The older internal workbench uses `dev:review` / `build:review`. Run `npm run preview:frontend`, then `npm run smoke:frontend` in a second terminal to validate the built candidate.

Production remains gated on confirmed domain/email, approved legal notices and actual data processors, a verified inquiry backend and access/notification flows, final QA and explicit deployment approval. Public flags are configuration, not proof that these tasks are complete. Current API paths return 503 and inquiry submission stays closed. Do not publish the old design workbench, screenshot archives or ZIP downloads as the customer-facing website.

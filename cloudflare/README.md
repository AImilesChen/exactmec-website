# Independent static Cloudflare adapter

`worker.mjs` is a read-only ASSETS adapter, separate from the protected prototype Sites worker. No API or backend is connected; every `/api/**` request returns 503 without reading/logging its body. Other write methods return 405.

Bind static files as `ASSETS`. Set `RELEASE = "false"` and `LEGAL_APPROVED = "false"` by default. Staging can display legal drafts for review, always with `X-Robots-Tag: noindex,nofollow` and `Cache-Control: no-store`. Release mode blocks legal routes unless the independent legal approval flag is true. It does not replace build-time publication checks.

The static build must emit `/index.html`, route-specific `/about/index.html` etc., legal `/privacy/index.html` etc., and `/404.html` (alternative `/404/index.html` also supported). External legal paths remain slashless. Configure ASSETS `html_handling: "none"`, `not_found_handling: "none"`, and run the Worker before assets; this adapter owns canonical redirects and 404 behavior. Do not configure a host SPA fallback. Deployment and public release require separate authorization.

Only named root runtime assets and image/font/CSS/JS files inside `/assets/` or `/brand/` are accessible. Design previews, workbench/admin routes, source, sourcemaps, downloads and ZIP archives are rejected even if mistakenly copied. Missing HTML assets return true 404; aliases and prepared-industry fallbacks return explicit 308. Runtime HTML/scripts/fonts stay same-origin under the security headers; no analytics/chat SDK is enabled. Inline styles are permitted for the existing React/CSS implementation.

The future inquiry backend requires replacing the explicit 503 path with separately tested handling. A static confirmation page must retain its no-submission fallback until a server-confirmed session exists.

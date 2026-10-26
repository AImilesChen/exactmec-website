# First-party optional measurement

`METRICS_ENABLED` (Worker) and `VITE_METRICS_ENABLED` (build) are both off in the review deployment. Public measurement additionally requires release and an affirmative visitor choice. This implementation does not install GA4, Meta Pixel or another paid/third-party analytics service.

`MeasurementChoices` writes only `allow` or `deny` to `exactmec_measurement_choice`; blocked storage does not break inquiry submission. There is no identifier, cross-tab visitor record or delayed-event queue. Withdrawal stops future events. Inquiry attribution is separate, in `src/source/`, and accompanies a submitted inquiry for project handling.

`/api/events` accepts only registered events, registered public paths and bounded enum metadata, through the same-origin API guard. Daily counters contain day/event/route/placement/status/count. Raw URLs, queries, referrers, inquiry references, contact fields and user agents are excluded. Network IP is used transiently to create a short-lived HMAC abuse-rate bucket; no raw IP is stored in these counters. Standard platform delivery/security processing remains subject to Cloudflare's configuration.

`/api/admin/metrics` exposes the last 30 days of aggregate rows only to an authenticated administrator. Counts are opt-in events, not unique visitors, qualified customers, actual WhatsApp messages, or paid-ad attribution. Email and notification behavior is unchanged. SQL migration: `0005_metrics.sql`.

Enabling measurement is a release configuration choice, not evidence that production events have already been verified. Local mock transport and real local D1 tests cover no-event-before-choice, withdrawal, safe schemas, closed production gates, aggregate storage, and abuse limits. See the release handoff for actual online verification status.

# Daily personal Codex comparison

The personal usage panel compares the first actual weekly-allowance observation
at or after 06:00 Asia/Nicosia with the most recent observation. It displays
remaining and used percentages, actual Cyprus observation times, and net change
in percentage points. Before 06:00 or without today's observation, the morning
value is unavailable. Yesterday's value is never relabelled as today's value.

At the fixed local URL http://127.0.0.1:5376/codex/, the browser automatically
reads the installed Reset Radar Windows measurement cache through a local,
read-only endpoint every 15 seconds while visible. Windows collects the actual
Codex measurements; the browser displays their original observation times.
Recent verified measurements show LIVE; stale, backup, unavailable or offline
readings show a saved state. The local server must be running, and the Windows
app must be collecting measurements for fresh data.

The public website receives personal measurements by local file import from
Reset Radar Windows or explicit manual entry. It does not access the local
endpoint. There is no automatic cross-device quota sync.
The portable file includes a SHA-256 integrity checksum and opaque comparison
scope, without credentials, emails or raw Windows account identity hashes.

Readings and retained daily anchors live in IndexedDB and device backups. Existing
backups remain compatible. Imports merge without duplicates and reject conflicting
observations. They do not send quota data to the push backend or public snapshot.

Detected replenishment and material reset-time changes prevent labelling the net
balance difference as total consumption. One-second source deadline jitter is
ignored. Different account/plan bases remain separate. The Windows permanent
measurement archive remains independent of its rolling cache.

The endpoint accepts only loopback connections with the configured host and
same-origin requests. Its responses exclude credentials and raw account identity
hashes, disable HTTP caching, and are never stored in the service-worker cache.
Validated readings are retained in IndexedDB for offline reloads.

Validation: 32 website Node tests; Windows comparison tests additionally cover
daily-anchor survival after cache eviction. Browser QA covers desktop, tablet,
portrait, landscape, manual entry, file import, backup round trip, and cold process
restart offline. Local live-usage QA additionally covers actual automatic polling,
offline reload and reconnection, desktop, portrait and landscape layouts, and
cross-origin rejection. Mobile viewports are emulated; no physical-device claim is made.
The existing undeployed public Web Push backend is outside this feature change.

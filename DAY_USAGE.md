# Daily personal Codex comparison

The personal usage panel compares the first actual weekly-allowance observation
at or after 06:00 Asia/Nicosia with the most recent observation. It displays
remaining and used percentages, actual Cyprus observation times, and net change
in percentage points. Before 06:00 or without today's observation, the morning
value is unavailable. Yesterday's value is never relabelled as today's value.

The browser receives personal measurements by local file import from Reset Radar
Windows or explicit manual entry. There is no automatic cross-device quota sync.
The portable file includes a SHA-256 integrity checksum and opaque comparison
scope, without credentials, emails or raw Windows account identity hashes.

Readings and retained daily anchors live in IndexedDB and device backups. Existing
backups remain compatible. Imports merge without duplicates and reject conflicting
observations. They do not send quota data to the push backend or public snapshot.

Detected replenishment and material reset-time changes prevent labelling the net
balance difference as total consumption. One-second source deadline jitter is
ignored. Different account/plan bases remain separate. The Windows permanent
measurement archive remains independent of its rolling cache.

Validation: 27 website Node tests; Windows comparison tests additionally cover
daily-anchor survival after cache eviction. Browser QA covers desktop, tablet,
portrait, landscape, manual entry, file import, backup round trip, and cold process
restart offline. Mobile viewports are emulated; no physical-device claim is made.
The existing undeployed public Web Push backend is outside this feature change.

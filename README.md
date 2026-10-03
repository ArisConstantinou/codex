# Reset Radar PWA

Responsive offline Codex reset monitor, designed around Asia/Nicosia calendar rules. Public site: https://arisconstantinou.github.io/codex/.

The website is independent of the Windows app. It never reads Windows profiles, Codex credentials, account IDs or account quota. Public assets contain only the original public history with provenance and observations from OpenAI News, Codex Releases and OpenAI Status. X profile links are manual.

## Local preview and tests

Node.js 24 or later, no npm dependencies. `npm start` serves **http://127.0.0.1:5376/codex/** and the local backend on the same fixed port. A collision fails; it never switches ports. `npm test` tests timezone calendars, deadline/snooze behavior, conservative source parsing, independent push cryptography, durable SQLite and outbox recovery. `npm run build` copies only `public/` to `dist/`.

Browser QA is optional and reuses an existing `playwright-core` installation supplied through `RADAR_PLAYWRIGHT_MODULE`; it does not install packages. `npm run qa` tests the local representative slice, real push receipt and process cleanup. `scripts/qa-deployed.mjs` tests the actual HTTPS Pages site and offline reload. Recovery QA requires a browser profile containing the previous shell version. Screenshots, profiles and detailed reports stay in ignored `output/` and must not be published.

## Data and offline behavior

Service Worker caches a self-contained shell within `/codex/`. IndexedDB and Cache names are prefixed `reset-radar-codex`. Deadlines are UTC timestamps, countdowns use wall clock, calendar reminders use Asia/Nicosia including DST. History, notification inbox and action journal persist across reopening. Persistence is requested explicitly and the actual result is shown. Backup export has SHA-256 integrity checking; import validates and merges without deleting existing records. Backups omit push credentials.

Browser clearing/uninstallation or storage eviction can remove data; an external backup remains necessary. Offline while open: countdowns and due notices work. An offline closed browser or powered-off device cannot guarantee exact alarms. Arrival asks for confirmation and never refills quota. Historical forecasts never become exact scheduled resets.

Codex release details retain the full authored GitHub body. A version-only prerelease shows actual commits from the previous applicable tag, with explicit divergence and coverage information, original text and source links. Notes are stored in IndexedDB and included in backup merges; feed refresh cannot erase them. The collector preloads the latest release, earlier releases are fetched on demand, and GitHub backoff survives browser or collector restart. The renderer escapes source content and does not execute source HTML or fetch embedded images.

## Hosting and the push backend

GitHub Pages serves the PWA and a retained public snapshot. The workflow reads the three official feeds and appends observations to `public/snapshot.json`. Scheduled runs may be delayed by GitHub; the UI shows source timestamps rather than promising continuous live updates.

**Public closed-app Web Push is not enabled until an HTTPS backend is connected in `public/config.json`.** The Node backend candidate uses SQLite with a persistent filesystem, VAPID keys generated only in the ignored runtime, encrypted Web Push, bounded retries, expired-subscription handling, latest-only catch-up and a retained outbox. Transport acceptance is distinct from a received PushEvent and OS presentation. Browser/device permission is requested by an explicit button. Personal manual deadlines are sent only when this device is opted into push; no quota or account profile is transmitted.

For production place Node behind your HTTPS reverse proxy, retain the private runtime directory and its backups, use process supervision and set `RADAR_CLIENT_ORIGIN=https://arisconstantinou.github.io`. `RADAR_DATA_DIR` selects the private persistent directory. Keep the saved port 5376; bind remains loopback. Do not publish the runtime/keys/subscriptions. The server and scheduler must be running for closed-app push. This repository does not provision paid hosting or expose the local PC through a tunnel.

iPhone/iPad Web Push requires a supported Home Screen installation and an explicit permission gesture. Notification actions are capability detected; the linked application always provides snooze and recurrence controls. Declarative Web Push payloads retain an ordinary service-worker fallback. A test notification must be received before claiming a particular device's end-to-end delivery.

Primary protocol documentation: [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291), [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292), [WebKit Home Screen push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [WebKit declarative push](https://webkit.org/blog/16535/meet-declarative-web-push/), [MDN persistent storage](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist).

# iPhone reset notifications

Candidate version: 0.1.3. Production activation requires a deployed public HTTPS
push service. The GitHub Pages UI remains at
https://arisconstantinou.github.io/codex/.

## On the iPhone

1. Open the website in Safari and use Share > Add to Home Screen. Keep **Open as
   Web App** enabled if shown, then open the new Reset Radar icon.
2. Open Settings in Reset Radar and tap **Enable notifications**. Allow the iOS
   permission prompt. iOS 16.4 or later and a Home Screen web app are required.
3. Send the test notification and verify it appears in the notification center
   or lock screen. Server acceptance alone does not prove iOS presentation.
4. Choose reminder times and repetition. Only explicitly announced future reset
   times and verified personal times entered by the user become scheduled targets.
   Historical pace remains an estimate.

The private push server receives subscriptions, preferences and chosen deadlines.
It never receives Codex login credentials, raw account identity or quota history.
The local Windows usage bridge remains confined to 127.0.0.1:5376.

## Service candidate

The `cloud/` functions use the existing SQLite ledger and RFC 8291/8292 Web Push
implementation. A strongly consistent private Netlify Blob stores the database
across stateless invocations. Conditional ETag writes prevent concurrent updates
from silently replacing one another. Bounded retry failures return an error.
Private daily recovery copies are retained; subscriptions and VAPID keys never
enter the static build. Preview deployments use a separate deployment store.

The minute scheduler retains exact deadlines when public sources fail, reconciles
official records from the published snapshot, and leases outgoing jobs before
network sends. Expired leases recover after interruption. Failed transports retry
with backoff; expired subscriptions stop. Reminder history is retained. Transport
and persistence cannot be one atomic operation, so interruption after acceptance
can result in a repeated notification with the same notification tag.

The public snapshot is collected by the existing GitHub workflow. Upstream
collection and hosting schedules may be delayed. All user-visible dates and
countdown messages use Asia/Nicosia. The web app keeps its own offline countdown
and history, but closed/offline iOS cannot receive a new network push, and it
does not offer a continuously ticking lock-screen Web Push notification.

## Activation and verification

The Netlify project has not been created. Creation is awaiting the requested user
confirmation. The connected account reports Free; remaining hosting credits are
not available through the connector. No purchase or plan upgrade is authorized.

After approval, publish the service using the checked `netlify.toml`, verify its
HTTPS config endpoint and scheduler, then set the actual URL in public/config.json.
The CLI is not locally authenticated; deployment may require the account owner to
sign in or connect the repository. Never put an authentication token in chat or
the repository. Publish the Pages config only after service validation.

Local verification: 41 Node tests, cloud entrypoint loading, dependency audit with
zero reported vulnerabilities, and a versioned static PWA build. Actual hosted
function execution, transport delivery and physical iPhone presentation remain
unverified until activation. Responsive previews are emulation on this PC.

Sources: [WebKit iOS push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/),
[Apple Home Screen web app guide](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios),
[Netlify conditional Blob writes](https://docs.netlify.com/build/data-and-storage/netlify-blobs/),
[Netlify Free limits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).

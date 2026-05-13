# Architecture

`nSealr/companion` is the untrusted host-side software shared by all signer
lines.

## Responsibilities

- Construct signing requests from Nostr event templates.
- Move requests over selected transports.
- Verify signer responses against `nSealr/specs`.
- Provide CLI and automated harnesses before browser or GUI workflows.
- Reject mismatched event ids, pubkeys, signatures, and request ids.

## Trust Boundary

The companion must not be trusted with production private keys. A development
signer may exist only as an explicit test harness.

Before any production signer I/O, production browser-extension packaging, full
NIP-46 relay session, or file-backed persistent grant use is added, companion
code must pass the M4.5
pre-signing hardening gate. Signing-request validation, NIP-46 bridge
conversion, QR/serial decoding, and policy-file parsing must share explicit
nSealr v0 limits and deterministic rejection behavior. CLI commands should
only adapt file/argument I/O around package-owned validation logic.

The companion is infrastructure, not a first-class signer family. Per-solution
feature status lives in `nSealr/specs`
`vectors/features/signer-feature-matrix-v0.json`. When companion exposes a
feature used by multiple signer families, such as request validation, review
projection, policy decisions, transport framing, or response verification, it
must follow the shared `contract_id` instead of creating a host-only variant.

Browser extension, npm SDK, CLI, local app, local service, and full NIP-46
relay support are companion access surfaces. They must stay thin over
package-owned logic. In particular, a browser extension may expose NIP-07
`window.nostr`, but it must not store production signing material or implement
browser-local production signing. An npm SDK may expose reusable helper
packages, but it must not export test-only signing as a production path.

## Implemented Modules

- `apps/cli`: command-line entrypoint.
- `apps/browser-extension`: private browser-extension boundary scaffold. It
  owns strict internal message parsing and provider-backed request handling for
  `get_public_key` and `sign_event`, validates provider outputs before browser
  callers can trust them, derives sender-bound client identity before provider
  selection, can compose that identity with the native-messaging local-service
  provider path, can request digest-bound local-service pairing intents for the
  same identity, can project those intents into deterministic review metadata
  without approving clients, has a pure background-controller boundary over
  injected native messaging with optional response timeouts and request-scoped
  cancellation, has a pure page-provider boundary that maps NIP-07
  `getPublicKey` and `signEvent` calls to validated background requests, and
  can build a minimal MV3 manifest with `nativeMessaging` as the only
  permission. It does not yet ship extension packaging, content-script
  injection, native-host installation, permission UI, persistent grants, or
  signer dispatch.
- `packages/core`: NIP-01 event id and BIP-340 verification.
- `packages/protocol`: schema validation, typed request/response models, the
  central nSealr v0 implementation limit profile used by companion parsers,
  and signing-status consistency checks so a signer cannot claim
  `signing_enabled: true` while still reporting missing gates or
  `signing_enabled: false` without reporting at least one blocker. Gate lists
  are also checked for duplicates. Response request ids must follow the same
  v0 profile as requests, and signed-event responses are checked against the
  same integer-safety, content, and tag resource limits before transport or CLI
  callers can treat them as accepted output.
- `packages/fixtures`: shared event, key, trusted-review,
  review-display-frame, review-detail-page, QR review-transcript, NIP-46
  payload, NIP-46 policy-file, account-descriptor, policy-profile,
  grant-descriptor, policy-decision, feature-matrix, limit-profile, and
  invalid hardening fixture loading.
  Package code also owns QR review-transcript fixture validation, including
  `scroll` buttons and rendered-frame `body_line_styles`, so the CLI does not
  duplicate that contract.
  Package code also validates feature matrices so shared feature `contract_id`
  drift and Raspberry/ESP32 stateless QR vault target drift fail in companion
  conformance checks.
- `packages/policy`: secretless account, route, recovery, policy, grant
  descriptor parsing, and pure policy-decision evaluation. This package owns
  anti-secret, anti-QR-automation, anti-decrypt-grant, and audit-event decision
  checks so CLI code does not grow a parallel policy parser.
- `packages/review`: deterministic event-template review summary generation
  for untrusted companion previews and conformance checks.
- `packages/dev-signer`: private test-only signing implementation and
  development signer transport. It is not a production signer route and must
  not become a dependency of publishable production packages.
- `packages/transport`: signer transport interface plus JSON file, JSON-lines
  stdio, serial-frame, and serial-line adapters. It is intentionally
  secretless and does not depend on `@nsealr/dev-signer`.
- `packages/qr`: v0 `nsealr1:` QR envelope encoding and decoding.
- `packages/framing`: checksum-protected serial line framing draft with the
  shared v0 serial-frame byte limit.
- `packages/smartcard`: APDU codec, simulator adapter, provider-based PC/SC
  APDU transport boundary, `SmartcardSigner` boundary, and response
  verification for the display-less smartcard line.
- `packages/nip46`: decrypted NIP-46 payload bridge for `get_public_key`,
  `sign_event`, local `ping`, and conversion from nSealr responses back to
  NIP-46 result/error strings. It also validates requested permission strings
  and policy files, and parses `connect` messages into review intents and
  deterministic review pages for later policy work.
  Permission matching is present as a pure boundary and is pinned by shared
  permission policy fixture checks. Bridge decision output is also present: a
  permitted request can become a signer request, `ping` can produce a local
  response, `connect` can produce a review intent, and missing permissions
  produce deterministic NIP-46 errors before signer transport. Permission
  storage and grant UX remain separate layers.
- `packages/client`: local companion service request/response protocol,
  native-messaging frame codec, service status, pairing intent generation,
  shared local-client identity parsing, deterministic pairing-review
  projection, grant enforcement, a strict
  secretless JSON grant-store contract, secretless account-route selection,
  signer-request validation, signer-response verification, response
  validation, and a high-level client wrapper. The wrapper checks request-id
  correlation, malformed responses, and operation-specific result types before
  callers can trust native-messaging responses. This is the shared
  client/service boundary for future browser extension, SDK, and desktop work.
- `packages/browser-provider`: NIP-07 provider adapter for browser-extension
  packaging. It accepts an injected companion backend plus explicit client
  identity, validates public keys, converts `signEvent` inputs into nSealr
  signer requests, verifies signed responses, and stores no browser-side
  production keys. Its local-service backend adapter can read the selected
  account public key through authorized route selection and returns
  deterministic signer-unavailable responses until signer dispatch is
  implemented. Its browser native-messaging adapter can bound silent or
  cancelled exchanges with optional deterministic response timeouts and
  `AbortSignal` handling.
- `packages/sdk`: platform-neutral namespace facade for app, browser-extension,
  and companion integrations. It excludes private test signing, Node-only
  fixtures, and host transport adapters so browser-safe consumers have a clean
  entrypoint.
- `apps/service`: private native-messaging host scaffold over
  `packages/client`. It processes multiple length-prefixed service messages on
  one stdio session, accepts explicit in-memory authorization context in tests,
  can load explicit read-only secretless grant/account JSON context files for
  developer and integration harnesses, returns deterministic native-frame
  errors, and can print validated Chromium/Firefox native-host manifest JSON.
  It is intentionally secretless and does not yet install manifest files, write
  grant/account storage, perform production grant persistence, open relays, or
  dispatch signer transports.

Each reusable package has its own `package.json`, source `src/index.ts`
entrypoint, and built `dist` JS/declaration export. Cross-package source imports
must go through `@nsealr/*` entrypoints, not relative paths into another
package's `src` directory. The repository verifier checks this boundary so
future extension, SDK, local-service, and CLI work cannot accidentally fork
validation or signing helper code.

## Access Surface Boundary

The intended access surfaces are:

- CLI: operator and lab harness over package-owned logic.
- Local companion service: future IPC/API boundary for browser extension,
  desktop UI, and high-level SDK clients.
- Browser extension: NIP-07 provider that forwards requests to companion and
  returns only verified results.
- npm SDK: public package set for clients and tools that need nSealr request,
  transport, policy, and verification helpers.
- NIP-46 relay service: encrypted remote-signer compatibility after session,
  grant, and policy contracts are ready.
- Desktop/operator UI: account, route, diagnostics, policy proposal, and audit
  surface over the same local service.

All of them must use the same request validator before contacting a signer
route and the same response verifier before returning signed events. None of
them may store production `nsec`, seed, mnemonic, passphrase, decrypted signing
material, or NIP-49 plaintext. Extension/session pairing data is still
sensitive and needs expiry, revocation, and origin/app binding before
production use.

Native messaging is the preferred first serious browser-extension transport to
the local companion. A localhost HTTP/WebSocket API remains research until
origin binding, CSRF protection, pairing, rate limits, and kill-switch behavior
are explicitly specified and tested. The M4.7 threat-model decision selects
native messaging for browser alpha because it avoids exposing an always-on
loopback service to ordinary web pages. Desktop, CLI, and SDK callers should
reuse the same local-service semantics rather than defining a separate security
model.

The first native-messaging scaffold accepts `service_status`,
`request_pairing`, `select_account_route`, `validate_signer_request`, and
`verify_signer_response`.
`@nsealr/client/client-identity` owns the browser-safe shared local-client
identity parser for every access surface. Browser extension, SDK, desktop, CLI,
and native-host code must reuse that parser before deriving client ids,
requesting pairing, selecting account routes, or trusting pairing responses.
It rejects unsupported surfaces, non-origin URLs such as
`https://example.com/path`, deceptive localhost names, overlong app names,
invalid instance ids, and extra fields.
Pairing requests return a deterministic intent for later user review; they do
not approve the client. Validation and verification require explicit grants
supplied by the caller/test harness. When grant history is supplied, the latest
matching grant by `approved_at` wins, so newer revocation or narrower scope
cannot be bypassed by an older grant. Revoked, expired, missing, or
operation-scoped grants fail before signer payload handling. This lets browser,
SDK, and desktop code integrate against the authorization, validation, and
verification boundary before any signer I/O or persistent session state is
exposed. `@nsealr/client` now includes the caller-side wrapper for both object
exchange and native-messaging frame exchange; it validates service responses and
request-id correlation before returning them to higher-level callers.
The CLI `nsealr local review-pairing` command exposes the same deterministic
pairing-review projection for local/manual inspection. It validates the
digest-bound intent and writes review metadata only; it does not create grants,
approve clients, or write grant-store files.
The companion CLI also has `nsealr local approve-pairing`, which creates a
pairing approval artifact only after the caller supplies the reviewed pairing
digest. The artifact contains the approved grant metadata, but the command does
not append it to a grant store, choose storage locations, or contact signer
transports.
`nsealr local grant-store append-approval` is the first explicit grant-store
artifact builder. It validates a pairing approval artifact through
`@nsealr/client`, creates or extends a caller-supplied secretless grant-store
JSON object, and writes only the requested output path. It never chooses a
default storage location, mutates the input store, approves clients by itself,
or contacts signer transports.
`nsealr local grant-store revoke-client` appends a latest-client revocation to
a new output grant-store artifact. Revocation is selected by
`client_id + origin + surface`, keeps prior grants in the history, and fails
deterministically if no matching grant exists or if the latest matching grant
is already revoked.
The private `@nsealr/service` app now runs a tested multi-message native-host
stdio loop, so a future browser extension can keep one native-messaging port
open and receive one deterministic response per length-prefixed service
request. It can also generate validated Chromium/Firefox native-host manifest
JSON with explicit host path and extension id inputs. `@nsealr/client` also
defines the persistent grant-store JSON contract used to serialize approved and
revoked local client grants without secret material. The private service app
can now load explicit read-only grant/account context files for local harnesses,
but this still does not add manifest installation, default storage locations,
file writes, signer dispatch, relay sessions, or browser packaging.

The browser-provider package is intentionally one layer above this service
boundary. Each provider instance is bound to a client identity so the future
native-messaging backend can route pairing, revocation, and origin decisions
without inferring identity from unsigned browser data. It does not include an
extension manifest, native-host install flow, permission UI, account routing,
persistent grants, NIP-04, NIP-44, or relay sessions. It is the package-level
contract that a future extension will expose as `window.nostr`.
The first local-service backend adapter uses the same local-service route
selection and signer-request validation operations, but it still returns
deterministic signer-unavailable responses for `signEvent` because route
dispatch is not implemented yet.
The package also includes a browser native-messaging local-service client
adapter over an explicit `sendNativeMessage(hostName, message)` function. This
keeps browser API integration thin while reusing `LocalServiceClient` response
validation, optional deterministic response timeouts, request cancellation, and
the shared native host name used by the private service manifest generator. It
does not install native-host manifests, persist grants, or open signer
transports.
The private `@nsealr/browser-extension` app now defines the internal extension
message boundary for `get_public_key` and `sign_event`. The parser rejects
unsupported NIP-07/NIP-44/NIP-04-style methods, malformed request ids, extra
fields, and unsafe event templates before provider handling. The first handler
is still browser-API-free and receives an injected provider; it validates
public keys, checks signed events against the original request, and returns
secretless deterministic errors for malformed requests or malformed provider
outputs.
The same app now has a browser-API-free page-provider boundary that exposes the
minimal NIP-07 `getPublicKey` and `signEvent` methods over an injected
background requester. It constructs only validated internal extension messages,
rejects unsafe event templates before contacting the background boundary,
verifies signed event responses, and forwards cancellation signals. It does
not install or inject content scripts, write browser storage, create grants, or
hold key material.
The same private app has a browser-API-free sender context boundary. The future
adapter must pass only sanitized `extension_id`, `page_origin` or `page_url`,
and optional reviewed app name. The boundary strips full URLs down to origins,
rejects mismatched origin/URL pairs, rejects deceptive localhost names and
extension-page origins, and creates the `browser_extension` local client
identity through `@nsealr/client/client-identity`. It stores no browser-side
production secrets and does not grant a page by itself.
The sender-aware handler composes both boundaries before provider selection: it
parses the internal request, validates sender-derived identity, and only then
asks the injected provider factory for a provider bound to that client context.
Malformed requests and malformed senders return deterministic secretless errors
without provider selection or signer I/O.
Its manifest builder is intentionally restrictive: Chromium manifests omit host
permissions, optional host permissions, content scripts, and storage; Firefox
manifests require an explicit reviewed extension id and otherwise follow the
same zero-host-permission boundary. Origin injection and durable extension
metadata remain blocked on permission UX and reviewed storage locations.

Executable SDK examples live in private app `@nsealr/sdk-examples`. They are
not another access surface and do not own production behavior. Their role is to
prove that a consumer can use the built public package entrypoints for request
validation, QR envelopes, local-service calls, browser-provider integration,
and already-decrypted NIP-46 decisions without importing private test-only
signing code or storing secrets.

## Current CLI Flow

The M2 CLI flow is:

1. Build a request from an unsigned Nostr event template.
2. Produce a development response with an explicit software test key.
3. Verify the response against the original request before any downstream use.

The same commands support JSON files and v0 `nsealr1:` QR envelope files so the
desktop companion can drive the Raspberry QR vault flow before camera/display
hardware is integrated.

`nsealr review-request` can render the same deterministic review JSON from a
JSON or QR `sign_event` request. With `--screen-review` it emits the
digest-bound screen-page model; with `--detail-pages` it emits the complete
constrained-display detail-page model used by Raspberry and ESP32 review UI
tests. Detail-page rendering defaults to the T-Display S3 sized profile and
accepts explicit title/body/compact line limits so lab and device adapters can
compare the same display envelope. These modes are deliberately labeled as
untrusted previews: they help users and automated tests see what a conforming
signer should display, but approval authority still belongs to the vault,
firmware, or card line holding the key.

The development signer exists only for local testing. Production signer lines
must replace it with a hardware, vault, or smartcard transport while preserving
the same request/response verification boundary.

## Transport Boundary

Every transport implements a single `exchange(request)` contract. Transport
adapters are responsible for moving JSON request and response envelopes only.
The companion remains responsible for validating request/response shape and
cryptographically verifying successful signed-event responses after transport
completion.

The shared transport boundary now enforces that verification before returning
from `exchange`: request shape is checked before sending, response shape and
`request_id` are checked after receiving, and successful `sign_event` responses
must pass NIP-01 event-id and BIP-340 signature verification against the
original request. Error responses such as `signing_disabled` can still return
as valid refusals.

Trusted-review vectors are loaded from `nSealr/specs` so host tools and
device implementations can agree on what must be shown before approval. They do
not make the companion trusted; they are conformance data for signer UIs.

Review-display-frame vectors are loaded and shape-checked as bounded rendering
contracts for small trusted screens. The companion treats them as conformance
data for Raspberry and ESP32 adapters, not as host-side approval authority.

Review-detail-page vectors are also loaded and shape-checked as complete
physical review-page contracts for constrained signer displays. They preserve
the shared `approval_digest` but pin scroll windows, line styles, continuation
indentation, visible JSON-style escapes for decoded control characters, and
explicit codepoint fallback separately from the digest-bound `screen-pages`
model. The companion can render these pages for previews and cross-repo
comparison, but still treats them as conformance data, not as a trusted
approval surface.

QR review-transcript vectors are also loaded and shape-checked by
`nsealr fixture verify`. They bind raw QR input to frame/button/decision
sequences for Raspberry and ESP32 adapter tests; the companion treats them as
conformance data, not as trusted approval authority. The transcript validator
lives in `packages/fixtures`, and `apps/cli` only calls it while iterating the
loaded fixture set.

NIP-46 payload vectors are loaded and verified by `nsealr fixture verify` so the
host bridge and shared specs agree on decrypted `get_public_key`, `sign_event`,
local `ping`, response mapping, and permission policy behavior before relay and
encryption work begins.

NIP-46 policy-file vectors are loaded and verified by `nsealr fixture verify` so
explicit approved-permission inputs stay normalized across specs, companion,
and lab integration. Package code owns the parser; the CLI only reads files and
passes parsed policies into bridge decisions. They are read-only conformance
files, not a grant store.

Account, policy, and grant descriptors are loaded through `packages/policy`.
The companion may keep labels, public keys, signer routes, recovery
descriptors, capabilities, policy ids, and scoped grant metadata. It must not
store production `nsec`, mnemonic, seed, passphrase, NIP-49 ciphertext, or raw
private key material. Stateless QR vault routes remain manual-only and cannot
receive persistent grants.

Route-selection vectors are also consumed through `packages/policy`. The
selector is pure and secretless: it accepts parsed account descriptors plus a
requested account/method and returns selected route metadata only. It does not
open transports, create grants, approve clients, dispatch signer I/O, or claim
route readiness.

Those descriptors model the resulting signing public key and route. The
mnemonic, BIP-39 passphrase namespace, standalone `nsec`, device slot,
smartcard slot, or external bunker is a key source or route; policy attaches to
the resulting public key. Companion can prepare a policy proposal and transport
it, but a persistent nSealr device must review and accept authoritative
policy changes locally before they affect signing.

Policy-decision vectors are also consumed through `packages/policy`. The
current evaluator is pure and stateless: it accepts an explicit policy profile,
explicit grant descriptors, and an explicit request snapshot, then returns a
deterministic allow, deny, or manual-review decision plus a
`nsealr-grant-audit-event-v0` object. It deliberately does not create a grant
store, persist approvals, acknowledge NIP-46 `connect`, open relay sessions, or
contact signer transports.

The current scoped-automation fixtures are deliberately minimal conformance
data. They prove bounded decisions, denial, manual-review routing, revocation,
expiry, and audit-event shape before grant storage exists; they are not the
final product policy menu and should not grow into companion-owned rule-engine
state.

Pre-signing hardening vectors are the companion's rejection oracle for unsafe
input. They must be evaluated before signer transport, dev signing,
smartcard-sim signing, or NIP-46 routing can proceed, and failures must not
write output artifacts. The same invalid-vector suite also covers unsafe
signed-event response payloads so a real device output cannot bypass the v0
integer-safety, content, and tag limits after signing.

The current adapters cover these development paths:

- `DevSignerTransport`: in-memory test signer in private `@nsealr/dev-signer`
  for deterministic harnesses.
- `JsonFileTransport`: file handoff for QR vault and offline workflow tests.
- `JsonLineStdioTransport`: one-shot process bridge for external signer
  adapters and future hardware simulators. It bounds the pre-newline response
  buffer and captured stderr before returning or reporting process output, and
  terminates silent signer processes after a bounded response timeout.
- `SerialFrameTransport`: one-shot `nsealr1f:` request/response exchange for
  USB-serial, UART, and firmware smoke-test adapters. It treats
  `nsealr1f:error` as a transport diagnostic and includes the device error code
  in the thrown error instead of returning it as a signer response.
- `SerialLineTransport`: newline-oriented serial transport boundary with an
  injected port. It writes a validated `nsealr1f:` request frame, skips
  non-protocol device log lines, normalizes `LF`/`CRLF` line endings, rejects
  stalled writes and silent ports with deterministic timeouts, then returns
  through the same response shape, request-id, and signed-output verification
  gate as `SerialFrameTransport`.
- `SerialLineStreamPort`: dependency-free Node stream adapter for the
  serial-line boundary. It buffers chunked readable-stream output into complete
  lines, rejects any buffered line that exceeds the shared v0 serial-frame byte
  limit, writes newline-terminated request frames to a writable stream, and can
  close its underlying streams after failed exchanges.
- `exchangeSerialLineRequest`: package-owned one-shot serial-line exchange
  helper. It validates the request before opening a port, delegates exchange to
  `SerialLineTransport`, and closes the opened port in a `finally` block. CLI
  and future native bindings should use this boundary instead of duplicating
  validation/open/close sequencing.
- `nsealr serial-frame wrap-request` and `nsealr serial-frame unwrap-response`:
  offline CLI helpers for producing validated serial request frames and
  decoding validated serial response frames during ESP32 bring-up. With
  `--request`, response unwrapping also verifies the original request id and
  signed-output binding before writing output. These commands do not open a
  physical USB, CDC, HID, WebUSB, or WebSerial connection.
- `nsealr serial-line exchange`: one-shot local USB-serial CLI helper over
  `exchangeSerialLineRequest`. It opens a newline-oriented device path only
  after request validation, writes the chosen output format only after response
  verification, and is not a browser transport, relay session, persistent
  signer connection, or permission grant mechanism.
- `nsealr request get-capabilities`, `nsealr request get-public-key`, and
  `nsealr request get-signing-status`: host-side generators for non-sensitive
  parameterless device requests. They validate caller-supplied request ids
  before writing output and are useful for serial-frame hardware captures
  without involving signing.

## Smartcard Boundary

The first smartcard package covers the display-less APDU contract from
`nSealr/specs`: `GET_PUBLIC_KEY` and `SIGN_EVENT_ID`. It can protect key
material in a card-like boundary, but trusted event review must still happen
before the companion sends a 32-byte event id to a card.

`SmartcardSigner` models the companion side of that boundary. It retrieves the
card public key, computes the NIP-01 event id from the requested template, asks
the card to sign only that 32-byte id, verifies the returned Schnorr signature,
and emits the standard signed-event response. It refuses to sign unless the
caller supplies an explicit review acknowledgement. That acknowledgement is a
workflow guard for display-less smartcards, not proof that the untrusted host is
a trusted display. The display-less signer boundary therefore accepts only
`external-review` acknowledgement; any future trusted-display smartcard product
must be modeled as a separate trusted-review surface. External
`approvalDigest` input is mandatory, and the signer recomputes the shared
screen-review digest and rejects missing or mismatched values before APDU
exchange. It also reuses the shared request validator before APDU exchange, so
package callers cannot bypass CLI validation with host-supplied `id`, `pubkey`,
`sig`, malformed tags, oversized content, or other unsafe `sign_event` shapes.

`nsealr review-request --screen-review` renders the same deterministic screen
pages and `approval_digest` used by the shared vectors. `nsealr
smartcard-sim-sign` exposes the APDU flow through a test-only simulator and
requires `--approval-digest` whenever `--review-acknowledged` is used. Real
PC/SC and NFC transports must implement the same APDU exchange interface
without weakening the review acknowledgement requirement.

The PC/SC boundary is provider-based: tests can inject fake readers and future
desktop adapters can inject a real PC/SC provider without making a native card
driver a required companion dependency. It normalizes provider enumeration
failures, malformed reader-list results, and reader connection failures into
`PcscUnavailableError` before any APDU exchange, and normalizes APDU transmit
failures into the same error family after a connection is opened. It also
validates transmit-result shape, response status bytes, response data shape, and
numeric response data bytes before constructing response APDUs, so a malformed
provider response cannot be silently truncated or surfaced as a generic runtime
type error. It is not a real-card compatibility claim.

## NIP-46 Bridge Boundary

The first NIP-46 module handles only already-decrypted JSON-RPC-like payloads
from NIP-46 kind `24133` content. It does not implement relay subscriptions,
NIP-44 encryption/decryption, connection tokens, permission persistence, or auth
challenge UX.

The bridge maps `get_public_key` and `sign_event` messages into standard
nSealr v1 requests so any signer transport can handle them behind the same
verification boundary. `ping` is answered locally with `pong` because it does
not require a key-holding device. Signed-event responses are returned as
NIP-46 result strings containing JSON-stringified Nostr events; public-key
responses return the hex key string; nSealr error responses become NIP-46
error strings.

This keeps NIP-46 as a host transport/bridge layer. Trusted event review and
approval remain with the Raspberry, ESP32, smartcard-assisted, or future
hardware-wallet signer boundary.

Permission parsing is intentionally separate from permission grants. The parser
accepts the NIP-46 `method[:params]` string form, validates numeric
`sign_event:<kind>` selectors, and rejects `connect` as a requested permission.
The matching helper derives a required permission from a later request and
checks it against an already-approved permission set. A broad `sign_event`
permission matches every event kind; `sign_event:<kind>` matches only that
kind. Shared specs fixtures now include the derived requirement and
positive/negative permission checks for conformance. The bridge decision helper
uses the same matching result to produce signer routing, local `ping`, `connect`
review, or permission-denied responses. Actual grant storage, revocation, auth
challenges, and user approval UX remain future policy layers.

`nsealr nip46 decide` exposes that boundary as a file-backed test harness for
already-decrypted payloads. It writes the same deterministic decision JSON used
by shared vectors. The command accepts either an explicit permission string or
a read-only `nsealr-nip46-policy-v0` policy file pinned by shared specs
vectors. It does not create or update policy files, open relay sessions,
decrypt NIP-44 payloads, persist grants, or contact signer transports.

`nsealr nip46 review-connect` exposes only the review projection for an
already-decrypted `connect` request. It writes deterministic pages with the
remote signer pubkey, secret presence, and requested permission labels. It does
not echo the secret value, return `ack`, persist a grant, or authorize the
client.

`connect` parsing is also intentionally non-committal. The bridge can extract
the remote-signer pubkey, optional secret, and requested permissions into a
review intent and deterministic review pages, but it does not return `ack`,
echo secrets, persist grants, or authorize a client. A later policy layer must
review and explicitly approve that intent. The same boundary is now covered by
a shared `nSealr/specs` NIP-46 vector and `nsealr fixture verify`.

## QR Envelope

The companion follows the shared `nSealr/specs` QR v0 format:

```text
nsealr1:<base64url-json>
nsealr1a:<payload-sha256-hex>:<index>/<total>:<base64url-json-chunk>:<frame-checksum-hex16>
```

The static v0 envelope is deliberately uncompressed and single-part. The
animated v0 frame set keeps the same uncompressed JSON payload but splits the
base64url text across bounded `nsealr1a:` frames. Each frame carries the full
decoded JSON SHA-256 digest, a one-based index/total pair, and a short frame
checksum so receivers can reject missing, duplicated, reordered, or tampered
frames before parsing JSON. Compression and fountain codes remain out of scope.
The decoder enforces the shared static QR decoded JSON byte limit and rejects
padded base64url, invalid UTF-8, malformed JSON, and malformed prefixes before
any review or signing flow can consume the payload.
Animated decoding enforces separate decoded-JSON, frame-payload, and frame-count
limits from `nSealr/specs`, then still relies on request/response validation
to decide whether the reassembled payload is acceptable for the caller.

## Serial Frame Draft

The initial serial frame is one newline-terminated ASCII line:

```text
nsealr1f:<type>:<base64url-json>:<checksum>\n
```

Supported frame types are `request`, `response`, and `error`. The checksum is
the first 16 lowercase hexadecimal characters of SHA-256 over
`<type>:<base64url-json>`. This is not an authentication mechanism; it only
catches accidental framing and transport corruption before the companion applies
schema and signature verification.
The decoder enforces the shared complete-frame byte limit and rejects malformed
payloads before JSON parsing.

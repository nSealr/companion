# Roadmap

## M2: CLI MVP

- TypeScript pnpm workspace.
- CLI request generation.
- Fixture verification.
- Test-only dev signer.
- Response verification.

Status: implemented as the first companion foundation with JSON and QR envelope
CLI paths. Fixture verification now includes shared review-display-frame,
review-detail-page, QR review-transcript, NIP-46 payload, NIP-46 policy-file,
account-descriptor, policy-profile, grant-descriptor, policy-decision,
limit-profile, and invalid hardening vectors in addition to event and
trusted-review vectors. The
shared invalid-vector set now includes strict response-shape rejection for
ambiguous result payloads, error/result mixing, and unknown top-level response
fields, plus contradictory signing-status readiness where a device claims
`signing_enabled: true` while still listing missing gates, and reason-less
disabled status where `signing_enabled: false` omits all missing gates.
Malformed JSON and unsupported request-method CLI rejection tests are now
covered. `verify-response` now validates the original request before
accepting any response, so malformed request files cannot be certified by
pairing them with a validly shaped response. The request CLI now also emits
validated parameterless device requests for capability discovery, public-key
lookup, and signing-readiness diagnostics, including caller-supplied
`request_id` values for hardware traces. The review CLI can now render
constrained-display detail pages from shared review vectors for untrusted
preview and cross-repo conformance checks, with explicit display-limit
overrides for alternate constrained-screen profiles. Fixture verification also
checks the review detail-page style contract so wrapped tag/author continuation
lines remain distinguishable from new items.

## M3: Transport Layer

- File transport.
- Stdio transport.
- Simulated signer.
- QR envelope package.
- Serial framing draft.
- Serial frame transport adapter.
- Injected serial-line transport boundary for future native USB/WebSerial
  adapters.
- Stream-backed serial-line port adapter for dependency-free hardware adapter
  tests.
- CLI serial-frame wrapping and unwrapping helpers.

Status: file, stdio, in-memory development signer transport, QR envelope,
serial framing, serial-frame transport foundations, and offline CLI
serial-frame helpers are implemented. Transport adapters now validate outbound
request payloads and inbound response payloads at their boundary, including the
development signer, JSON file handoff, JSON-lines stdio, and serial-frame
adapters. Exchange adapters also reject otherwise valid responses whose
`request_id` does not match the outbound request, and they cryptographically
verify successful `sign_event` responses before returning them. Malformed
requests, malformed device responses, invalid signed-event output, or
stale/mismatched responses cannot bypass the standard protocol and verification
gates through these adapters. The JSON-lines stdio adapter now bounds
unterminated response output and captured stderr diagnostics from external
signer processes, and it times out silent signer processes that do not return
a JSON-line response. The injected serial-line boundary can drive a
newline-oriented port while ignoring device log lines and normalizing common
serial line endings. It now also rejects silent ports with a deterministic
response timeout and stalled writes with a deterministic write timeout,
preparing physical USB serial integration without adding a native dependency to
CI. A stream-backed line-port adapter is also in place so future native
USB/WebSerial bindings can be tested through Node streams before opening real
hardware, and that adapter now bounds buffered lines with the shared v0
serial-frame byte limit. Serial-frame encoding now also rejects frames that
would exceed the shared v0 serial-frame byte limit before a CLI or transport
can write an over-limit line. Serial-frame transport surfaces device
`nsealr1f:error` payloads as deterministic transport diagnostics instead of
discarding the error code. The offline serial-frame unwrap helper can now take
the original request and reject mismatched captured responses before writing
output. The one-shot serial-line exchange boundary is now package-owned in
`packages/transport`: it validates the request before opening a local newline
serial device path, skips firmware log lines, verifies the response before
returning it, and closes the opened port. `nsealr serial-line exchange` is a
thin CLI adapter over that boundary.
M3 remains open for larger-payload strategy beyond v0 frame refusal and a
production-grade browser/native USB/WebSerial binding.

## M4: NIP-46 Payload Bridge

- Decrypted JSON-RPC-like content mapping.
- `get_public_key` and `sign_event` request conversion to nSealr requests.
- Local `ping` handling.
- nSealr response conversion back to NIP-46 result/error strings.
- Requested permission string parsing for future `connect` review.
- `connect` request parsing into explicit policy-review intents.
- Deterministic `connect` review-page rendering without echoing secrets or
  creating grants.
- Request permission matching against explicit in-memory grant inputs.
- Bridge decisions for permitted signer routing, local `ping`, `connect`
  review, and denied permissions.
- CLI decision harness for already-decrypted NIP-46 payloads.
- Read-only policy-file input for the CLI decision harness.

Status: the first decrypted-payload bridge is implemented in `packages/nip46`.
It consumes shared `nSealr/specs` NIP-46 payload vectors through unit tests
and `nsealr fixture verify`, and it now parses NIP-46 requested permission
strings plus `connect` intents and can match later requests against explicit
permission inputs without granting or persisting them. The `connect` intent
path, deterministic `connect` review pages, and non-`connect` permission
policy checks are now pinned by shared specs vectors. Bridge decisions are also
pinned by shared specs vectors, including permission-denied NIP-46 responses
before a request reaches signer transport. `nsealr nip46 decide` exposes those
decisions as a file-backed CLI harness for integration tests. `nsealr nip46
review-connect` exposes only the deterministic review pages for a `connect`
message. The decision command can read explicit permissions from the command
line or from a `nsealr-nip46-policy-v0` policy file pinned by shared specs
vectors, but neither command creates, updates, approves, or persists grants by
itself. Policy-file parsing is now package-owned in `packages/nip46`, leaving
the CLI as a file/argument adapter. These paths also do not add relay,
encryption, or signer I/O.
Relay sessions, NIP-44 encryption/decryption, connection token responses,
permission storage, grant review, and auth challenge UX remain future work.

## M4.5: Pre-Signing Contract Hardening

- Move NIP-46 policy-file parsing into package-owned logic so CLI commands stay
  thin wrappers.
- Add a central nSealr v0 limit profile in protocol code and enforce it in
  signing-request validation.
- Make NIP-46 bridge conversion reuse standard request validation so unsafe
  already-decrypted payloads cannot bypass the signing-request validator.
- Add tests for shared malicious vectors and deterministic rejection before any
  signer transport is contacted or output file is written.
- Add a `nostr-tools` test oracle for NIP-01 canonical event hash/signature
  conformance without coupling production code to that dependency.

Status: implemented for companion-owned boundaries. `packages/protocol`
enforces the shared v0 limits, QR/serial decoders reject malformed or oversized
frames, `packages/nip46` owns policy-file parsing and request conversion, CLI
decision commands fail before writing output, and test-only Nostr conformance
is cross-checked with `nostr-tools`. `nSealr/lab` now pins the cross-repo
behavior after Raspberry and ESP32 consumed the applicable vectors. The gate
still blocks full NIP-46 relay sessions, production browser-extension
packaging, file-backed persistent grant use, and production signer I/O.

Status note, 2026-05-11: response validation now rejects signed-event outputs
whose integer fields, content, or tags exceed the shared v0 implementation
limits, and rejects response request ids outside the shared v0 profile. This
keeps the accepted-output side of companion verification aligned with the
pre-signing request boundary.

Status note, 2026-05-11: invalid hardening fixture loading tests now derive the
expected vector names from `vectors/invalid/*.json` instead of a hand-maintained
list, reducing snapshot drift as the shared contract grows.

Status note, 2026-05-11: companion fixture verification now consumes the shared
account-descriptor, policy-profile, and grant-descriptor vectors. The package
parser rejects embedded secret fields, QR-vault automation, wildcard grants,
and stateless QR-vault grant targets. This is policy metadata validation only;
it does not add local-service grant persistence or a browser/relay session.

Status note, 2026-05-11: companion policy code now consumes shared
policy-decision transcript vectors. The pure evaluator allows only an explicit
matching unexpired/unrevoked grant, denies expired, revoked, and secret-export
requests, routes decrypt and unknown methods to manual review, and emits the
expected audit-event object. This still does not add a grant store, relay
session, signer I/O, or production key custody.

Status note, 2026-05-13: companion policy code now consumes shared
route-selection vectors. The pure selector maps parsed account descriptors and
requested methods to secretless route metadata, rejecting unknown accounts,
ambiguous account ids, unsupported methods, and route-type mismatches before
any signer transport or production service storage exists.

Status note, 2026-05-13: the private `@nsealr/service` app now has explicit
read-only context loading for secretless local grant-store and account-store
JSON files. As of the 2026-05-18 storage-approval gate below, those file-backed
paths require digest-bound storage approval before loading. This remains a
developer and integration harness only: it chooses no default path, writes no
files, approves no clients, opens no transports, and does not change the
production approval UI or storage-write gates.

Status note, 2026-05-13: the CLI now exposes `nsealr local review-pairing` for
deterministic review metadata from a local-service pairing intent. The command
uses the same digest-bound parser as pairing approval, writes review output
only after validation, and does not create grants, approve clients, or mutate a
grant store.

Status note, 2026-05-13: the CLI now also exposes
`nsealr local approve-pairing` for digest-confirmed pairing approval artifacts.
It requires the reviewed pairing digest before writing output and does not
append to grant stores, choose storage locations, dispatch signers, or approve
clients implicitly.

Status note, 2026-05-13: the CLI now exposes
`nsealr local grant-store append-approval` for explicit grant-store artifact
construction from a validated pairing approval. It writes a new output store
only, can extend a caller-supplied input store, and still avoids default
storage paths, in-place mutation, signer dispatch, relay sessions, and implicit
approval.

Status note, 2026-05-13: the CLI now also exposes
`nsealr local grant-store revoke-client` for explicit latest-client revocation.
It appends a revocation to a new output store selected by
`client_id + origin + surface`, keeps the previous grant history intact, and
still avoids destructive deletion, default storage paths, in-place mutation,
signer dispatch, and relay sessions.

Status note, 2026-05-13: `@nsealr/client` now exposes route selection through
the local-service boundary after explicit in-memory pairing authorization. The
operation returns the same secretless route metadata pinned by shared specs
vectors. It does not create grants, persist routes, open transports, or dispatch
signer IO.

Status note, 2026-05-18: `@nsealr/client` now also owns the local-service
`dispatch_signer_request` boundary. The operation is grant-gated, validates the
signer request, selects the route, calls only an explicitly injected dispatcher,
and verifies the signer response before returning it. With no dispatcher
configured it returns deterministic `signer_route_unavailable`; this adds no
real signer transport driver, no key custody, and no production signing claim.
`@nsealr/browser-provider` now uses this service operation for NIP-07
`signEvent` instead of duplicating validate/select/unavailable behavior.

Status note, 2026-05-18: `@nsealr/client` now includes a route-aware dispatcher
registry helper. It chooses the most specific configured account/route/transport
handler, reports missing route handlers as `signer_route_unavailable`, reports
ambiguous handler configuration as a dispatch failure, and still opens no
transport by itself.

Status note, 2026-05-18: `@nsealr/client` now also exposes
`handleLocalServiceRequestAsync` for future host-owned signer drivers that need
asynchronous transport I/O, while the synchronous handler rejects async
dispatchers deterministically. The private service app now runs its CLI/native
stdio loop through that async boundary, but still configures no signer driver
from file-backed context and still stores no production secrets.

Status note, 2026-05-18: the private `@nsealr/service` app can now load an
explicit secretless route-driver store for exact account/route/USB serial-line
dispatch. As of the storage-approval gate below, the route-driver path also
requires digest-bound storage approval before loading. The store rejects secret
fields, broad or duplicate route mappings, QR-vault routes, non-USB transports,
empty route sets, and unsupported fields; it opens only the configured local
serial path through the package-owned serial-line exchange boundary. This is
developer/integration driver wiring only: it does not choose default paths,
persist routes, approve clients, hold keys, make QR vaults connected signers,
or claim production signer readiness.

Status note, 2026-05-18: file-backed service context loading now requires a
digest-bound storage approval artifact before the private service reads
explicit grant-store, account-store, or route-driver-store paths. This keeps
developer harness context loading behind the same reviewed path contract used
by grant-store writes, while still avoiding default storage locations,
production persistence, relay sessions, browser installation, or production
signer-driver acceptance.

Status note, 2026-05-19: native-host install plans are now digest-bound and
explicit about both the parent directory to ensure and the manifest file to
write. The private `@nsealr/service` app can render native-host install
approval JSON only after the caller supplies the reviewed install digest. The
approval remains artifact-only with `writes_files=false`; the separate
`--native-host-install-execute` path verifies the approval digest again, creates
only the reviewed parent directory, and writes only the reviewed manifest path
with exclusive create semantics.

Status note, 2026-05-11: the companion identity/policy boundary now follows
the official account model. Account metadata is per resulting public key and
route; key sources such as mnemonics, passphrase namespaces, standalone
`nsec`, device slots, card slots, and external signers are not stored as
production secrets by companion. Policy records are internal nSealr records,
not Nostr events. Companion may transport policy proposals, but persistent
devices must accept authoritative policy changes locally. The final
per-account policy menu remains open; current scoped-automation vectors are
minimal conformance scaffolds.

Status note, 2026-05-10: companion QR tooling now supports `qr-animated`
frame files for larger valid payloads. The implementation consumes the shared
`qr-animated-envelope-v0` vector, rejects missing or tampered frames
deterministically, and lets CLI request/response commands use one frame per
line without adding compression, fountain codes, relay sessions, or signer I/O.

## M4.6: Package Boundary Freeze

- Add explicit `@nsealr/*` package manifests, source `src/index.ts`
  entrypoints, and built `dist` exports.
- Refactor companion cross-package imports through package entrypoints instead
  of deep relative source paths.
- Keep `@nsealr/dev-signer` private and test-only.
- Remove production `@nsealr/transport` dependency on software signing helpers.
- Add repository verification for package manifests, explicit exports,
  deep-import drift, and production-package dependency drift.

Status: first implementation pass complete. Remaining work before public npm
alpha is trusted publishing activation; the API review must be repeated only
after intentional export changes.
Package README files document purpose and trust boundaries, built JS/declaration
artifacts are generated before tests, package tarballs are restricted to `dist`
plus README, consumer smokes import both workspace-built and packed package
entrypoints, executable SDK examples now cover request/QR, local-service,
browser-provider, already-decrypted NIP-46, fixtures, policy, review, framing,
smartcard APDU, and serial-line transport flows, and the changelog/release
policy pins synchronized pre-release versioning plus npm provenance
requirements. `docs/api.md` is generated from the actual public package
entrypoints and checked in CI so exported symbols cannot drift invisibly.
Package manifests now carry npm-facing descriptions, keywords, repository
directories, issue tracker, homepage, MIT license, and public provenance
`publishConfig`. Package README examples are executable TypeScript snippets
checked against built package entrypoints in CI. `docs/api-review.md` records a
package-by-package public API review bound to the current `docs/api.md` digest.
`@nsealr/sdk` now provides a platform-neutral facade over curated public
namespaces without importing private test signing, Node-only fixtures, or host
transport adapters. A manual package release rehearsal workflow now prepares
and uploads checked tarball artifacts without publishing to npm.

## Later

- M4.7 local companion service boundary for browser extension, desktop UI, and
  high-level SDK clients. First native-messaging scaffold is implemented with
  secretless service status, deterministic pairing intents, in-memory
  client-grant enforcement, deterministic pairing-review projection, manual
  approval conversion from pairing intent to a grant, signer-request
  validation, dispatcher-bound signer-request dispatch, and signer-response
  verification.
  A route-aware dispatcher registry helper now keeps future multi-route host
  wiring out of browser, SDK, and CLI access surfaces. Async local-service
  dispatch is implemented at the package and private native-host loop boundary
  so future reviewed drivers can await transport I/O without changing browser,
  SDK, or CLI access surfaces.
  The first high-level client wrapper validates request-id
  correlation, malformed service responses, and operation-specific result
  types before browser, SDK, desktop, or CLI code can trust them. Pure
  package-level route selection and the
  local-service route-selection operation are implemented, and the private
  service app now has a tested multi-message native-host stdio loop.
  `@nsealr/client` now owns validated Chromium/Firefox native-host manifest
  generation, digest-bound dry-run install-plan generation, install-approval
  artifact generation, plus the strict secretless JSON grant-store contract for
  approved and revoked local client grants; the private service app only parses
  manifest/install-plan/install-approval CLI arguments and renders JSON to
  stdout. The CLI can render pairing-review metadata,
  create digest-confirmed approval artifacts, and build explicit output
  grant-store artifacts from approval artifacts or latest-client revocations
  without default storage paths or input-file mutation. `@nsealr/client` now
  exposes the reviewed `./browser` runtime subpath plus the minimal
  `./client-identity` identity-only subpath, so future browser extension, SDK,
  desktop, CLI, and native-host surfaces do not fork local-service or
  origin/app binding rules. Private service context loading can read explicit
  grant/account JSON files for local harnesses only, and it can now opt into an
  explicit secretless account/route/USB serial-line driver store for developer
  integration, only when a storage approval artifact covers every file-backed
  context path. Route-driver dispatch now maps serial-line open, timeout,
  protocol, I/O, close, and fallback failures to deterministic local-service
  transport error codes. `@nsealr/client` now also owns digest-bound
  storage-location review and approval artifacts for explicit
  grant/account/route-driver paths, and the CLI exposes them as
  `nsealr local review-storage` and `nsealr local approve-storage` without
  choosing defaults, approving clients, or dispatching signers. Grant-store
  artifact builders now require those approvals to cover their input/output
  paths before writing, and they refuse existing output files.
  Remaining work is full approval UI, default production storage activation,
  production driver acceptance, and production installer UX around the approved
  native-host manifest writer.
  The M4.7 threat model selects native messaging for browser alpha; localhost
  HTTP/WebSocket remains research-only until origin binding, CSRF/DNS rebinding
  resistance, pairing, rate limits, app suspension, and kill-switch behavior are
  specified and tested.
- M4.8 browser extension / NIP-07 bridge with `getPublicKey` and `signEvent`
  routed through companion. Package-level provider adapter is present: it
  carries explicit client identity, validates public keys, converts `signEvent`
  inputs into nSealr `sign_event` requests, verifies signed responses, and
  stores no browser-side production key material. The provider now has a
  local-service backend adapter that can read the selected public key through
  authorized route selection and route `signEvent` through the local-service
  dispatcher boundary, returning deterministic signer-unavailable responses
  while no real dispatcher is configured. It also has a browser
  native-messaging client adapter that wraps an explicit `sendNativeMessage`
  function with the shared native host name while reusing local-service
  response validation, optional deterministic response timeouts, request
  cancellation, and request-id correlation from `@nsealr/client`. The private
  `@nsealr/browser-extension` scaffold now parses
  only internal `get_public_key` and `sign_event` messages and has a
  provider-backed handler that validates returned pubkeys/events before
  browser callers can trust them.
  It also derives local client identity from a sanitized sender page-origin
  context through the browser-safe `@nsealr/client/browser` subpath.
  The sender-aware handler validates
  both internal request and sender before provider selection. The extension
  scaffold can now create a native-messaging-backed provider selector that
  binds that sender-derived identity to the local-service dispatch path and
  keeps `sign_event` deterministically unavailable until a real signer route
  dispatcher is configured. It can also request a digest-bound local-service pairing intent
  for the same sender-derived identity without writing grants, extension
  storage, or native-host files, and can project that intent into deterministic
  pairing-review metadata plus browser-origin permission review metadata for
  future approval UI. The browser-origin permission boundary can now parse that
  review and create an approval artifact only after explicit local pairing
  digest confirmation, without creating grants, writing extension storage, or
  injecting a provider. It can now normalize those approved artifacts into a
  deterministic secretless origin-permission store contract for exact
  origin/extension/pairing-digest/method lookup, while still not choosing a
  browser storage backend, creating local-service grants, dispatching signers,
  or storing secret material. The store contract now includes deterministic
  upsert/revoke helpers for exact approved-origin records, so future popup
  storage wiring does not need to invent mutation semantics. A private
  browser-extension origin-permission CLI now exposes approval, empty-store,
  upsert, and revoke artifact commands over the same package-owned parsers,
  writing JSON to stdout only and still avoiding browser storage, grants,
  provider injection, signer dispatch, and key material. The private
  extension app now also has a pure
  origin-permission review card for future popup approval UX: it renders the
  validated review, full pairing digest, requested method effects, and
  approve/reject actions over injected controls, and accepts only parsed
  approval artifacts. It still writes no storage, creates no grants, injects no
  provider, dispatches no signer, and holds no key material. The sender-aware
  browser request handler can now consume an injected approved-origin store and
  deny stale, malformed, or method-mismatched origin permissions before provider
  selection, native messaging, route selection, or signer dispatch; the
  browser-like background entrypoint now forwards that same injected gate over
  explicit runtime dependencies, and the packaged background entrypoint now
  preserves that option instead of dropping it at the launcher boundary. A pure
  background-controller boundary now composes
  request handling, pairing-intent requests, pairing-review projection, and
  origin-permission review projection over injected native messaging without
  using browser APIs, and can use the same optional native response timeout and
  request-scoped cancellation. A pure runtime-message adapter now maps raw
  browser sender metadata into the internal sender shape, returns deterministic
  `invalid_sender` responses before native messaging, and forwards abort
  signals to the background controller; an injected runtime `onMessage`
  listener installer can register that adapter on an explicit target with
  asynchronous `sendResponse` handling and explicit teardown, still without
  calling global browser APIs. The runtime-message boundary can also emit
  secretless `nsealr-browser-extension-pending-request-state-v0` snapshots
  through an injected lifecycle, giving future UI a
  pending/resolved/rejected/cancelled request source without exposing event
  templates, keys, grants, storage writes, or signer dispatch. The lifecycle
  also owns a per-request cancel hook that aborts the in-flight native-message
  path and suppresses duplicate rejected-state drift after cancellation. The
  background entrypoint now owns an in-memory lifecycle by default, and the
  runtime-message boundary routes separate `nsealr-browser-extension-control-v0`
  `list_pending_requests` and `cancel_pending_request` messages from
  extension-internal senders only, so page-origin senders cannot list or cancel
  active requests. A popup-control client now wraps those internal messages
  over injected `runtime.sendMessage`, validates secretless responses, and
  gives future popup UI a tested list/cancel command surface without storage,
  grants, native-host installation, or signer dispatch. A pure page-provider
  boundary now maps NIP-07
  `getPublicKey` and `signEvent` calls to validated background requests,
  verifies signed responses, forwards cancellation signals, and installs on an
  explicit target without overwriting an existing provider. A pure page-bridge
  envelope now validates future page/content-script messages over an injected
  background requester, and the matching page-side requester adapter wraps
  internal requests into that bridge envelope before accepting validated bridge
  responses. A pure content-script bridge handler now binds page bridge
  envelopes to an injected sender-aware background requester without adding a
  browser listener, and a content-script runtime requester now forwards those
  validated internal requests through an injected runtime-message sender with
  cancellation propagation. A content-script runtime bridge bootstrap now
  composes the injected window listener, runtime-message sender, and response
  poster behind one install/dispose handle. A content-script entrypoint
  composer now joins page-script injection and that runtime bridge over explicit
  dependencies, including cleanup if bridge setup fails. A content-script
  browser entrypoint adapter now composes explicit document, window, location,
  and runtime dependencies over that composer without reading globals.
  Content-runtime API adapters now wrap reviewed `runtime.getURL` resource
  resolution and `runtime.sendMessage` forwarding without storage or signer
  dispatch. A shared page-origin validator now keeps page-window and
  content-window origin checks aligned. A pure content-window event adapter now
  gates already received page messages by expected source and normalized origin
  before forwarding nSealr page-bridge envelopes, an injected content-window
  listener installer can register that boundary on an explicit target with
  explicit teardown and injected response posting, and a response-poster adapter
  now posts extension responses only to reviewed `postMessage` targets and
  normalized page origins.
  The matching page-window bridge exchange now posts validated page requests to
  the exact reviewed origin, accepts only matching extension responses, and
  cleans up listeners on response, abort, timeout, or posting failure. Pure
  page-script bootstraps now compose the explicit-target NIP-07 provider
  installer with either an injected bridge exchange or the injected page-window
  bridge, and a page-script browser provider entrypoint adapter now composes
  explicit window/location dependencies over that page-window bootstrap,
  without adding an injection mechanism. A background browser entrypoint adapter
  now installs runtime message handling over explicit `runtime.onMessage` and
  `runtime.sendNativeMessage` dependencies without storage, grants, or signer
  dispatch. A secretless browser-extension route-config parser now derives the
  selected account `sign_event` route request before background listener
  installation, using package-owned policy route-request parsing instead of an
  app-local route-shape fork. A pure page-script injection
  helper now injects the reviewed page-script resource through explicit
  document and extension-URL resolver dependencies with duplicate-target and
  URL checks. Packaged background, content-script, page-script, and popup source
  entrypoint modules now call the reviewed browser adapters through an explicit
  packaged global scope, resolving only unambiguous `browser.runtime` or
  `chrome.runtime` capabilities where runtime access is needed. They still do
  not read extension storage, create grants, install native-host manifests,
  dispatch signers, or hold key material. Packaged background, content-script,
  page-script, popup, and popup HTML filenames are now distinct from the
  internal pure module filenames, and the manifest/injection helpers use those
  packaged names. A deterministic package-plan boundary now binds the reviewed
  manifest, packaged output filenames, and source launcher paths into a checked
  pre-bundling artifact, rejecting storage/host permissions or entrypoint drift
  before a bundle can be treated as reviewed. A private browser-extension
  security audit now runs in CI and rejects extension/browser-provider
  dependencies on test signing packages, signing/key-generation libraries,
  browser storage APIs, and direct signing helper calls before package-build
  work can drift into browser-side key custody. A private browser-extension
  `package-plan` script now emits that JSON to stdout only, with no output-path
  or installer behavior. Private `route-config-review` and
  `route-config-approve` scripts now create digest-bound approval artifacts for
  the secretless selected route before package build. A private `package-build`
  script now creates an explicit developer artifact in a new output directory
  only after successful in-memory bundling, embeds that approved secretless
  static route config, returns a package digest plus per-file byte counts and
  SHA-256 hashes, and still avoids
  native-host installation, extension storage writes, key custody, and signer
  dispatch. The browser-extension
  manifest builder can still build a minimal
  MV3 manifest with
  `nativeMessaging` as the only permission and no host/content-script/storage
  permissions by default, with a packaged action popup HTML/entrypoint that can
  list/cancel pending requests through the tested popup-control client, plus an
  opt-in explicit-origin content-script manifest profile that exposes only the
  packaged page-script entrypoint to those same explicit origins and rejects
  `<all_urls>`, wildcard schemes, wildcard hosts, non-local `http`, duplicate
  matches, host-permission fields, and storage. Remaining work: reviewed
  bootstrap/config UX beyond the static developer route config,
  native-messaging installation, browser UI/storage wiring for the approved
  origin-permission store into real browser UI/storage, tab/origin selection
  for popup approval, and real dispatch after M4.7 gates. No local
  production signing and no extension-side production key storage.
- M4.9 npm SDK alpha after package APIs, docs, semver, provenance, and
  consumer-import tests are stable. Current package-consumer smoke imports the
  public `@nsealr/*` entrypoints through workspace package names after building
  package `dist` artifacts and exercises a minimal no-signer path. Package
  README files document purpose and trust boundaries. Packed-tarball smoke
  validates installable tarballs before publication. Executable SDK examples
  prove common public package flows without test-only signer imports. Generated
  API docs expose every public package entrypoint symbol and fail when stale.
  Package manifests include npm-facing metadata plus provenance publish config.
  Executable SDK examples now import every publishable public package at least
  once without importing `@nsealr/dev-signer`. Public package README snippets
  are marked and executed through `make readme-examples`. The public API review
  is digest-bound to generated API docs. Public package import hygiene is now
  checked so production source cannot drift into private apps, unreviewed
  `@nsealr/*` subpaths, or the test-only signer package. Changelog and release
  policy are present. A manual release rehearsal workflow prepares checked
  tarball artifacts without npm publication. Actual npm trusted
  publishing/provenance activation remains pending.
- M5 full NIP-46/Nostr Connect relay session integration.
- WebUSB/HID/CDC/WebSerial transports and persistent signer sessions.
- PC/SC smartcard adapter backed by the implemented APDU codec and
  `SmartcardSigner` boundary.

## Smartcard Line

- APDU codec: implemented. The deterministic APDU simulator is implemented in
  private `@nsealr/dev-signer` so the publishable smartcard package stays
  secretless.
- Shared APDU rejection status vectors: implemented for wrong `SIGN_EVENT_ID`
  length, unsupported CLA, and unsupported INS.
- `SmartcardSigner` companion boundary: implemented for `GET_PUBLIC_KEY` plus
  `SIGN_EVENT_ID`, with shared request validation and external-review-only
  acknowledgement before APDU exchange. External `approvalDigest` binding is
  required and checked against shared review-screen vectors before APDU
  exchange.
- CLI simulator path: implemented as `nsealr smartcard-sim-sign`, with mandatory
  `--review-acknowledged` and `--approval-digest`.
- PC/SC/contact transport boundary: implemented as a provider-injected APDU
  exchange adapter with setup-error normalization, malformed reader-list
  rejection, APDU transmit-error normalization, transmit-result shape
  rejection, response data-shape rejection, and response byte validation; native
  reader binding and real-card tests are pending.
- NFC/mobile transport: not implemented.
- Production smartcard support: blocked on real card testing and display-less
  review policy hardening.

# Testing

## Current Baseline

```sh
make ci
```

The baseline check verifies repository structure, license policy, docs, CI,
TypeScript type safety, unit tests, integration tests, dependency audit, and
companion package-boundary rules.
The Makefile pins `pnpm@10.33.4`; it uses a global `pnpm` when present and
falls back to `npm exec` on development machines that only have Node/npm.
The workspace Vitest command is bounded to four workers to avoid local or CI
fork-worker oversubscription while keeping the full test suite enabled.

## Single-Repository CI

Tests prefer the sibling `nSealr/specs` repository when the full local
workspace is present. GitHub Actions checks out `nSealr/companion` by itself,
so tests fall back to fixture snapshots under `tests/fixtures/specs` in
single-repository CI. Cross-repository drift remains guarded by
`nSealr/lab` integration, which runs against the live sibling repositories.

## M2 Tests

- NIP-01 canonicalization tests in `packages/core`.
- BIP-340 verification tests in `packages/core`.
- Request and response shape validation tests in `packages/protocol`, including
  signing-status consistency checks that reject `signing_enabled: true` while
  any `missing_gates` remain and `signing_enabled: false` without at least one
  missing-gate reason, response request-id profile checks, plus signed-event
  response integer-safety, content, and tag limit rejection.
- Shared fixture loading tests in `packages/fixtures`.
  Invalid hardening fixture loading is directory-driven so new shared invalid
  vectors are discovered from the sibling specs checkout or local snapshot
  instead of being maintained in a hand-written name list.
  Account-descriptor, policy-profile, grant-descriptor, policy-decision, and
  route-selection loading is also directory-driven through `packages/policy`.
  QR review-transcript fixture validation also lives in this package and covers
  `scroll` buttons plus rendered-frame `body_line_styles` mismatch rejection,
  keeping `apps/cli` as a thin fixture-verification wrapper.
- Trusted-review model tests in `packages/review` against every shared review,
  review-screen `approval_digest`, and review detail-page vector from
  `nSealr/specs`, including visible JSON-style control escapes in event
  content and tags.
- Development signer verification tests in `packages/dev-signer`.
- Repository verification now requires explicit `@nsealr/*` package manifests,
  package READMEs with boundary sections, source `src/index.ts` entrypoints,
  built `dist` exports, synchronized package versions, changelog coverage, and
  npm-facing package metadata plus public provenance `publishConfig`,
  changelog coverage, and release/provenance policy; it rejects deep
  cross-package source imports and production package dependencies on private
  `@nsealr/dev-signer`.
- Client package tests cover native-messaging frame encoding/decoding,
  deterministic malformed-frame rejection, secretless local service status,
  deterministic pairing intents, browser-safe shared local-client identity
  parsing, unpaired/revoked/expired/scope-denied client rejection, latest-grant
  selection from in-memory grant history,
  deterministic pairing-review projection, strict grant-store
  serialization/revocation, strict pairing-approval artifact parsing before
  grant-store persistence, latest-client revocation appending, secretless route
  selection, signer-request validation, signer-response verification, local
  client request-id correlation, malformed service-response rejection including
  pairing digest mismatch, grant-gated signer-request dispatch through an
  explicitly injected dispatcher, deterministic `signer_route_unavailable`
  behavior when no dispatcher is configured, route-aware dispatcher registry
  selection, missing-route refusal, ambiguous-handler rejection, async dispatch
  through `handleLocalServiceRequestAsync`, deterministic refusal when async
  dispatch is accidentally used through the synchronous handler, malformed
  dispatch response rejection, and native-messaging exchange wrapping before
  any real signer transport driver exists.
- Browser-provider package tests cover NIP-07 `getPublicKey` validation,
  `signEvent` conversion into nSealr signer requests, signed-response
  verification, explicit client identity forwarding, signer refusal propagation,
  browser native-messaging local-service client adaptation, shared native host
  name use, invalid native-host-name rejection, and rejection before backend
  contact when an event template contains forbidden signer-owned fields.
  The browser-runtime import hygiene check walks packaged browser-extension
  entrypoints plus `@nsealr/browser-provider` and fails if that runtime graph
  imports Node builtins, uses `Buffer`/`process`, or imports the Node-capable
  `@nsealr/client` root instead of `@nsealr/client/browser`. Run it directly
  with `make browser-runtime-imports`. The browser-runtime bundle smoke then
  runs esbuild against the packaged background, content-script, and page-script
  entrypoints with `platform: browser` and browser-compatible IIFE output, and
  fails if bundled outputs contain Node builtin specifiers, `Buffer`, or
  `process`. Run it directly with
  `make browser-runtime-bundle`. This is a bundlability gate only; installable
  extension packaging still needs a reviewed packaged bootstrap/config
  contract. Package-build tests cover the first private developer artifact
  builder: route-config tests require digest-bound review and approval for the
  secretless selected route; package-build requires that approval before
  embedding the route config, requires a new output directory, writes manifest
  and bundled entrypoints only after successful in-memory bundling, returns a
  package digest plus per-file byte counts and SHA-256 hashes, and still
  performs no native-host installation, browser storage writes, key custody, or
  signer dispatch.
- Browser-extension app tests cover the private internal message parser for
  `get_public_key` and `sign_event`, including unsupported-method rejection,
  malformed-envelope rejection, and shared signer-request validation for event
  templates. Handler tests cover injected provider success paths, request
  rejection before provider contact, and malformed provider-output rejection
  before browser callers can trust returned pubkeys/events. Sender-boundary
  tests cover page-origin derivation from full URLs, origin/URL mismatch
  rejection, deceptive localhost rejection, extension-page-origin rejection,
  and shared local-client identity construction. Sender-aware handler tests
  prove malformed requests and malformed senders fail before provider
  selection, provider-selection failures produce deterministic errors, and the
  native-messaging provider selector binds sender-derived identity to the
  local-service dispatch path while `sign_event` remains deterministically
  unavailable until a signer route dispatcher is configured. Pairing tests prove the
  same sender-derived identity can request a digest-bound local-service pairing
  intent, deterministic pairing-review metadata, and deterministic
  browser-origin permission review metadata without creating grants, writing
  extension storage, injecting providers, or touching native host installation.
  They also prove origin permission approvals require explicit local pairing
  digest confirmation and still create no grants, storage writes, provider
  injection, or key material.
  Background-controller tests prove request handling, pairing-intent requests,
  pairing-review projection, and origin-permission review projection share the
  same injected native-messaging boundary, silent or
  cancelled native messaging can be bounded by the shared local-service
  timeout/abort handling in `@nsealr/client`, and malformed browser requests
  fail before native messaging is contacted. Runtime-message tests prove raw
  browser sender metadata is reduced
  to the internal sender shape, invalid senders return deterministic
  `invalid_sender` responses before native messaging, and abort signals are
  forwarded before native messaging. They also prove the injected runtime
  listener installer returns `true` for asynchronous response delivery, sends
  responses only through the injected responder, reports responder failures
  through an injected error callback, and removes the listener through
  `dispose()`. Pending-request tests prove the injected
  `nsealr-browser-extension-pending-request-state-v0` lifecycle emits
  secretless pending/resolved/rejected request state, cleans up active
  requests, and never exposes event templates, key material, extension storage,
  grants, or signer dispatch. Page-provider tests prove
  NIP-07 `getPublicKey` and `signEvent`
  calls become validated background requests, unsafe templates fail before the
  background boundary, malformed responses are rejected, and cancellation is
  forwarded without content-script injection. Install tests prove the frozen
  provider is attached only to an explicit target and does not overwrite an
  existing provider. Page-bridge tests prove future page/content-script
  envelopes reject malformed direction, mismatched request ids, malformed
  background responses, malformed bridge responses, invalid page-side requester
  input, and already-cancelled requests before any browser listener exists.
  Page-side requester tests also prove bridge-envelope wrapping and
  cancellation forwarding through an injected bridge exchange. Content-script
  bridge tests prove accepted page envelopes are bound to an explicit sender
  and injected background requester without adding browser listeners. They also
  prove the runtime requester forwards validated internal requests through an
  injected runtime-message sender, forwards cancellation, and rejects
  already-cancelled or in-flight-cancelled requests before trusting a runtime
  response. Content-script bootstrap tests prove the injected window listener,
  runtime-message sender, and response poster can be composed behind one
  install/dispose handle while still ignoring unrelated messages and reporting
  malformed accepted page envelopes. Content-script entrypoint tests prove the
  page-script injection helper and runtime bridge can be installed as one
  pre-packaging unit, forward accepted page requests to runtime messaging, clean
  up both resources through one dispose handle, and remove the injected script
  if bridge listener setup fails. Content-runtime API adapter tests prove
  reviewed resource paths are passed to injected `runtime.getURL`, unsafe paths
  are rejected before runtime contact, runtime messages are forwarded through
  injected `runtime.sendMessage`, and already-cancelled sends stop before the
  runtime API is called.
  Packaged-entrypoint filename tests prove the manifest and page-injection
  defaults use filenames reserved for packaged entrypoint modules,
  distinct from internal pure modules that only export helper functions.
  Packaged-entrypoint launcher tests prove the background, content-script, and
  page-script packaged source modules call the reviewed browser adapters through
  explicit packaged global scopes; they accept unambiguous `browser.runtime` or
  `chrome.runtime`, reject ambiguous runtime globals before listener/script
  installation, and continue to avoid storage, grants, signer dispatch, and key
  custody.
  Package-plan tests prove the reviewed manifest, packaged output filenames,
  and source launcher paths stay aligned before bundle generation exists. They
  reject storage permission, host-permission, background-output,
  content-script-output, and page-script web-accessible-resource drift without
  installing native-host manifests or writing extension storage. Package-plan
  CLI tests prove the private
  browser-extension script renders deterministic JSON from explicit target and
  content-script arguments, rejects incomplete or broad-match inputs, and has no
  output-path/install behavior.
  Content-script browser entrypoint tests prove explicit browser-like
  document/window/location/runtime dependencies compose into page-script
  injection, runtime messaging, response posting, and teardown without reading
  global browser objects or injecting after invalid dependency validation.
  Page-script browser provider entrypoint tests prove explicit browser-like
  window/location dependencies install NIP-07 over the page-window bridge,
  reject invalid dependencies before provider injection, and avoid global
  browser reads.
  Background browser entrypoint tests prove explicit browser-like runtime
  dependencies install runtime message handling over `runtime.onMessage`, route
  accepted requests through `runtime.sendNativeMessage`, dispose listeners, and
  reject invalid or cancelled dependencies before native messaging. Route-config
  tests prove the selected browser account config is secretless, fixed to
  `sign_event`, parsed through package-owned policy route-request validation,
  and rejected before listener installation when missing, duplicated,
  malformed, or carrying unsupported fields.
  Page-origin tests prove the browser-extension bridge accepts HTTPS page
  origins and local HTTP developer origins while rejecting non-origin URLs,
  unsupported schemes, extension URLs, and overlong values through one shared
  validator used by page-window and content-window boundaries.
  Content-window tests prove already-received page messages are source/origin
  gated, unrelated messages are ignored, and malformed nSealr envelopes fail
  before background contact without registering listeners or calling
  `postMessage`. They also prove the response-poster adapter posts only to
  reviewed `postMessage` targets and normalized page origins, and that the
  injected listener installer registers only on an explicit target, posts
  accepted responses only through an injected poster, reports malformed nSealr
  envelopes through an injected error callback,
  and removes the listener through `dispose()`. Page-window
  bridge-exchange tests prove the page side posts only to the exact reviewed
  origin, accepts only matching extension responses, ignores unrelated
  messages, and cleans up listeners on response, abort, timeout, and
  `postMessage` failure. Page-script bootstrap tests prove the explicit-target
  NIP-07 provider can be installed over either an injected bridge exchange or
  the injected page-window bridge without overwriting an existing provider or
  adding browser injection. Page-script injection tests prove the content-side
  DOM adapter rejects duplicate targets, unsafe script files, unsupported URL
  protocols, wrong URL paths, and missing parents while exposing explicit
  teardown.
  Manifest tests pin the minimal MV3 permission boundary: native messaging
  only, no host permission fields, no content scripts, no storage permission,
  and explicit Firefox extension ids. They also pin the opt-in explicit-origin
  content-script manifest profile and reject broad URL access such as
  `<all_urls>`, wildcard hosts, non-local `http`, duplicate matches, host
  permission fields, and storage.
- `make package-smoke` builds package artifacts, then runs the private
  `@nsealr/consumer-smoke` app. The smoke imports every public `@nsealr/*`
  package through its built package entrypoint plus the public
  `@nsealr/client/browser` and `@nsealr/client/client-identity` subpaths, and
  exercises a minimal no-signer consumer path. It also checks the `@nsealr/sdk`
  facade namespaces without
  importing private signing helpers. This catches broken exports that relative
  in-package tests would miss.
- `make examples-smoke` builds package artifacts, then runs private
  `@nsealr/sdk-examples`. The examples are executable documentation for public
  package usage. They import every publishable public package and cover
  request/QR handling, fixture loading, policy decisions, review rendering,
  serial framing, local companion-service calls, browser-provider refusal
  behavior, already-decrypted NIP-46 bridge decisions, `@nsealr/sdk` facade
  namespace imports, smartcard APDU round-trip, and in-memory serial-line
  transport refusal without importing `@nsealr/dev-signer`.
- `make readme-examples` builds package artifacts, then extracts
  `nsealr-readme-example` TypeScript snippets from every publishable package
  README and executes each snippet from the private SDK-example app context.
  This keeps public README examples aligned with built package entrypoints and
  prevents undocumented source/deep-import drift.
- `make api-docs` verifies that `docs/api.md` matches the exported symbols
  reachable from every public package entrypoint. `make api-docs-update`
  regenerates the file after an intentional public API change. This keeps the
  npm-facing surface visible and reviewable before publication.
- `make api-review` verifies that `docs/api-review.md` records the current
  `docs/api.md` digest and includes a review section for every publishable
  package. Intentional export changes must update both API docs and the API
  review before CI can pass.
- `make public-imports` verifies that production source for public packages
  imports other `@nsealr/*` packages only through reviewed public
  entrypoints/subpaths, keeps relative imports inside the package `src`
  boundary, and never imports private apps or the test-only signer package.
- `make pack-smoke` packs public `@nsealr/*` tarballs, verifies they contain
  only `dist`, README, and package metadata, verifies `workspace:*` dependency
  protocols were rewritten, installs the tarballs into a temporary npm consumer
  project, and imports them by package name.
- `make release-artifacts` builds package artifacts, packs every public
  package, validates the same tarball boundaries, and writes
  `release-artifacts/packages/manifest.json` for the manual package release
  rehearsal workflow. It does not publish to npm.
- Service app tests prove the private native-messaging host scaffold stays a
  thin wrapper around `@nsealr/client`, passes injected in-memory authorization
  context to the local service, loads explicit read-only secretless
  grant/account JSON files for local harnesses only when a storage approval
  covers the paths, rejects secret-bearing or malformed account-store files,
  parses explicit storage-approved secretless route-driver stores, rejects
  empty, duplicate, broad, secret-bearing, non-USB, and QR-vault driver
  mappings, dispatches matching developer serial-line requests only through an
  injected opener or explicit route-driver file, maps serial-line open,
  timeout, protocol, I/O, and close failures to deterministic transport error
  codes, returns deterministic `signer_route_unavailable` for authorized
  dispatch without a configured driver, awaits async dispatchers through the
  async native-message helpers, and returns deterministic errors for malformed
  native-message frames.
- Local service tests cover deterministic pairing intent creation, digest-bound
  pairing-review projection, manual approval into a grant, strict secretless
  JSON grant-store parsing, serialization, persistent revocation history,
  tamper rejection, expiry rejection, authorization, and revocation/expiry/scope
  failures. The high-level client tests also reject operation/result mismatches
  such as a valid service-status result returned to a pairing, validation, or
  route-selection call.
- Negative response verification tests for request id mismatch, template
  mismatch, event id mismatch, and invalid signatures.
- Transport exchange tests proving successful `sign_event` responses are
  verified against the original request before file, stdio, or serial adapters
  return them to higher layers.
- End-to-end CLI tests for `request -> dev-sign -> verify-response`.
- CLI request-generation tests for parameterless device requests:
  `get_capabilities`, `get_public_key`, and `get_signing_status`, including
  caller-supplied request ids and rejection before writing output on invalid
  request ids.
- CLI `verify-response` tests reject invalid original requests before accepting
  otherwise valid response shapes.
- End-to-end CLI tests for QR envelope `request -> dev-sign -> verify-response`.
- CLI failure-mode tests for malformed event-template JSON and unsupported
  request methods.
- CLI review-request tests for rendering review JSON, digest-bound screen-review
  pages, constrained-display detail pages, and caller-supplied detail-page
  display limits from QR signing requests.
- CLI fixture verification tests against `nSealr/specs`, covering both
  signed-event fixtures, trusted-review fixtures, review-display-frame
  fixtures, review-detail-page fixtures, QR review-transcript fixtures, NIP-46
  payload fixtures, NIP-46 policy-file fixtures, account descriptors, policy
  profiles, grant descriptors, and policy-decision vectors, plus the shared
  implementation-limit profile and invalid hardening vectors.
- CLI fixture verification rejects review detail-page style drift, including
  unknown body-line style names and continuation lines that are not styled as
  `value`.
- Transport contract tests for in-memory development signing, JSON file
  handoff, one-shot JSON-lines stdio exchange, and serial-frame exchange.
- JSON-lines stdio transport tests proving unterminated oversized stdout is
  rejected before process-close fallback errors and stderr diagnostics are
  capped before being included in exit failures. They also prove silent signer
  processes are rejected by a deterministic response timeout.
- Transport boundary tests require outbound request payloads and inbound device
  response payloads to pass standard nSealr protocol validation for
  development signer, JSON file, JSON-lines stdio, and serial-frame adapters.
  Exchange tests also reject validly shaped responses with mismatched
  `request_id` values and surface `nsealr1f:error` payloads as deterministic
  transport diagnostics.
- CLI serial-frame tests covering validated request wrapping, response-frame
  unwrapping, and optional request-bound rejection before output is written.
- Fixture verification rejects valid serial frames whose decoded request
  metadata violates the shared specs profile.
- QR envelope round-trip and rejection tests.
- QR envelope encode-side limit tests proving static v0 QR writers reject
  payloads that would exceed `max_static_qr_decoded_json_bytes` before emitting
  an envelope.
- Animated QR frame-set tests against the shared specs vector, including
  reversed input order, missing-frame rejection, and frame-checksum rejection.
- CLI tests proving `qr-animated` request and response files round-trip through
  `request sign-event`, `dev-sign`, and `verify-response`.
- Serial frame round-trip, unsupported type, checksum mismatch, and encode-side
  `max_serial_frame_bytes` rejection tests.
- Shared `nSealr/specs` QR and serial transport vector conformance tests.
- Serial-line transport tests proving a future native USB/WebSerial adapter can
  write a request frame, ignore device log lines, normalize common serial line
  endings, reject stalled writes and silent ports with deterministic timeouts,
  close stream-backed ports, and reuse the verified serial-frame response path
  through an injected line port. The package-owned one-shot exchange helper is
  also tested to validate requests before opening a port and to close an opened
  port after the exchange.
- Stream-backed serial-line port tests proving chunked readable-stream output
  and writable-stream request frames behave like the injected port contract
  without a native serial dependency. They also prove unterminated oversized
  input is rejected without rejecting batched short complete lines.
- CLI serial-line tests proving `nsealr serial-line exchange` remains a thin
  file/argument wrapper around the package-owned one-shot serial-line exchange,
  writes output only after verification, and still rejects invalid requests
  before any port is opened. They also prove device `nsealr1f:error` frames are
  surfaced as deterministic transport errors without writing output.
- Shared `nSealr/specs` capability response conformance tests.
- Shared `nSealr/specs` ESP32-S3 signing-disabled response conformance
  tests.
- Shared `nSealr/specs` smartcard APDU vector conformance tests, including
  deterministic APDU rejection status vectors.
- Smartcard signer tests covering mandatory review acknowledgement, APDU-backed
  public-key retrieval, event-id signing, Schnorr verification, and standard
  signed-event response verification.
- Smartcard signer negative tests covering shared unsafe request rejection
  before an event id is sent to a card transport and rejection of
  `trusted-display` acknowledgement plus missing or mismatched
  `approvalDigest` for display-less cards.
- CLI tests covering `review-request --screen-review` output against shared
  screen-review vectors, `review-request --detail-pages` output against shared
  detail-page vectors, and `smartcard-sim-sign --approval-digest` rejection.
- Smartcard PC/SC boundary tests covering fake reader exchange, malformed
  reader-list rejection, malformed transmit-result rejection, malformed response
  data-shape rejection, malformed response data-byte rejection, and clear
  provider/no-reader/connection setup and APDU transmit errors without requiring
  native PC/SC dependencies or hardware.
- CLI smartcard simulator tests covering rejection without
  `--review-acknowledged` and `request -> smartcard-sim-sign ->
  verify-response`.
- NIP-46 payload bridge tests covering already-decrypted `sign_event` and
  `get_public_key` messages, local `ping`, nSealr response mapping, and
  rejection of unsafe or unsupported payloads. The same tests consume shared
  `nSealr/specs` NIP-46 payload vectors.
- NIP-46 requested-permission parser tests covering method-only permissions,
  `sign_event:<kind>` selectors, empty permission strings, and rejection of
  malformed or unsupported entries.
- NIP-46 `connect` intent and review renderer tests covering remote-signer
  pubkey validation, optional secret capture, secret-presence display without
  secret-value echo, requested permissions, and rejection of signer-transport
  routing for `connect`. The shared specs fixture suite now includes a
  `connect` policy-review intent and review-page vector.
- NIP-46 permission matching tests covering derived `sign_event:<kind>`
  requirements, broad `sign_event` grants, method-only grants, denied requests,
  and `connect` exclusion from post-connect request permissions. The CLI fixture
  verifier also rejects drift in shared permission policy checks.
- NIP-46 bridge decision tests covering permitted signer routing, denied signer
  routing, local `ping`, denied `ping`, and `connect` review intent output. The
  CLI fixture verifier also rejects drift in shared bridge decision vectors.
- CLI NIP-46 decision and review tests covering `nsealr nip46 decide` against
  shared permitted, denied, and `connect` bridge-decision vectors plus
  `nsealr nip46 review-connect` against the shared `connect` review-page vector
  without opening relay or signer transports.
- CLI NIP-46 policy-file tests covering read-only
  `nsealr-nip46-policy-v0` permission input and rejection of ambiguous
  `--permissions` plus `--policy-file` usage. The positive case consumes the
  shared `nSealr/specs` policy-file vector instead of an inline local copy.
  The CLI fixture verifier also rejects drift in shared policy-file vectors.
- CLI local-service pairing review tests covering
  `nsealr local review-pairing`, including deterministic review metadata for a
  pairing intent and rejection of tampered pairing intents before output files
  are written.
- CLI local-service pairing approval tests covering
  `nsealr local approve-pairing`, including explicit reviewed-digest
  confirmation, expiry handling, and refusal to write approval artifacts when
  the digest does not match.
- CLI local storage-review and approval tests covering
  `nsealr local review-storage` and `nsealr local approve-storage`, including
  digest-bound metadata for explicit grant/account/route-driver locations, no
  creation of reviewed storage files, digest-confirmed approval artifacts, and
  refusal to write review or approval metadata for ambiguous paths or mismatched
  digests.
- CLI local grant-store artifact tests covering
  `nsealr local grant-store append-approval`, including new-store creation,
  explicit input-store extension without input-file mutation, required
  storage-approval coverage for grant-store input/output paths, existing-output
  refusal, and malformed approval rejection before output files are written.
- CLI local grant-store revocation tests covering
  `nsealr local grant-store revoke-client`, including output-only revocation
  appending behind storage-approval coverage, input-file immutability,
  deterministic authorization denial after revocation, and no-match rejection
  before output files are written.
- Policy package tests cover secretless account descriptors, manual-only QR
  vault policy, scoped grants for persistent routes, wildcard/decrypt/export
  rejection, rejection of stateless QR-vault grant targets, and deterministic
  policy-decision transcripts for allowed, expired, revoked, decrypt,
  export-secret, and unknown-method requests.
- Pre-signing hardening tests must reject every shared invalid vector that
  reaches companion-owned parsing: unsafe event-template fields, unsafe integer
  values, resource-limit violations, malformed or ambiguous responses,
  malformed response request ids, contradictory or reason-less signing-status
  readiness, malformed QR/serial envelopes, malformed NIP-46 payloads, invalid
  policy files, duplicate signing-status gate entries, and signed-event
  response integer-safety, content, or tag violations.
- Nostr conformance oracle tests must compare companion event id/signature
  behavior with `nostr-tools` in tests, while keeping production code free of
  unnecessary oracle coupling.

## Next Test Additions

- Third-party consumer import tests for future `@nsealr/*` publication:
  no test-only signer leakage and no production secret storage in public
  helpers.
- Package release workflow tests should eventually add trusted-publishing dry
  run or npm provenance verification once npm organization settings exist.
- Local companion service tests with a fake extension/app client: user approval
  UX, production storage writes, production signer dispatch, and additional
  built-package consumer tests after explicit policy gates exist. The current
  test suite already covers pairing intent generation,
  deterministic pairing-review projection, digest-bound storage-location
  review and approval artifacts, strict grant-store serialization/revocation,
  explicit storage-approved read-only context loading, selected account route,
  malformed
  native-message rejection, shared Chromium/Firefox native-host manifest
  building, digest-bound dry-run install-plan building, install-approval
  artifact generation in `@nsealr/client`, multi-message native-host stdio
  behavior, and the private service CLI wrapper that renders those
  manifests/plans/approvals without installing them. Current service
  route-driver tests cover the developer serial-line
  dispatch boundary through fake ports only; hardware serial smoke remains a
  later gate before production driver acceptance.
- Browser extension provider tests over a fake companion for origin permission,
  revocation, cancel, malformed companion response, native-host disconnects,
  and no key material in extension storage. Current package tests cover the
  local-service backend adapter for authorized selected-account public-key
  lookup, `signEvent` routing through local-service dispatch, explicit
  dispatcher success, and deterministic signer-unavailable responses before a
  real signer transport driver exists. Local-service client tests now own the
  timeout/abort contract directly, including already-cancelled requests,
  in-flight cancellation, and `AbortSignal` forwarding into injected exchanges.
- Package consumer smoke currently runs against built JS/declaration artifacts,
  packed tarballs, and executable examples importing every publishable public
  package. README snippets for every publishable package are now executed from
  CI, and the public API review is digest-bound to `docs/api.md`. The remaining
  npm-facing gate is trusted-publishing/provenance activation.
- Full NIP-46 relay-session tests with local relay fixtures after NIP-44
  session lifecycle and reviewed `connect` acknowledgement are specified.
- Large QR payload strategy tests once chunking or compression is designed.
- Hardware serial smoke tests before adding WebUSB, HID, CDC, or persistent
  session adapters.

## Rule

Production behavior changes require test-driven development.

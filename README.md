# nSealr Companion

Host-side software for nSealr signers.

The companion is not trusted with private keys. It constructs requests, moves
them over the selected transport, verifies device responses, and bridges Nostr
clients to hardware-backed signing.

The product goal is a universal secretless CLI/app for all nSealr routes:
account labels, route selection, request construction, QR/USB/smartcard/
external transport helpers, policy proposal transport, signed-output
verification, and audit export. The companion is not the authoritative policy
store for persistent nSealr devices and must not store production signing
material.

Browser extension, npm SDK, CLI, local app, local service, and full NIP-46
relay work are access surfaces over the same companion platform. They must
reuse package-owned validation, policy scaffolding, transport, and response
verification logic instead of creating separate signer implementations.
The repository is intentionally a single TypeScript monorepo: one developer can
ship multiple artifacts without synchronizing separate SDK, extension, service,
or CLI repositories.

Feature availability per signer family is tracked in `nSealr/specs` at
`vectors/features/signer-feature-matrix-v0.json`. Companion packages should
consume those shared contracts instead of inventing solution-specific behavior:
when a feature is present on multiple signer implementations, the request,
review, approval, policy, transport, or response-verification behavior must
match the shared `contract_id`.

## Current Capabilities

- `nsealr fixture verify` validates shared signing, trusted-review,
  review-display-frame, review-detail-page, QR review-transcript, NIP-46
  payload, NIP-46 policy-file, NIP-46 connection URI, NIP-46 relay-event,
  NIP-46 relay-step, NIP-46 session lifecycle, account descriptor, policy profile, grant
  descriptor, policy-change review, policy-decision, source public-key proof,
  and feature-matrix fixtures from
  `nSealr/specs`, including NIP-46 permission policy checks, bridge
  decisions, implementation limits, feature conformance contracts, and invalid
  hardening vectors.
- `nsealr policy review-change` renders deterministic review pages and an
  approval digest for a secretless `set_policy` proposal. It does not approve
  the change, persist policy, create grants, or dispatch signer I/O.
- `nsealr request` creates signing requests from event templates and
  parameterless device requests for `get_capabilities`, `get_public_key`, and
  `get_signing_status`, with caller-supplied `--request-id` support for
  hardware traces.
- `nsealr dev-sign` signs requests with an explicit test-only software key.
- Each reusable `packages/*` module now has an explicit `@nsealr/*` package
  manifest, source `src/index.ts` entrypoint, and built `dist` export.
  Internal imports use those package entrypoints instead of deep relative paths
  so SDK, extension, service, and CLI code share the same boundaries.
- `@nsealr/sdk-examples` is a private executable examples app that imports
  public packages through their built entrypoints and exercises request/QR,
  local-service, browser-provider, the `@nsealr/sdk/browser` facade, and
  already-decrypted NIP-46 flows without importing test-only signing helpers.
- Public package production-source imports are checked in CI so `@nsealr/*`
  imports stay on reviewed public entrypoints/subpaths and cannot drift into
  private apps or test-only signer packages.
- `@nsealr/client` defines the first local companion service protocol and
  native-messaging frame codec plus the high-level local-service client used by
  future browser, SDK, desktop, and CLI callers. The implemented operations are
  intentionally secretless: service status, pairing intent generation,
  deterministic pairing-review projection, digest-bound manual approval into a
  grant, a strict secretless JSON grant-store contract for local
  approvals/revocations, digest-bound storage-location review and approval
  artifacts, secretless route selection, signer-request validation,
  signer-response verification, and a signer-dispatch boundary that is
  unavailable unless a host explicitly injects a dispatcher. Route selection,
  validation, dispatch, and verification require an explicit client grant;
  unpaired, revoked, expired, or operation-scoped clients are rejected before
  signer payload handling. The service request parser rejects unsupported
  top-level request fields and unsupported per-operation `params` fields before
  those operations run. Dispatch validates the request, selects the route,
  calls only the injected route dispatcher, and verifies the signer response
  before returning it. The
  high-level client also binds each operation to its expected result type, so a
  native-messaging host cannot satisfy
  `request_pairing` with an unrelated valid service result.
- `@nsealr/sdk/browser` is the browser-safe public SDK subpath for extension
  and web callers. It exposes `@nsealr/browser-provider`,
  `@nsealr/client/browser`, and pure core/policy/protocol/QR/review helpers
  while leaving the broader SDK root, fixtures, transport adapters, and
  test-only signing out of browser runtime imports.
- `nsealr local review-pairing` renders deterministic local-service pairing
  review metadata from a pairing intent. It validates the digest-bound intent
  and does not approve clients or write grant stores.
- `nsealr local approve-pairing` creates a pairing approval artifact only when
  the caller supplies the reviewed pairing digest. It writes an approval JSON
  object, not a grant store, and does not contact signer transports.
- `nsealr local review-storage` renders digest-bound storage-location review
  metadata for explicit grant/account/route-driver paths. It does not choose
  default paths, accept duplicated path options, write storage files, approve
  clients, or contact signers. Executable validation failures are printed as
  single-line CLI errors, not stack traces.
- `nsealr local approve-storage` creates a storage-location approval artifact
  only when the caller supplies the reviewed storage digest. It still does not
  create, move, or activate storage files.
- `nsealr local grant-store append-approval` writes a new explicit secretless
  grant-store artifact from a pairing approval only when a storage approval
  covers the requested read-only input path, if any, and new output path. It may
  extend a caller-supplied input store, but it never chooses a default path,
  overwrites an existing output file, or mutates the input file.
- `nsealr local grant-store revoke-client` writes a new explicit grant-store
  artifact with a latest-client revocation appended only when a storage
  approval covers the requested read-only input path and new output path. It
  keeps grant history intact, never overwrites an existing output file, and
  never mutates the input file.
- `@nsealr/browser-provider` defines the first NIP-07 provider adapter over an
  injected companion backend and explicit client identity. It validates
  `getPublicKey` and `signEvent` boundaries, converts event templates into
  nSealr signer requests, can use local-service route selection for the
  selected account public key, routes `signEvent` through local-service
  dispatch, includes a browser native-messaging client adapter over explicit
  `sendNativeMessage`, reuses the shared local-service timeout/cancellation
  bounds from `@nsealr/client`, verifies signed responses, and stores no
  browser-side production keys.
- `@nsealr/browser-extension` is a private app scaffold for extension-owned
  message parsing and provider-backed request handling. It currently accepts
  only internal `get_public_key` and `sign_event` requests, validates provider
  outputs, derives local client identity from a sanitized sender page-origin
  context before provider selection, can compose that context with the
  native-messaging local-service provider path, can request a digest-bound
  pairing intent, deterministic pairing-review metadata, and deterministic
  browser-origin permission review and approval metadata for that identity,
  with approval bound to the reviewed local pairing digest, can normalize those
  already-approved origin artifacts into a deterministic secretless store
  contract for exact origin/extension/pairing-digest/method lookup without
  writing browser storage, creating grants, or dispatching signers, can render a
  pure origin-permission review card for future popup approval UX without
  performing storage, grant, provider-injection, or signer-dispatch side
  effects, can maintain the approved-origin store through deterministic
  upsert/revoke helpers, includes a browser-storage adapter over an explicit
  injected storage area for that secretless origin-permission store without
  reading global browser APIs or changing packaged manifest permissions,
  exposes
  private stdout-only origin-permission artifact commands for approval,
  empty-store creation, upsert, and revoke, can enforce
  either a static approved-origin store or an async injected store loader before
  provider selection so denied methods fail before native messaging, passes
  that gate through both the browser-like background adapter and packaged
  background entrypoint over explicit injected dependencies, includes a pure
  popup active-tab origin selector for future
  approval UI without storage, grants, manifest permission changes, or key
  material, routes extension-internal popup control messages for origin
  permission review and digest-confirmed approval through the background
  controller, with approval writing only through an explicitly injected storage
  adapter and still creating no grants, provider injection, signer dispatch, or
  key material,
  includes a pure active-tab origin permission review orchestrator that binds
  selected-tab origin, extension id, and app name to the returned review before
  any rendering or approval,
  includes a pure popup origin-permission view composer that renders that
  active-tab review through the existing approval card and refresh control and
  delegates storage-backed approval to injected controls without direct browser
  storage APIs, grants, provider injection, signer dispatch, or key material,
  includes a pure
  background-controller boundary over injected native messaging with optional
  response timeouts and request-scoped cancellation,
  includes a pure runtime-message adapter that maps raw browser sender metadata
  into the internal sender shape before the background controller is called,
  includes an injected runtime `onMessage` listener installer with explicit
  teardown and asynchronous `sendResponse` handling,
  includes a pure page-provider boundary that maps NIP-07 `getPublicKey` and
  `signEvent` calls to validated background requests and installs it only on an
  explicit target without overwriting an existing provider, includes a pure
  page-bridge envelope plus page-side requester adapter for future
  page/content-script messaging, includes a pure content-script bridge handler
  that binds page envelopes to an injected sender-aware background requester,
  includes a content-script runtime requester over an injected runtime-message
  sender with request cancellation, includes a content-script runtime bridge
  bootstrap that composes the window listener with that runtime requester,
  includes a pure content-window event adapter that checks page source/origin
  before that bridge handler is reached, includes an injected content-window
  message-listener installer with explicit teardown and injected response
  posting plus a response-poster adapter that posts only to reviewed
  `postMessage` targets and normalized page origins, includes a page-window
  bridge exchange that posts page requests and
  accepts only matching extension responses through an injected window-like
  target,
  has pure page-script provider bootstraps over either an injected bridge
  exchange or the injected page-window bridge,
  includes a pure page-script injection helper over explicit document and
  extension-URL resolver dependencies,
  includes a pure content-script entrypoint composer that joins page-script
  injection with the runtime bridge and cleans up partial installs,
  includes a content-script browser entrypoint adapter over explicit
  document/window/location/runtime dependencies,
  includes a page-script browser provider entrypoint adapter over explicit
  window/location dependencies,
  includes a background browser entrypoint adapter over explicit
  `runtime.onMessage` and `runtime.sendNativeMessage` dependencies,
  includes content-runtime API adapters that wrap reviewed `runtime.getURL`
  and `runtime.sendMessage` dependencies,
  uses one shared page-origin validator across page-window and content-window
  boundaries,
  can emit secretless pending/resolved/rejected/cancelled request-state
  snapshots for future UI without exposing event templates or key material,
  keeps the active pending-request set explicitly bounded,
  and can abort in-flight native messaging when that pending request is
  cancelled through extension-internal list/cancel control messages,
  includes a packaged action popup HTML plus popup entrypoint over injected
  `runtime.sendMessage` so visible UI can list/cancel those secretless pending
  requests while showing request id, selected route account/type, timestamps,
  and explicit no-key/no-event payload state,
  and can build either the default minimal no-host-permission manifest or an
  opt-in explicit-origin content-script manifest profile. The content-script
  profile still omits host-permission fields, broad URL matches, extension
  storage, and provider grants by default. It can also build an explicit
  storage-backed origin-approval profile: that opt-in profile requests
  `activeTab` and `storage`, resolves the active tab only after the user opens
  the action popup, loads the approved-origin store from the reviewed storage
  adapter, and writes approvals only through the same digest-confirmed
  background control path. It can build an explicit developer package artifact
  only after route-config review/approval. Embedded-store content-script builds
  still require a reviewed origin-permission store as secretless background
  gate data; storage-backed builds start from browser extension storage instead
  of embedding approvals. The build result exposes the selected route,
  manifest permissions, content-script origin, extension id, local pairing
  digest, popup mode, activeTab usage, and origin-permission mode it packaged,
  while still not installing a browser extension, writing extension storage at
  build time, creating grants, dispatching signers, or holding key material.
- `@nsealr/client` exposes the shared local-client identity parser, including
  the browser-safe `@nsealr/client/client-identity` subpath, used before
  pairing, route selection, signer-request validation, and response
  verification.
- `@nsealr/sdk` is the platform-neutral npm facade over curated browser,
  companion, protocol, policy, QR, review, and smartcard namespaces. It
  deliberately excludes private test signing, Node-only fixture loading, and
  host transport adapters.
- `@nsealr/service` is the private native-messaging host scaffold over
  `@nsealr/client`. It can process multiple length-prefixed service messages
  on one stdio session, returns deterministic native-frame errors, and accepts
  explicit in-memory authorization context in tests. It can also load explicit
  storage-approved read-only secretless grant/account and route-driver JSON
  files for developer and integration harnesses, and print validated
  Chromium/Firefox native-host manifest JSON for installer work. It can also
  print a digest-bound dry-run native-host install plan, digest-confirmed
  install approval JSON, and an explicit approval-bound install execution
  result that writes only the reviewed native-host manifest with `write_new`
  semantics. Native-host manifest/install CLI singleton options reject
  duplicates before artifacts are rendered. Route-driver serial-line timing
  controls are bounded before
  dispatch, so driver files cannot configure unbounded response waits or
  ignored-log loops. It does not open relays, store keys, write grant/account
  files, install native-host manifests without that explicit approval
  execution, or contact signer transports by default.
- `nsealr review-request` renders deterministic review JSON, digest-bound
  screen-review pages, or complete constrained-display detail pages from a
  signing request for untrusted host-side previews and test harnesses.
- `nsealr smartcard-sim-sign` exercises the smartcard APDU signing boundary with
  a test-only simulator from the private `@nsealr/dev-signer` package and
  requires `--review-acknowledged` before sending the event id to the
  display-less signer.
- `packages/smartcard` includes fake-reader PC/SC boundary tests that normalize
  malformed reader-list, setup, and APDU transmit failures without claiming
  real-card support.
- `nsealr verify-response` checks request ids, event template integrity, NIP-01
  event ids, and BIP-340 Schnorr signatures.
- Transport exchanges now apply the same successful `sign_event` verification
  before returning a signed event response, so serial/file/stdio adapters cannot
  hand invalid signatures to higher layers as accepted output.
- Local-service dispatch additionally checks successful `get_public_key` and
  `sign_event` responses against the selected route public key before returning
  them, so a configured dispatcher cannot silently answer for a different
  account.
- CLI request, dev-sign, and verify-response commands can read/write JSON or
  v0 `nsealr1:` QR envelopes.
- `packages/transport` provides the first signer transport contract plus file,
  JSON-lines stdio, and serial-frame adapters. The test-only development
  signer transport lives in private `@nsealr/dev-signer`, so production
  transport code does not depend on software signing helpers. The stdio
  adapter bounds response-line output and captured stderr before accepting or
  reporting external signer process results, and times out silent processes
  that do not emit a response.
- The serial-line transport boundary can drive an injected newline-oriented
  port, normalize common serial line endings, ignore device log lines, and
  reuse the same serial-frame validation before a native USB/WebSerial binding
  exists.
- `SerialLineStreamPort` adapts Node readable/writable streams into that
  newline-oriented port interface for dependency-free serial integration tests,
  while enforcing the shared v0 serial-frame byte limit on buffered lines.
- `exchangeSerialLineRequest` owns one-shot serial-line validation/open/close
  sequencing inside `packages/transport`, so CLI and future native bindings do
  not duplicate the safety boundary.
- `nsealr serial-frame` exposes offline serial-frame request wrapping and
  response unwrapping helpers for ESP32 bring-up and lab captures. Response
  unwrapping can verify the original request before writing output, so
  captured frames cannot silently drift across request ids.
- `nsealr serial-line exchange` is the CLI wrapper for that package-owned
  one-shot exchange. It opens a newline serial device path only after request
  validation, verifies the response before writing output, skips firmware log
  lines, and closes the stream-backed port after the exchange. It is a local
  USB-serial bring-up helper, not a browser/WebUSB or persistent signer
  session.
- `nsealr nip46 decide` writes the bridge decision for an already-decrypted
  NIP-46 payload using explicit permission inputs or a read-only policy file.
  Approved `sign_event` inputs must be kind-scoped, for example
  `sign_event:1`; broad `sign_event` is requested-permission metadata only.
  It does not open relays, decrypt NIP-44 payloads, persist grants, or contact
  signer transports.
- `nsealr nip46 review-connect` writes deterministic review pages for an
  already-decrypted NIP-46 `connect` request. It shows the remote signer
  pubkey, whether a secret was provided, and requested permissions without
  echoing the secret value or approving the client.
- `nsealr nip46 approve-connect` writes a digest-bound local approval artifact
  only after the reviewed connect digest is supplied back to the CLI. The
  artifact records no `ack`, grant, relay session, signer dispatch, or secret.
- `nsealr nip46 parse-connection-uri` reads a `bunker://` or
  `nostrconnect://` token from a local file and writes descriptor-only metadata
  without echoing the shared secret value. It does not open relays, acknowledge
  `connect`, persist grants, or contact signer transports.
- `packages/qr` implements the v0 `nsealr1:` QR envelope from
  `nSealr/specs`, including malformed/padded/invalid-UTF-8/oversized
  rejection. Encoding applies the same static decoded-JSON byte limit as
  decoding, so the companion does not emit QR payloads that v0 receivers would
  immediately reject. It also implements the v0 `nsealr1a:` animated QR frame
  set for larger valid payloads, with digest, frame checksum, ordering, and
  frame-count checks before JSON parsing.
- `packages/framing` implements the first checksum-protected serial line frame
  draft for USB CDC and UART experiments, including shared frame-size limits on
  both decode and encode. The package is browser-runtime clean for future
  WebSerial/WebUSB work, but it is not part of `@nsealr/sdk/browser` until that
  access surface is reviewed.
- `packages/protocol` validates request/response shape, centralizes the
  companion copy of the shared v0 implementation limits, and validates
  capability discovery and signing-status responses, including rejection of
  contradictory `signing_enabled: true` diagnostics that still report missing
  gates, disabled diagnostics that omit missing-gate reasons, and duplicated
  gate entries. Response request ids must use the same v0 profile as requests.
  Successful signed-event responses are also checked for shared integer-safety,
  content, and tag resource limits before they can be accepted.
- `packages/review` mirrors the shared trusted-review vector semantics for
  companion previews. It is not a trusted approval surface.
- Serial transport tests cover both capability discovery and explicit
  signing-disabled scaffold responses.
- `packages/fixtures` loads shared event, trusted-review, review-display-frame,
  review-detail-page, QR review-transcript, NIP-46 payload, NIP-46 policy-file,
  NIP-46 connection URI, NIP-46 relay-event, NIP-46 relay-step, NIP-46 session lifecycle,
  account-descriptor, policy-profile,
  grant-descriptor, policy-change review, policy-decision, route-selection,
  source-public-key-proof, access-surface,
  feature-matrix, and smartcard vectors from `nSealr/specs` for companion,
  Raspberry QR vault, ESP32 firmware, and smartcard conformance tests.
- `packages/policy` parses secretless account descriptors, policy profiles, and
  grant descriptors, selects secretless account-route metadata, renders
  digest-bound policy-change review pages, then evaluates policy-decision
  transcript vectors without a persistent grant store. It
  rejects unsupported descriptor fields, embedded private-key material,
  QR-vault automation, external NIP-46 nSealr-managed automation,
  wildcard/decrypt/export grants, and grant targets outside ESP32 USB/NIP-46
  and custom hardware-wallet persistent policy routes before CLI or
  fixture-verification code can treat those records as valid. The v0
  nSealr-managed grant menu is deliberately limited to `sign_event` kind `1`;
  additional automated methods or event kinds must arrive through specs
  vectors and parser updates before access surfaces can expose them. NIP-06 account
  descriptors must carry a reviewed source fingerprint
  matching the QR vault import-review contract.
  These records describe resulting signing public keys and routes. Mnemonics,
  BIP-39 passphrase namespaces, standalone `nsec` keys, device slots, card
  slots, and external signers are key sources or routes, not production secrets
  kept by companion. Policy records are internal nSealr records, not Nostr
  events. Persistent-device account descriptors default to manual-only policy;
  scoped-automation vectors are conformance fixtures that require a
  device-reviewed policy-change proposal before they can become active policy.
- `packages/smartcard` implements the first APDU codec, provider-based PC/SC
  APDU transport boundary, and `SmartcardSigner` boundary against shared
  smartcard vectors, including APDU rejection status words. The codec rejects
  non-integer byte/status-word fields, non-`Uint8Array` payloads, and oversized
  short-APDU payloads before simulator or PC/SC transport. The test-only APDU
  simulator lives in private `@nsealr/dev-signer`, not in the publishable
  smartcard package. The PC/SC boundary validates transmit-result shape,
  response status bytes, response data shape, and response data bytes before
  constructing response APDUs, and rejects malformed reader-provider
  output before reader connection.
- `packages/nip46` implements the first decrypted NIP-46 payload bridge for
  `get_public_key`, `sign_event`, local `ping`, and nSealr response mapping.
  It also parses `connect` requests into policy-review intents, deterministic
  review pages, and digest-bound local approval artifacts, validates requested
  permission strings, and owns the read-only policy-file parser used by the
  CLI. It can also parse official `bunker://`
  and `nostrconnect://` connection tokens into descriptor-only metadata for
  later UX, validating relays, requested permissions, and client metadata while
  retaining only secret presence. It now parses NIP-46 `kind:24133` relay event
  envelopes into sender/recipient/content metadata without decrypting NIP-44
  content, opening relays, or dispatching to signers. It also evaluates
  metadata-only relay request steps and response steps after plaintext is
  supplied by a future decryption layer, returning bridge decisions or
  response-shape metadata, including auth challenge URL metadata without
  credentials or fragments, without relay I/O, grant creation, signer dispatch,
  URL opening, signature verification, or session persistence. Shared specs
  vectors now
  pin the derived permission requirements, positive/negative permission checks,
  bridge decisions, `connect` review pages, and invalid payload rejection for
  signer routing, local response routing, `connect` review, and
  permission-denied responses. Relay transport, NIP-44 encryption, `connect`
  acknowledgement, persistent permission grants, and auth-flow UI remain future
  work.

## Planned Capabilities

- Complete the package-boundary freeze for future `@nsealr/*` npm SDK
  publication with package README files, third-party import tests, semver,
  provenance, and release automation. Built JS/declaration artifacts,
  manifests, explicit entrypoints, deep-import audit, and test-only signer
  isolation are already in place.
- Expand the local companion service boundary with pairing, origin/app
  identity, deterministic request cancellation/timeout bounds, deterministic
  errors, and real signer transport drivers behind the reviewed dispatch
  boundary.
  The pure package-level route selector, the local-service route-selection
  operation, the first SDK wrapper, a deterministic pairing-review projection,
  CLI pairing-review and digest-confirmed approval-artifact commands, a strict
  persistent grant-store contract, a multi-message native-messaging host loop,
  validated native-host manifest generation, explicit storage-approved
  read-only service context loading, digest-bound native-host install
  approval artifacts, explicit approval-bound native-host manifest writing,
  and grant-gated `dispatch_signer_request` operation are in place.
  Full approval UI, default production storage activation, production signer
  transport drivers, and localhost APIs need separate threat-model and
  implementation passes.
- Browser extension / NIP-07 bridge packaging around the provider adapter so
  `getPublicKey` and `signEvent` route through companion without storing
  production signing material. The package-level provider can already read the
  selected public key through local-service route selection and route
  `signEvent` through local-service dispatch, returning deterministic
  signer-unavailable errors until a real dispatcher is configured. The
  private extension scaffold now also has the sender/page-origin identity
  boundary and injected origin-permission storage adapter needed before
  content-script injection is considered. The packaged manifest still requests
  no storage permission by default; storage-backed popup approval is an
  explicit browser package profile. Browser package route configuration must
  name an explicit browser-dispatchable connected route type
  (`esp32_usb_nip46`, `custom_hardware_wallet`, or future `external_nip46`);
  stateless QR vaults, display-less smartcards, and account-only route
  configs are rejected for this access surface.
- Public npm SDK alpha after package APIs, docs, semver, provenance, and
  third-party import tests are stable. Package README coverage and a
  built-artifact consumer smoke are now part of `make ci`; packed-tarball
  installation smoke is also part of `make ci`; synchronized package version,
  changelog, executable SDK examples, executable README snippets, and
  release/provenance policy are documented. The public API review is bound to
  the generated API-surface digest. SDK browser-provider examples consume the
  shared access-surface vector instead of carrying an ad hoc browser/local
  service contract. A digest-bound package release plan now lists exactly which
  public packages may be rehearsed, confirms trusted-publishing/provenance
  requirements, and keeps local npm publish disabled. A manual package release
  rehearsal workflow prepares checked tarball artifacts whose manifest carries
  the release-plan digest, byte counts, and SHA-256 digests without publishing
  to npm.
- Full NIP-46 / Nostr Connect relay session handling with NIP-44 encryption,
  permissions, auth challenge UI, and relay I/O.
- WebUSB, HID, CDC, WebSerial, and persistent transport experiments.
- Real PC/SC reader smoke tests and NFC smartcard adapter work.
- TROPIC01 USB DevKit research adapter for the custom persistent-secret
  hardware-wallet family.
- Relay publish and response verification tools.

## Initial Layout

- `apps/`: CLI, local service/native-messaging host, browser extension,
  desktop shell, and developer tools.
- `packages/`: reusable `@nsealr/*` SDK/core/protocol/review/qr/framing/
  transport/NIP-46/policy/client/provider modules.
- `docs/`: implementation notes and usage guides.

## Quality Baseline

Run the repository verification loop with:

```sh
make ci
```

The Makefile pins `pnpm@10.33.4`; it uses a global `pnpm` when available and
falls back to `npm exec` when only Node/npm is installed.

Run the CLI from the workspace with:

```sh
pnpm nsealr --help
pnpm nsealr fixture verify --specs ../specs
pnpm nsealr request get-signing-status --request-id req-status-1 --out status-request.json
pnpm nsealr request sign-event --event-template template.json --out request.qr --output-format qr
pnpm nsealr review-request --request request.qr --request-format qr --out review.json
pnpm nsealr review-request --request request.qr --request-format qr --detail-pages --max-compact-line-chars 48 --out review-detail-pages.json
pnpm nsealr policy review-change --proposal policy-change-proposal.json --out policy-change-review.json
pnpm nsealr local review-pairing --intent pairing-intent.json --out pairing-review.json
pnpm nsealr local approve-pairing --intent pairing-intent.json --reviewed-pairing-digest <digest-hex> --approved-at 1900000000 --out pairing-approval.json
pnpm nsealr local review-storage --grant-store "$PWD/local-grants.json" --grant-store-output "$PWD/local-grants-next.json" --out storage-review.json
pnpm nsealr local approve-storage --review storage-review.json --reviewed-storage-digest <digest-hex> --approved-at 1900000000 --out storage-approval.json
pnpm nsealr local grant-store append-approval --approval pairing-approval.json --grant-store "$PWD/local-grants.json" --storage-approval storage-approval.json --updated-at 1900000001 --out "$PWD/local-grants-next.json"
pnpm nsealr local review-storage --grant-store "$PWD/local-grants-next.json" --grant-store-output "$PWD/local-grants-revoked.json" --out storage-revoke-review.json
pnpm nsealr local approve-storage --review storage-revoke-review.json --reviewed-storage-digest <digest-hex> --approved-at 1900000010 --out storage-revoke-approval.json
pnpm nsealr local grant-store revoke-client --grant-store "$PWD/local-grants-next.json" --storage-approval storage-revoke-approval.json --client-id <client-id-hex> --origin extension:nsealr --surface browser_extension --revoked-at 1900000020 --out "$PWD/local-grants-revoked.json"
pnpm nsealr nip46 decide --message nip46-message.json --permissions sign_event:1 --out decision.json
pnpm nsealr nip46 decide --message nip46-message.json --policy-file policy.json --out decision.json
pnpm nsealr nip46 review-connect --message nip46-connect.json --out connect-review.json
pnpm nsealr nip46 approve-connect --review connect-review.json --reviewed-connect-digest <connect-digest-hex> --approved-at 1900000001 --out connect-approval.json
pnpm nsealr smartcard-sim-sign --secret-key <test-only-hex> --request request.qr --request-format qr --review-acknowledged --approval-digest <approval-digest-hex> --out response.qr --output-format qr
```

## License

Companion software and tooling are released under the MIT License unless a file
says otherwise. Documentation content is intended to be reusable under the
nSealr documentation policy.

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
  Account-descriptor, policy-profile, grant-descriptor, and policy-decision
  loading is also directory-driven through `packages/policy`.
  QR review-transcript fixture validation also lives in this package and covers
  `scroll` buttons plus rendered-frame `body_line_styles` mismatch rejection,
  keeping `apps/cli` as a thin fixture-verification wrapper.
- Trusted-review model tests in `packages/review` against every shared review,
  review-screen `approval_digest`, and review detail-page vector from
  `nSealr/specs`, including visible JSON-style control escapes in event
  content and tags.
- Development signer verification tests in `packages/dev-signer`.
- Repository verification now requires explicit `@nsealr/*` package manifests
  and `src/index.ts` entrypoints, rejects deep cross-package source imports,
  and rejects production package dependencies on private `@nsealr/dev-signer`.
- Client package tests cover native-messaging frame encoding/decoding,
  deterministic malformed-frame rejection, secretless local service status,
  deterministic pairing intents, unpaired/revoked/expired/scope-denied client
  rejection, signer-request validation, signer-response verification, local
  client request-id correlation, malformed service-response rejection, and
  native-messaging exchange wrapping before any signer I/O exists.
- Browser-provider package tests cover NIP-07 `getPublicKey` validation,
  `signEvent` conversion into nSealr signer requests, signed-response
  verification, explicit client identity forwarding, signer refusal propagation,
  and rejection before backend contact when an event template contains forbidden
  signer-owned fields.
- Service app tests prove the private native-messaging host scaffold stays a
  thin wrapper around `@nsealr/client`.
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
  package README examples, built JS/declaration artifacts, no test-only signer
  leakage, and no production secret storage in public helpers.
- Local companion service tests with a fake extension/app client: pairing,
  selected account route, user approval UX, persistent grant storage,
  cancellation, persistent revocation, deterministic transport errors, signer
  dispatch, and built-package consumer tests after explicit policy gates exist.
- Browser extension provider tests over a fake companion for origin permission,
  revocation, cancel, malformed companion response, native-host disconnects,
  and no key material in extension storage.
- Full NIP-46 relay-session tests with local relay fixtures after NIP-44
  session lifecycle and reviewed `connect` acknowledgement are specified.
- Large QR payload strategy tests once chunking or compression is designed.
- Hardware serial smoke tests before adding WebUSB, HID, CDC, or persistent
  session adapters.

## Rule

Production behavior changes require test-driven development.

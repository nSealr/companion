# Public API Surface

This file is generated from the public package entrypoints by
`scripts/check_api_docs.mjs`. It documents the pre-release package surface
that consumers may import after the package gates pass.

Regenerate and verify it with:

```sh
make api-docs-update
make api-docs
```

The packages are still pre-release. Breaking changes are allowed before the
first public npm publication, but every exported symbol must remain visible
here so API drift is reviewed deliberately.

## @nsealr/browser-provider

NIP-07 browser provider adapter for routing Nostr signing requests through nSealr companion.

Source entrypoint: `packages/browser-provider/src/index.ts`

Exports:
- `BrowserProviderBackend`
- `BrowserProviderOptions`
- `LocalServiceBrowserProviderBackendOptions`
- `Nip07Provider`
- `createLocalServiceBrowserProviderBackend`
- `createNip07Provider`

## @nsealr/client

Secretless local companion service and native-messaging client boundary for nSealr integrations.

Source entrypoint: `packages/client/src/index.ts`

Exports:
- `LOCAL_CLIENT_SURFACES`
- `LOCAL_GRANT_STORE_FORMAT`
- `LOCAL_PAIRING_REVIEW_FORMAT`
- `LOCAL_SERVICE_NAME`
- `LOCAL_SERVICE_OPERATIONS`
- `LOCAL_SERVICE_PROTOCOL`
- `LocalClientGrant`
- `LocalClientIdentity`
- `LocalClientSurface`
- `LocalGrantRevocationOptions`
- `LocalGrantStore`
- `LocalGrantStoreOptions`
- `LocalPairingApproval`
- `LocalPairingReview`
- `LocalPairingReviewOperation`
- `LocalServiceClient`
- `LocalServiceClientOptions`
- `LocalServiceContext`
- `LocalServiceExchange`
- `LocalServiceOperation`
- `LocalServiceRequest`
- `LocalServiceResponse`
- `MAX_LOCAL_GRANT_STORE_GRANTS`
- `MAX_LOCAL_GRANT_STORE_JSON_BYTES`
- `MAX_NATIVE_MESSAGE_BYTES`
- `MAX_SERVICE_JSON_BYTES`
- `NATIVE_MESSAGE_LENGTH_BYTES`
- `NativeMessageFrameExchange`
- `NativeMessagingLocalServiceClientOptions`
- `PairableLocalServiceOperation`
- `PairingIntent`
- `appendLocalGrant`
- `approvePairingIntent`
- `clientIdForIdentity`
- `createLocalGrantStore`
- `createNativeMessagingLocalServiceClient`
- `decodeNativeMessage`
- `encodeNativeMessage`
- `handleLocalServiceRequest`
- `parseLocalGrant`
- `parseLocalGrantStore`
- `parsePairingIntent`
- `reviewPairingIntent`
- `revokeLocalGrant`
- `serializeLocalGrantStore`
- `validateLocalServiceResponse`

## @nsealr/core

Nostr event hashing and signed-event verification helpers for nSealr.

Source entrypoint: `packages/core/src/index.ts`

Exports:
- `EventTemplate`
- `SignEventRequest`
- `SignEventResponse`
- `SignedEvent`
- `VerificationResult`
- `bytesToHex`
- `canonicalEventSerialization`
- `computeEventId`
- `hexToBytes`
- `verifySchnorrSignature`
- `verifySignedEventResponse`

## @nsealr/fixtures

Shared nSealr specs fixture loading and fixture validation helpers.

Source entrypoint: `packages/fixtures/src/index.ts`

Exports:
- `SpecsFixtureSet`
- `loadSpecsFixtures`
- `resolveSpecsRoot`
- `validateFeatureMatrixFixture`
- `validateReviewTranscriptFixture`

Additional package subpaths:
- `@nsealr/fixtures/specs-root`: `resolveSpecsRoot`

## @nsealr/framing

nSealr serial-frame encoding and decoding for USB CDC and UART experiments.

Source entrypoint: `packages/framing/src/index.ts`

Exports:
- `SERIAL_FRAME_PREFIX`
- `SerialFrame`
- `SerialFrameType`
- `decodeSerialFrame`
- `encodeSerialFrame`

## @nsealr/nip46

Already-decrypted NIP-46 bridge and permission-review helpers for nSealr companion.

Source entrypoint: `packages/nip46/src/index.ts`

Exports:
- `Nip46BridgeDecision`
- `Nip46ConnectIntent`
- `Nip46ConnectReview`
- `Nip46Permission`
- `Nip46PermissionRequirement`
- `Nip46RequestMessage`
- `Nip46ResponseMessage`
- `decideNip46BridgeAction`
- `isNip46RequestPermitted`
- `nip46PermissionLabel`
- `nip46PermissionRequirementFromRequest`
- `nip46ResponseFromNSealr`
- `nsealrRequestFromNip46`
- `parseNip46ConnectIntent`
- `parseNip46Permissions`
- `parseNip46PolicyFile`
- `respondToLocalNip46Request`
- `reviewNip46ConnectIntent`
- `reviewNip46ConnectMessage`

## @nsealr/policy

Secretless account, route, grant, and policy-decision helpers for nSealr companion.

Source entrypoint: `packages/policy/src/index.ts`

Exports:
- `AccountDescriptor`
- `GrantDescriptor`
- `GrantPermission`
- `PolicyDecision`
- `PolicyDecisionRequest`
- `PolicyProfile`
- `RouteCustody`
- `RouteSelection`
- `RouteSelectionRequest`
- `RouteType`
- `SignerRoute`
- `decidePolicyRequest`
- `parseAccountDescriptor`
- `parseGrantDescriptor`
- `parsePolicyProfile`
- `selectAccountRoute`

## @nsealr/protocol

nSealr request and response validation with shared v0 implementation limits.

Source entrypoint: `packages/protocol/src/index.ts`

Exports:
- `NSEALR_V0_LIMITS`
- `ValidationResult`
- `compactJsonUtf8ByteLength`
- `isSafeNonNegativeInteger`
- `nSealrV0Limits`
- `utf8ByteLength`
- `validateRequest`
- `validateResponse`

## @nsealr/qr

Static and animated nSealr QR envelope encoding and decoding.

Source entrypoint: `packages/qr/src/index.ts`

Exports:
- `ANIMATED_QR_ENVELOPE_PREFIX`
- `AnimatedQrEnvelopeOptions`
- `QR_ENVELOPE_PREFIX`
- `decodeAnimatedQrEnvelopeFrames`
- `decodeQrEnvelope`
- `encodeAnimatedQrEnvelopeFrames`
- `encodeQrEnvelope`

## @nsealr/review

Deterministic Nostr event review summaries and constrained-display page rendering.

Source entrypoint: `packages/review/src/index.ts`

Exports:
- `DEVELOPMENT_REVIEW_AUTHOR_PUBKEY`
- `EventReview`
- `REVIEW_DETAIL_BODY_LINE_STYLES`
- `ReviewBodyLineStyle`
- `ReviewDetailPage`
- `ReviewDetailPageLimits`
- `ReviewPage`
- `ScreenReview`
- `approvalDigestForRequest`
- `renderReviewDetailPages`
- `renderReviewPages`
- `reviewEventTemplate`
- `screenReviewForRequest`

## @nsealr/smartcard

APDU, PC/SC, simulator, and display-less smartcard signer boundary for nSealr.

Source entrypoint: `packages/smartcard/src/index.ts`

Exports:
- `CommandApdu`
- `GET_PUBLIC_KEY_INS`
- `NSEALR_CLA`
- `PcscApduTransport`
- `PcscConnection`
- `PcscReader`
- `PcscReaderProvider`
- `PcscTransmitResult`
- `PcscUnavailableError`
- `ResponseApdu`
- `SIGN_EVENT_ID_INS`
- `SW_CLA_NOT_SUPPORTED`
- `SW_INS_NOT_SUPPORTED`
- `SW_NO_ERROR`
- `SW_WRONG_LENGTH`
- `SmartcardApduTransport`
- `SmartcardReviewAcknowledgement`
- `SmartcardSigner`
- `SmartcardSimulator`

## @nsealr/transport

Secretless signer transport adapters and verified exchange boundaries for nSealr companion.

Source entrypoint: `packages/transport/src/index.ts`

Exports:
- `JsonFileTransport`
- `JsonLineStdioTransport`
- `SerialFrameTransport`
- `SerialLinePort`
- `SerialLinePortOpener`
- `SerialLineStreamPort`
- `SerialLineTransport`
- `SignerTransport`
- `exchangeSerialLineRequest`
- `readJsonFile`
- `writeJsonFile`

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
- `BrowserNativeMessageOptions`
- `BrowserNativeMessageSender`
- `BrowserNativeMessagingLocalServiceClientOptions`
- `BrowserProviderBackend`
- `BrowserProviderOptions`
- `LocalServiceBrowserProviderBackendOptions`
- `NATIVE_HOST_NAME`
- `Nip07Provider`
- `createBrowserNativeMessagingLocalServiceClient`
- `createLocalServiceBrowserProviderBackend`
- `createNip07Provider`

## @nsealr/client

Secretless local companion service and native-messaging client boundary for nSealr integrations.

Source entrypoint: `packages/client/src/index.ts`

Exports:
- `ChromiumNativeHostManifest`
- `EXTERNAL_REVIEW_ACKNOWLEDGEMENT_FORMAT`
- `ExternalReviewAcknowledgement`
- `FirefoxNativeHostManifest`
- `LOCAL_CLIENT_SURFACES`
- `LOCAL_GRANT_STORE_FORMAT`
- `LOCAL_PAIRING_APPROVAL_FORMAT`
- `LOCAL_PAIRING_INTENT_FORMAT`
- `LOCAL_PAIRING_REVIEW_FORMAT`
- `LOCAL_SERVICE_NAME`
- `LOCAL_SERVICE_OPERATIONS`
- `LOCAL_SERVICE_PROTOCOL`
- `LOCAL_STORAGE_ACCESS_MODES`
- `LOCAL_STORAGE_APPROVAL_FORMAT`
- `LOCAL_STORAGE_PURPOSES`
- `LOCAL_STORAGE_REVIEW_FORMAT`
- `LocalClientGrant`
- `LocalClientIdentity`
- `LocalClientSurface`
- `LocalGrantRevocationOptions`
- `LocalGrantSelector`
- `LocalGrantStore`
- `LocalGrantStoreOptions`
- `LocalGrantStoreRevocationOptions`
- `LocalPairingApproval`
- `LocalPairingReview`
- `LocalPairingReviewOperation`
- `LocalServiceClient`
- `LocalServiceClientOptions`
- `LocalServiceContext`
- `LocalServiceExchange`
- `LocalServiceExchangeOptions`
- `LocalServiceOperation`
- `LocalServiceRequest`
- `LocalServiceResponse`
- `LocalStorageAccessMode`
- `LocalStorageApproval`
- `LocalStorageApprovalRequirement`
- `LocalStoragePurpose`
- `LocalStorageReview`
- `LocalStorageReviewEntry`
- `MAX_LOCAL_GRANT_STORE_GRANTS`
- `MAX_LOCAL_GRANT_STORE_JSON_BYTES`
- `MAX_NATIVE_MESSAGE_BYTES`
- `MAX_SERVICE_JSON_BYTES`
- `NATIVE_HOST_DESCRIPTION`
- `NATIVE_HOST_INSTALL_APPROVAL_FORMAT`
- `NATIVE_HOST_INSTALL_EXECUTION_FORMAT`
- `NATIVE_HOST_INSTALL_PLAN_FORMAT`
- `NATIVE_HOST_NAME`
- `NATIVE_MESSAGE_LENGTH_BYTES`
- `NativeHostBrowser`
- `NativeHostInstallApproval`
- `NativeHostInstallApprovalOptions`
- `NativeHostInstallExecution`
- `NativeHostInstallExecutionOptions`
- `NativeHostInstallPlan`
- `NativeHostInstallPlanOptions`
- `NativeHostManifest`
- `NativeHostManifestOptions`
- `NativeMessageFrameExchange`
- `NativeMessagingLocalServiceClientOptions`
- `PairableLocalServiceOperation`
- `PairingIntent`
- `RouteDispatchEntry`
- `SIGNER_TRANSPORT_ERROR_CODES`
- `SignerDispatchRequest`
- `SignerRequestDispatcher`
- `SignerRouteUnavailableError`
- `SignerTransportError`
- `SignerTransportErrorCode`
- `appendLocalGrant`
- `appendLocalGrantRevocation`
- `approveLocalStorageReview`
- `approveNativeHostInstallPlan`
- `approvePairingIntent`
- `buildNativeHostInstallPlan`
- `buildNativeHostManifest`
- `clientIdForIdentity`
- `createLocalGrantStore`
- `createLocalStorageReview`
- `createNativeMessagingLocalServiceClient`
- `createRouteDispatcher`
- `decodeNativeMessage`
- `encodeNativeMessage`
- `executeNativeHostInstallApproval`
- `handleLocalServiceRequest`
- `handleLocalServiceRequestAsync`
- `parseLocalClientIdentity`
- `parseLocalGrant`
- `parseLocalGrantStore`
- `parseLocalPairingApproval`
- `parseLocalStorageApproval`
- `parseLocalStorageReview`
- `parseLocalStorageReviewEntry`
- `parseNativeHostInstallApproval`
- `parseNativeHostInstallExecution`
- `parseNativeHostInstallPlan`
- `parsePairingIntent`
- `requireLocalStorageApprovalEntry`
- `reviewPairingIntent`
- `revokeLocalGrant`
- `serializeLocalGrantStore`
- `validateLocalServiceResponse`

Additional package subpaths:
- `@nsealr/client/browser`: `LOCAL_CLIENT_SURFACES`, `LOCAL_PAIRING_INTENT_FORMAT`, `LOCAL_SERVICE_NAME`, `LOCAL_SERVICE_OPERATIONS`, `LOCAL_SERVICE_PROTOCOL`, `LocalClientGrant`, `LocalClientIdentity`, `LocalClientSurface`, `LocalPairingReview`, `LocalServiceClient`, `LocalServiceClientOptions`, `LocalServiceExchange`, `LocalServiceExchangeOptions`, `LocalServiceOperation`, `LocalServiceRequest`, `LocalServiceResponse`, `MAX_NATIVE_MESSAGE_BYTES`, `MAX_SERVICE_JSON_BYTES`, `NATIVE_HOST_NAME`, `NATIVE_MESSAGE_LENGTH_BYTES`, `NativeMessageFrameExchange`, `NativeMessagingLocalServiceClientOptions`, `PairableLocalServiceOperation`, `PairingIntent`, `clientIdForIdentity`, `createNativeMessagingLocalServiceClient`, `decodeNativeMessage`, `encodeNativeMessage`, `parseLocalClientIdentity`, `reviewPairingIntent`
- `@nsealr/client/client-identity`: `LOCAL_CLIENT_SURFACES`, `LocalClientIdentity`, `LocalClientSurface`, `parseLocalClientIdentity`

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
- `sha256Utf8Hex`
- `verifySchnorrSignature`
- `verifySignedEventResponse`

## @nsealr/fixtures

Shared nSealr specs fixture loading and fixture validation helpers.

Source entrypoint: `packages/fixtures/src/index.ts`

Exports:
- `SpecsFixtureSet`
- `loadSpecsFixtures`
- `resolveSpecsRoot`
- `validateAccessSurfaceFixture`
- `validateFeatureMatrixFixture`
- `validateReviewTranscriptFixture`
- `validateSourcePublicKeyProofFixture`

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

Already-decrypted NIP-46 bridge, connection-token descriptor, and permission-review helpers for nSealr companion.

Source entrypoint: `packages/nip46/src/index.ts`

Exports:
- `Nip46BridgeDecision`
- `Nip46ConnectIntent`
- `Nip46ConnectReview`
- `Nip46ConnectionUriDescriptor`
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
- `parseNip46ConnectionUri`
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
- `GrantUsageSnapshot`
- `PolicyChangeProposal`
- `PolicyChangeReview`
- `PolicyChangeReviewPage`
- `PolicyChangeReviewVector`
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
- `parsePolicyChangeProposal`
- `parsePolicyChangeReviewVector`
- `parsePolicyDecisionRequest`
- `parsePolicyProfile`
- `parseRouteSelection`
- `parseRouteSelectionRequest`
- `reviewPolicyChangeProposal`
- `selectAccountRoute`

## @nsealr/protocol

nSealr request and response validation with shared v0 implementation limits.

Source entrypoint: `packages/protocol/src/index.ts`

Exports:
- `Base64UrlPayloadErrorMessages`
- `NSEALR_V0_LIMITS`
- `ValidationResult`
- `assertBase64UrlPayload`
- `compactJsonUtf8ByteLength`
- `decodeBase64Url`
- `encodeBase64Url`
- `isSafeNonNegativeInteger`
- `jsonToUtf8Bytes`
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

## @nsealr/sdk

Platform-neutral SDK facade for nSealr browser, companion, and signer integrations.

Source entrypoint: `packages/sdk/src/index.ts`

Exports:
- `browserProvider`
- `client`
- `core`
- `framing`
- `nip46`
- `policy`
- `protocol`
- `qr`
- `review`
- `smartcard`

Additional package subpaths:
- `@nsealr/sdk/browser`: `browserProvider`, `client`, `core`, `policy`, `protocol`, `qr`, `review`

## @nsealr/smartcard

APDU, PC/SC, and display-less smartcard signer boundary for nSealr.

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
- `SW_INCORRECT_P1P2`
- `SW_INS_NOT_SUPPORTED`
- `SW_NO_ERROR`
- `SW_WRONG_LENGTH`
- `SmartcardApduTransport`
- `SmartcardReviewAcknowledgement`
- `SmartcardSigner`

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

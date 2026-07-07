# Changelog

All notable changes to Antigravity will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-07-07

### Added
- **OpenRouter provider**: Unified access to 300+ models via the OpenAI-compatible API
- **Safe JSON repair** ([src/proxy/jsonRepair.ts](src/proxy/jsonRepair.ts)): `repairPartialJson()` handles malformed upstream JSON (trailing commas, unquoted keys, single quotes, comments, truncated payloads) without using `eval()` or `new Function()`. 27 unit tests in `src/__tests__/jsonRepair.test.ts`.
- **Centralized provider registry** ([src/constants.ts](src/constants.ts)): `PROVIDERS`, `ALL_PROVIDERS`, `PROVIDER_DEFAULT_URLS`, and `PROVIDERS_REQUIRING_API_KEY` are now the single source of truth for all 19 supported providers. `src/proxy/registry.ts` and `src/schemaValidator.ts` import from `constants.ts` to prevent drift.
- **Pure retry strategy module** ([src/proxy/retryStrategy.ts](src/proxy/retryStrategy.ts)): `computeRetryDelay`, `shouldRetryStatus`, and `buildRetryDecision` are now pure, fully-tested functions (separate from `proxy.ts` orchestration).
- **Protobuf injection utilities** ([src/proxy/protoInjector.ts](src/proxy/protoInjector.ts), [src/proxy/protobuf.ts](src/proxy/protobuf.ts)): Pure functions for protobuf encode/decode and injection into `GetAvailableModels` responses.
- **Deterministic placeholder ID generation** ([src/proxy/idGenerator.ts](src/proxy/idGenerator.ts)): DJB2-hash-based IDs for custom model slots.
- **URL builder** ([src/proxy/urlBuilder.ts](src/proxy/urlBuilder.ts)): Centralized URL construction for custom model requests.
- **Model loader** ([src/proxy/modelLoader.ts](src/proxy/modelLoader.ts)): Custom model loading with encryption migration.
- **IDE installation wizard** ([src/ideInstall/](src/ideInstall/)): Extracted to a dedicated module.
- **Settings service** ([src/services/settingsService.ts](src/services/settingsService.ts)): Centralized settings management.
- **ESLint + Prettier** configured with `lint`, `format`, `lint:fix` scripts in `package.json`.

### Changed
- **TypeScript migration**: All source files migrated from JavaScript (`dist/*.js`) to TypeScript (`src/*.ts`). Compiled via `npx tsc`.
- **Refactored `proxy.ts`**: Monolithic proxy split into focused modules under `src/proxy/` (registry, shared, modelUtils, translators, retryStrategy, urlBuilder, protoInjector, idGenerator, protobuf, modelLoader, jsonRepair, types).
- **Centralized constants**: All magic numbers moved to [src/constants.ts](src/constants.ts) (ports, timeouts, retry delays, provider list, default URLs, HTTP status codes).
- **Per-model state isolation**: Global `lastToolCallIds` and `lastReasoningContent` replaced with `modelToolCallIds` and `modelReasoningContent` Maps to prevent cross-contamination between concurrent requests.
- **Managed cleanup interval**: Proxy state TTL cleanup (10min stream, 30min tool/reasoning) is now properly started/stopped by `proxy.ts` lifecycle instead of auto-starting at import time.

### Security
- **No `eval()`**: All JSON repair goes through `repairPartialJson()` (string-level transforms + `JSON.parse`). Verified by `jsonRepair.test.ts`.
- **API key encryption**: AES-256-GCM via Electron `safeStorage` (macOS Keychain / Windows DPAPI / Linux libsecret).
- **Request body size limit**: 10 MB cap on incoming requests to prevent memory exhaustion DoS.

### Fixed
- **`ERR_HTTP_HEADERS_SENT` race conditions**: All proxy response handlers now use `safeWriteHead`/`safeEnd` helpers to prevent multiple `writeHead` calls when timeouts race with successful responses.
- **Provider list drift**: `constants.ts`, `registry.ts`, and `schemaValidator.ts` now share a single source of truth.

### Documentation
- **README**: Added Table of Contents, fixed provider list, fixed retry backoff description, fixed safeStorage reference, fixed test file enumeration (12 files, not 6).
- **CHANGELOG**: This v2.1.0 entry added to reconcile with README.

## [2.0.3] - 2026-07-07

### Changed
- Migrated codebase from JavaScript (dist/) to TypeScript (src/)
- Refactored monolithic `proxy.ts` into focused modules under `src/proxy/`
- Centralized magic numbers in `src/constants.ts`

### Added
- `src/proxy/urlBuilder.ts` — URL construction logic for custom model requests
- `src/proxy/protoInjector.ts` — Pure functions for protobuf injection into GetAvailableModels
- `src/proxy/idGenerator.ts` — Deterministic ID generation (DJB2 hash)
- `src/proxy/retryStrategy.ts` — Retry strategies (linear, exponential, 2x exponential)
- `src/proxy/protobuf.ts` — Protobuf encode/decode utilities
- `src/proxy/modelLoader.ts` — Custom model loading with encryption migration
- `src/proxy/types.ts` — Shared TypeScript types
- `src/proxy/shared.ts` — Cross-turn state management with TTL cleanup
- `src/proxy/registry.ts` — Provider translator registry
- `src/proxy/modelUtils.ts` — Model capability detection
- `src/proxy/translators/` — Provider-specific request/response translators
- 84 new unit tests covering URL construction, protobuf injection, ID generation, and retry strategies

### Security
- AES-256-GCM encryption for API keys in `custom_models.json`
- Automatic migration from plaintext to encrypted on first run
- BOM-stripping for cross-platform file compatibility

## [2.0.1] - 2026-XX-XX

### Added
- Custom model support for 15+ providers (OpenAI, Anthropic, Google, Ollama, OpenRouter, custom)
- Automatic retry with exponential backoff for 5xx and 429 responses
- Configurable retry count and timeout per model
- Binary patch for Language Server hostname redirection
- Health check endpoint (`/health`, `/healthz`)

### Fixed
- `ERR_HTTP_HEADERS_SENT` race condition in proxy response handling
- Memory leak from uncleaned stream contexts

## [1.x.x] - Initial Release

### Added
- Electron-based desktop application
- Local proxy server for intercepting Gemini API calls
- Custom model management UI

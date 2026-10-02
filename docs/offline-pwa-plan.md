# Offline PWA Implementation Plan

**Goal:** Convert the existing PWA to offline operation without changing presentation.
**Architecture:** Native Firestore persistence for ordinary data; a durable per-account command queue for transactional financial operations; a complete versioned service-worker precache.
**Spec:** offline-pwa-design.md

## Constraints
- Preserve current CSS and JSX style/layout.
- Retain Firebase accounts and existing collection paths.
- No new server collection or fabricated exchange rates.

## Review focus
- Reconnect/crash must not duplicate money transfers.
- Multiple pending operations must use the projected remaining balance.
- Denied writes and storage failures must not silently report success.
- Incomplete worker installation must retain the old release.
- Offline reopening must include the splash video and lazy JavaScript chunks.

## Tasks
1. Write and run failing regression tests for financial projections, durable commands, replay receipts, and local write acknowledgement. Implement `financialCommands.js`, `financialQueue.js`, and `localWrites.js`; enable persistent Firestore cache and auth; adapt `SpendSmart.js` data flows without touching its presentation.
2. Write and run failing offline rate and worker tests. Implement cached-rate fallback, production worker registration, full-manifest precache generation and video range responses.
3. Run `CI=true npm test -- --watchAll=false --runInBand`, `npm run build`, and Chromium offline reload/CRUD checks. Review the diff, preserve screenshots/evidence, and package source/build for delivery.

## Execution record
- User approved the concrete offline design. Execute inline on `feat/offline-pwa` in the dedicated cloned repository.
- Higher-priority session instructions require completing already-authorized work without repeat approval gates. No publish, push or merge is authorized.
- All three tasks completed. Native CRUD, durable financial commands, rejection backups, explicit persistence readiness, integrity-checked release caching and offline rates implemented; original presentation retained.
- Independent code review completed. Five important findings resolved in the implementation; native writes are drained and their journals confirmed before financial replay to prevent classifying a newly created target as missing.
- Verification: 31 regression tests, 7 service-worker tests, mobile Chromium/Firebase-emulator integration and production smoke checks passed. See VERIFICATION.md.

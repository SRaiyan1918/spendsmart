# Using and deploying the offline PWA

The current dashboard JSX, UI components and CSS are unchanged. Accounts, Firebase paths and accounting conventions remain the same.

## Build and publish

1. Run `npm ci` and `npm run build`. The postbuild script generates the complete release precache with a digest for every required file, including the splash video, icons and lazy JavaScript chunks.
2. Upload the **contents** of `build/` to the existing HTTPS host. Publish all files together. Do not serve `public/sw-budget.js` directly: it is the template, without production bundles in its cache list.
3. For subfolder hosting, set `PUBLIC_URL=/your-subfolder` during the build. Keep deployed asset bytes unchanged so integrity checks can reject partial or corrupt releases. Serve `sw-budget.js` with `Cache-Control: no-cache`.
4. Keep existing Firebase rules allowing the signed-in user to read/write their profile and `transactions`, `savings`, `udhar` and `recurring` collections. No additional server collection is needed.

New workers activate once existing app windows close. A failed or incomplete update retains the previous working release.

## On a phone

Open the updated site online, sign in, and wait for the app and splash video to finish downloading. In Chrome use **Install app / Add to Home screen**; on iPhone use Safari **Share → Add to Home Screen**. Open the installed app once online so that account data is available locally. Then income, expense, refund, categories, budget, savings, udhar and recurring operations can be used offline, including after reopening the app.

Queued data synchronizes when the app is open and connected. First login/signup, password reset, Google login, ads and fetching new exchange rates still require internet. Offline currency conversions use previously downloaded real rates; without a rate the existing validation prevents an invented conversion.

Firestore data is persisted in IndexedDB. A separate per-account command queue persists financial operations requiring transactions. A stable transfer ID prevents duplicate replay after reconnect or a crash; remaining amounts are validated against current server balances. If another device has deleted a target or already completed a loan/goal, an existing browser confirmation allows cancelling just the pending command. An invalid target does not block unrelated commands.

Ordinary writes also retain an acknowledgement journal. Rejected writes after reopening generate an alert, with the attempted data retained locally for recovery. Rejected recurring occurrences do not automatically loop. If permanent browser storage is unavailable, a save is refused instead of pretending that a memory cache is durable.

Do not clear browser/site data or uninstall the PWA before pending entries have synchronized. Clearing device data deletes unsynced entries and local backups. Already synchronized records remain in Firebase. Recovery records are in localStorage under `spendsmart_commands_v1_<uid>:` and `spendsmart_writes_v1_<uid>:`; a support/developer session can export these JSON records before repairing a device.

## Verification

- `CI=true npm test -- --watchAll=false --runInBand`
- `npm run test:offline-worker`
- `npm run build`

For browser integration tests, install `playwright` and `firebase-tools` in a separate tools directory (or locally without committing dependency changes). Java 21 and Chromium are required. Start:

```sh
firebase emulators:start --only auth,firestore --project demo-spendsmart --config tests/emulators/firebase.json
```

In another terminal build explicitly against the emulators, then serve `build/`:

```sh
REACT_APP_FIREBASE_EMULATORS=true REACT_APP_FIREBASE_PROJECT_ID=demo-spendsmart npm run build
python -m http.server 4173 --bind 127.0.0.1 --directory build
```

Run `node scripts/offline-browser-test.cjs` with `NODE_PATH` pointing to the tools directory's `node_modules` if needed. Set `CHROMIUM_PATH` if Chromium is elsewhere. The test uses a 390×844 mobile viewport, creates an emulator-only account, checks offline CRUD/reopen/splash/recurring/savings/loans/budget, reconnect balances, deleted-target handling and a server-rule rejection after closing and reopening the page. Screenshots and results are written to `PWA_TEST_OUTPUT` or `/tmp/spendsmart-offline-evidence`.

**Rebuild with both emulator variables unset before publishing.** Emulator rules in `tests/emulators/` are test fixtures, not a production rules deployment.

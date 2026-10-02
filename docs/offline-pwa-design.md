# SpendSmart offline PWA

Approved scope: keep the current screens, JSX styles, CSS, fonts, colors and layout. After the first online installation and login, the same mobile PWA must reopen offline and support income, expense, refund, categories, budget, savings, loans and recurring entries. Keep Firebase accounts and automatic synchronization.

Use Firestore's persistent IndexedDB cache with an explicit persistence-readiness promise and persistent authentication. Ordinary writes use atomic batches and finish the UI flow after the durable local cache accepts them, instead of waiting indefinitely for a server acknowledgement. Keep a per-document acknowledgement journal and attempted-data backup so eventual rejection is reported through the existing alert mechanism even after closing/reopening the app. Refuse offline saves if persistence initialization falls back to memory.

Savings allocations and loan returns require server transactions. Persist these commands separately in per-account localStorage, project them into the existing screens immediately, and replay them when connectivity returns. A deterministic transaction document doubles as the replay receipt, avoiding new Firestore collections or rule requirements. Recheck remaining savings/loan amounts against current server data; never duplicate a transfer after a crash or reconnect. Keep failed commands until resolved or explicitly cancelled through deletion of the source item.

Generate a versioned full precache from production files, including splash video and icons, with per-file SHA-256 integrity checks and cache-reloading requests. Install new releases atomically and activate them once existing tabs close. Use the installed app shell offline, with byte-range support for the cached splash video. Preserve notification handling. Keep cached exchange rates when refresh fails; never invent conversion rates.

First installation, a fresh login/signup/password reset, ads, and refreshing exchange rates require connectivity. Device/browser data clearing removes local caches and unsynced records. Multiple devices can concurrently change balances, so transaction replay validates the latest server state and reports adjustments/rejections.

Verification: financial command and queue regression tests, local-write acknowledgement tests, service-worker cache/range tests, the existing accounting suite, a production build, and a Chromium mobile viewport offline reopen/write test. Deliver changed source and production build; publishing is outside the requested scope.

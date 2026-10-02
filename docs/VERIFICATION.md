# Offline PWA verification — 2026-10-02

- Full regression suite: **31 passed**, 6 suites.
- Service-worker suite: **7 passed**, including a partial deployment returning HTML instead of JavaScript, full precache, subfolder routing, offline video byte ranges and cache isolation.
- Production build: completed, **11 files** included in the integrity-checked release precache.
- Chromium mobile viewport (390×844), real Firebase Auth/Firestore **local emulators**: first signup/login, complete cache installation, offline income/expense/refund CRUD, savings creation and two capped allocations, loan creation/return, budget, recurring occurrence, persisted reopening, reconnect, exact server balances, and no duplicated transfers all passed.
- Deleted-target regression: cancelling a pending command for a missing goal allowed an unrelated loan return to synchronize.
- Rejection-after-reopen regression: a queued ordinary write rejected by emulator rules was reported after closing/reopening its page; attempted data remained in the acknowledgement journal.
- New offline window: cached splash video played; persisted auth restored.
- Final production smoke test: offline login screen and splash played, with no browser errors.
- Source comparisons: dashboard rendering block, authentication rendering block, UI components and both CSS files match the original source exactly. Only the splash asset URL expression changes to support subfolder hosting.
- Empty dashboard screenshots online vs offline: **no pixel difference**.
- Independent review identified failed-target queue blocking, nondurable rejection reporting, IndexedDB memory fallback, recurring rejection retries and incomplete-release integrity. Each was addressed; regression evidence above covers the corresponding behavior.

Production Firebase security rules and a physical iPhone were not inspected/tested. No repository push, production rules deployment or website publication was performed. Source and ready-to-upload production files are delivered locally.

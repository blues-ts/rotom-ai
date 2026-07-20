# Scope: Background Price Refresh

**Status:** Proposed — not started
**Author:** scoping doc, 2026-07-20
**Motivation:** Keep the vending shelf's market values (and, secondarily, collection
values) current *before* the app is opened, so a vendor's prices are fresh when a
customer walks up — without a manual pull-to-refresh.

---

## 1. What we have today

All price refreshing is **foreground-only** and triggered by one of:

- **Pull-to-refresh** — collections list, a collection detail, the vending shelf.
- **App becomes active** — `useAutoRefreshStalePrices` (`src/hooks/useCollections.ts`)
  fires the *global* collection sweep on mount and on `AppState` `'active'`, but only
  if a `collection_cards` row is older than `STALE_TTL_MS` (24h).
- **Add-time** — a newly added item with no price gets one refresh.

The global sweep already refreshes both surfaces (recent change):

- `sweepVendorPrices(db, api)` — `src/hooks/useVendorItems.ts`. Plain async function.
  Selects `status='listed'` vendor rows → one `getPricedBatch` → writes `market_value`
  in a single transaction. **Already headless-safe** (no React, no hooks).
- `useRefreshCollectionPrices()` — `src/hooks/useCollections.ts`. Still a **hook**; the
  collection sweep body is not yet extracted to a plain function.

Both are **Pro-gated** and both go through `getPricedBatch(api, …)`, where `api` is an
axios instance whose auth header is injected by a **Clerk `useAuth().getToken()`**
request interceptor (`src/lib/axios.ts`).

**Net:** "app already covers the 'vendor opens the app' case." Background refresh only
adds value for the window when the app is *not* open.

---

## 2. The core challenge — running headless

A background task runs in a **fresh JS runtime with no React tree**. Everything the
current refresh path leans on comes from React context/hooks and must be reconstructed
inside the task:

| Dependency | Today | In a headless task |
| --- | --- | --- |
| **Auth token** | Clerk `useAuth().getToken()` (hook) | No hook available. Need a headless way to mint/refresh a Clerk session token, or a background-safe credential. **Biggest unknown.** |
| **Pro check** | `useRevenueCat().isPro` (context) | `Purchases.getCustomerInfo()` works off a singleton, but `Purchases.configure()` must be re-run in the task runtime first. |
| **API instance** | `useApi()` hook wires the interceptor | Build a plain axios instance in the task and attach the token manually. |
| **DB** | `getDatabase()` singleton | ✅ Works headless — just opens the SQLite file. |
| **Sweep logic** | `sweepVendorPrices` plain fn ✅ / collection sweep is a hook ❌ | Extract a plain `sweepCollectionPrices(db, api)` mirroring `sweepVendorPrices`. |

### Auth is the crux
The pricing endpoint requires a Bearer token. Options, roughly in order of preference:

1. **Clerk headless token** — access the Clerk singleton (`@clerk/clerk-expo` persists
   the session in `expo-secure-store`) and call its token getter outside React. Needs a
   spike to confirm this works in a background JS context and that refresh succeeds when
   the cached token is expired.
2. **Long-lived device/service token** — a dedicated background credential minted while
   the app is foregrounded and stored in `expo-secure-store`, scoped to the pricing
   endpoint only. Requires a **backend change**.
3. **Silent push → wake → refresh** — server sends a background push; the app wakes and
   runs the same sweep. More reliable scheduling, but also a backend change and APNs
   plumbing. (See §6.)

**Decision needed before building** — see Open Questions.

---

## 3. Proposed approach (SDK 56)

Expo SDK 56 → use **`expo-background-task`** (BGTaskScheduler-based; the successor to the
deprecated `expo-background-fetch`) together with **`expo-task-manager`**.

### New files
- `src/lib/backgroundPriceRefresh.ts`
  - `PRICE_REFRESH_TASK` task name constant.
  - `TaskManager.defineTask(PRICE_REFRESH_TASK, …)` — the headless entry point:
    1. Configure `Purchases`, resolve `isPro`; bail if not Pro.
    2. Acquire an auth token (per §2 decision); bail if none.
    3. Build a plain authed axios instance.
    4. `await sweepVendorPrices(db, api)` and `await sweepCollectionPrices(db, api)`.
    5. Return `BackgroundTaskResult.Success` / `Failed`.
  - `registerPriceRefreshTask()` / `unregisterPriceRefreshTask()` — register with a
    `minimumInterval` (e.g. 12h; iOS treats it as a floor, not a guarantee).
- **Extract** `sweepCollectionPrices(db, api)` from `useRefreshCollectionPrices` into
  `src/hooks/useCollections.ts` (or a `src/lib/priceSweeps.ts`), mirroring the vendor
  refactor. The hook keeps calling it.

### Changed files
- `app.json`
  - Add `"expo-background-task"` to `plugins`.
  - iOS: `ios.infoPlist.UIBackgroundModes` → include `"processing"` (and `"fetch"` if we
    also use fetch-style scheduling); add `BGTaskSchedulerPermittedIdentifiers` with our
    task id.
  - This requires an **`expo prebuild`** + native rebuild (managed config plugin).
- App bootstrap (e.g. root `_layout.tsx`) — call `registerPriceRefreshTask()` once after
  auth is known, and unregister on sign-out.
- Reuse the existing invalidation story: on next foreground, TanStack Query refetches, so
  no cross-runtime query invalidation is needed — the background task only writes SQLite.

### Guardrails to preserve
- Only `status='listed'` vendor rows; sold receipts stay frozen.
- Pro-gate before any pricing call (no background spend for free users).
- Wrap each sweep in try/catch so one failing surface doesn't fail the whole task.
- Keep it a single batched request per surface (already the case).

---

## 4. Platform reality — this is opportunistic, not a cron

- **iOS:** BGTaskScheduler decides *when* tasks run based on usage patterns, battery, and
  network. There is **no guaranteed nightly slot**. Real-world cadence is often once a
  day or less, and never while the app has been force-quit. `minimumInterval` is a floor.
- **Android:** Backed by WorkManager — more reliable and closer to the requested interval,
  but still subject to Doze/battery optimization.

**Implication:** background refresh makes the shelf *more often* fresh, but cannot promise
"always fresh at 9am." The existing on-open auto-refresh remains the reliable path. Set
expectations accordingly in any UI copy.

---

## 5. Testing / verification

- iOS simulator/device: trigger the task on demand via the debugger
  (`e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"<id>"]`)
  rather than waiting for the OS.
- Add a temporary dev toggle / log line to confirm the task body runs headless, resolves
  Pro, gets a token, and writes rows.
- Verify token acquisition when the app has been backgrounded long enough for the cached
  token to expire (the failure mode most likely to bite).
- Confirm non-Pro users never hit the pricing API from the task.

---

## 6. Alternatives considered

- **Do nothing (status quo).** On-open auto-refresh already covers "vendor opens the app."
  Cheapest; leaves a gap only when the app stays closed across a price move.
- **Silent push-triggered refresh.** Server sends a background push (APNs/FCM) that wakes
  the app to run the same sweep. More control over *when*, survives better than pure
  opportunistic scheduling, but needs backend + push infra and still won't wake a
  force-quit iOS app.
- **Server-side pricing snapshot.** Move market-value computation server-side and have the
  client pull a cached snapshot cheaply on open. Biggest change; best long-term answer if
  price freshness becomes a recurring complaint. Overkill for this ask alone.

---

## 7. Effort estimate (rough)

| Piece | Est. |
| --- | --- |
| Spike: headless Clerk token + RevenueCat configure in a task | 0.5–1 day (**gates everything**) |
| Extract `sweepCollectionPrices` plain fn | ~0.5 day |
| Task module + register/unregister lifecycle | ~0.5 day |
| `app.json` config + prebuild + native rebuild wiring | ~0.5 day |
| Device testing (both platforms, token-expiry path) | ~1 day |

Total ballpark **3–4 days**, contingent on the auth spike. If headless Clerk tokens don't
work cleanly, add backend work for a background credential (option 2) or pivot to silent
push (option 6).

---

## 8. Open questions (decide before building)

1. **Auth:** headless Clerk token (option 1) vs. a backend-minted background credential
   (option 2)? Needs the spike + possibly backend buy-in.
2. **Scope of the background sweep:** vending only, or vending + collections? Vending is
   the motivation; collections adds cost for less benefit.
3. **Is opportunistic good enough,** or do we actually need push-triggered scheduling for
   the "current when the customer walks up" guarantee?
4. **Cost ceiling:** background pricing calls are Pro-only, but do we want a max frequency
   / battery-friendly cap beyond the OS defaults?

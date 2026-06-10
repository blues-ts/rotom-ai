# River AI

Pokemon TCG companion app: scan cards with the camera, track collection value, and chat with River, an AI assistant for pricing and collecting. Built with Expo (SDK 56), expo-router, Clerk, RevenueCat, and a local SQLite store.

## Get started

1. Install dependencies

   ```bash
   bun install
   ```

2. Configure environment

   ```bash
   cp .env.example .env
   ```

   Fill in the values (see `.env.example` for where each key comes from). The backend API lives in the `rotom-services` repo.

3. Start the app

   ```bash
   bun expo start
   ```

   The project includes native `ios/` and `android/` directories — use a development build or simulator, not Expo Go.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk auth (Google/Apple OAuth) |
| `EXPO_PUBLIC_API_URL` | rotom-services API base URL |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | RevenueCat public SDK key (iOS) |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat public SDK key (Android) |

Local dev reads `.env`. **EAS builds do not** — `EXPO_PUBLIC_*` vars are inlined at build time, so set them per environment with `eas env:create` before building.

## Builds

EAS profiles are defined in `eas.json`:

```bash
eas build --profile development --platform ios   # dev client
eas build --profile preview --platform ios       # internal/TestFlight testing
eas build --profile production --platform ios    # store build (auto-increments build number)
```

First-time setup requires `eas init` to link the project to your Expo account.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical overview.

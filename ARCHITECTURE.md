# Rotom AI — Frontend Architecture & Data Reference

## Overview

React Native mobile app (Expo) for Pokemon TCG AI-powered pricing analysis. Features an AI chat assistant ("River"), card search with infinite scroll, detailed card pricing views with charts, and OAuth authentication via Clerk.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo (React Native 0.83.2) |
| Language | TypeScript 5.9 (strict mode, React Compiler enabled) |
| Routing | Expo Router 55 (file-based) |
| State | TanStack React Query v5 + React hooks |
| HTTP | Axios (with auth interceptor) |
| Auth | Clerk (clerk-expo) — Google & Apple OAuth |
| Charts | Victory Native |
| Markdown | react-native-marked + custom renderer |
| Animations | React Native Reanimated 4.2 |
| Styling | StyleSheet.create + theme context tokens |

---

## Project Structure

```
src/
├── app/                          # Expo Router screens (file-based routing)
│   ├── _layout.tsx               # Root layout — providers, stack config
│   ├── (auth)/index.tsx          # OAuth sign-in (Google, Apple)
│   ├── (home)/index.tsx          # Main chat screen (River AI)
│   ├── (search)/index.tsx        # Card search with infinite scroll
│   ├── (card)/[id].tsx           # Card detail — pricing, charts, history
│   ├── (collections)/index.tsx   # Collections (placeholder)
│   └── (settings)/index.tsx      # Account & sign out
├── components/
│   ├── AuthSync.tsx              # Syncs Clerk user → backend on sign-in
│   ├── ChatInput.tsx             # Multi-line input, 2000 char limit, send button
│   ├── ChatMessage.tsx           # Message bubble with markdown rendering
│   ├── ChatMessageList.tsx       # Inverted FlatList with scroll-to-bottom
│   ├── EmptyChat.tsx             # "River" splash when no messages
│   ├── StreamingMessage.tsx      # Streaming response with animated cursor
│   ├── TypingIndicator.tsx       # Three-dot loading animation
│   ├── CodeBlock.tsx             # Syntax-highlighted code (highlight.js)
│   ├── ColoredRenderer.tsx       # Markdown renderer — colors % changes green/red
│   └── FeaturedCard.tsx          # Static featured card display
├── hooks/
│   ├── useChat.ts                # Chat state, streaming via XHR, message management
│   ├── useAuth.ts                # Auth callback mutation (POST /api/auth/callback)
│   ├── useSocialAuth.ts          # Google/Apple OAuth flow wrapper
│   └── useWarmUpBrowser.ts       # Android browser warm-up for OAuth
├── lib/
│   └── axios.ts                  # Axios instance + useApi() hook with Bearer token
├── config/
│   └── queryClient.ts            # React Query config (5min stale, 30min gc, 1 retry)
├── context/
│   └── ThemeContext.tsx           # Light/dark theme provider
├── constants/
│   └── colors.ts                 # Theme color tokens (light/dark)
└── types/
    └── chat.ts                   # Message interface
```

---

## Navigation & Screens

| Route | Screen | Auth | Presentation | Purpose |
|-------|--------|------|-------------|---------|
| `/(auth)` | Sign In | Public (redirects home if signed in) | Stack | Google/Apple OAuth login |
| `/(home)` | Chat | Required | Stack | AI chat with "River" assistant |
| `/(search)` | Search | Required | Full-screen modal | Card search with infinite scroll |
| `/(card)/[id]` | Card Detail | Required | Modal (slide up) | Pricing breakdown, charts, history |
| `/(collections)` | Collections | Required | Stack | Placeholder |
| `/(settings)` | Settings | Required | Slide from right | Account info, sign out |

**Root Layout providers (outermost → innermost):**
ClerkProvider → QueryClientProvider → ThemeProvider → KeyboardProvider → Stack

---

## API Integration

**Base URL:** `EXPO_PUBLIC_API_URL` (default: `http://localhost:3001`)

All authenticated requests include `Authorization: Bearer <clerk_token>` via axios interceptor.

### Endpoints Called

#### 1. Auth Callback
```
POST /api/auth/callback
Authorization: Bearer <token>
```
Called by `AuthSync` component after OAuth sign-in. Syncs Clerk user to backend MongoDB.

#### 2. AI Chat (Streaming)
```
POST /api/chat
Authorization: Bearer <token>
Content-Type: application/json

{ "messages": [{ "role": "user" | "assistant", "content": "string" }] }
```
**Response:** Plain text stream via XMLHttpRequest `onprogress`. Characters buffered and drained at 4 chars per 16ms for smooth typing effect.

#### 3. Card Search
```
GET /api/pricing/cards?search=pikachu&limit=20&game=pokemon&cursor=abc123
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "card-id",
      "name": "Pikachu",
      "image": "https://...",
      "cardNumber": "58/102"
    }
  ],
  "pagination": {
    "hasMore": true,
    "nextCursor": "next-cursor-token",
    "count": 20
  }
}
```
Used with `useInfiniteQuery` — loads more pages on scroll via `nextCursor`.

#### 4. Card Detail
```
GET /api/pricing/cards/{id}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "id": "card-id",
    "name": "Charizard ex",
    "image": "https://...",
    "cardNumber": "25/102",
    "set": { "name": "Paldean Fates" },
    "rarity": "Special Illustration Rare",
    "variant": "Holofoil",
    "currency": "USD",
    "prices": {
      "tcgplayer": {
        "NEAR_MINT": { "avg": 249.50 },
        "LIGHTLY_PLAYED": { "avg": 220.00 },
        "PSA_10": { "avg": 1250.00 },
        "PSA_9": { "avg": 750.00 }
      },
      "ebay": {
        "NEAR_MINT": { "avg": 239.00 },
        "PSA_10": { "avg": 1300.00 }
      }
    },
    "lastUpdated": "2026-04-01T12:30:00Z"
  }
}
```

The card detail screen derives these from the response:
- **conditionOptions**: Raw tiers (`NEAR_MINT`, `LIGHTLY_PLAYED`, etc.)
- **gradedOptions**: Graded tiers (`PSA_10`, `PSA_9`, `BGS_10`, `CGC_9_5`, etc.)

#### 5. Price History
```
GET /api/pricing/cards/{id}/history/{tier}?period=30d&limit=365
```
**Tier examples:** `NEAR_MINT`, `PSA_10`, `PSA_9`, `BGS_9_5`, `CGC_10`, `AGGREGATED`

**Period options:** `7d`, `30d`, `90d`, `1y`, `all`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-03-30",
      "source": "ebay",
      "avg": 245.00,
      "saleCount": 5
    },
    {
      "date": "2026-03-29",
      "source": "tcgplayer",
      "avg": 242.00,
      "saleCount": 3
    }
  ],
  "pagination": {
    "hasMore": false,
    "nextCursor": null,
    "count": 30
  }
}
```

---

## Data Types

### Message (`src/types/chat.ts`)
```typescript
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}
```

### Card (inferred from usage)
```typescript
interface Card {
  id: string;
  name: string;
  image: string;
  cardNumber: string;
  set?: { name: string };
  rarity?: string;
  variant?: string;
  currency: string;
  prices?: {
    tcgplayer?: Record<string, { avg: number }>;
    ebay?: Record<string, { avg: number }>;
  };
  lastUpdated?: string;
}
```

### Search Response
```typescript
interface SearchResponse {
  success: boolean;
  data: { id: string; name: string; image: string; cardNumber: string }[];
  pagination: { hasMore: boolean; nextCursor: string | null; count: number };
}
```

---

## Authentication Flow

1. User lands on `/(auth)` → sees Google/Apple sign-in buttons
2. `useSocialAuth` calls Clerk's `useSSO().startSSOFlow()` with redirect URL `rotomai://sso-callback`
3. On success → `setActive({ session: createdSessionId })`
4. `AuthSync` component detects signed-in state → calls `POST /api/auth/callback` to sync user to backend
5. Expo Router redirects to `/(home)`
6. All subsequent API calls include Bearer token via axios interceptor (`useApi()` hook)
7. Sign out via `/(settings)` → `useAuth().signOut()` with confirmation alert

**Token storage:** `@clerk/clerk-expo/token-cache` using `expo-secure-store`

---

## State Management

| Pattern | Used For |
|---------|----------|
| `useState` | Local UI state (input text, loading, selected tab) |
| `useRef` | FlatList scroll, drain interval refs |
| `useQuery` | Card detail, price history |
| `useInfiniteQuery` | Card search (cursor-based pagination) |
| `useMutation` | Auth callback |
| `useChat` (custom) | Chat messages, streaming content, abort |
| `ThemeContext` | Light/dark theme colors |

**React Query config:** 5 min stale time, 30 min garbage collection, 1 retry on failure.

---

## Styling

**Approach:** `StyleSheet.create()` with dynamic theme colors from `useTheme()`.

```typescript
const { colors } = useTheme();
<View style={[styles.container, { backgroundColor: colors.background }]} />
```

**Theme tokens** (`src/constants/colors.ts`):
- Light: white backgrounds, dark text
- Dark: black backgrounds, light text
- Primary: `#1e9df1` (light) / `#1c9cf0` (dark)
- Chart colors: 5 predefined (blue, green, yellow, etc.)

**Design patterns:**
- 8-12px border radius
- 8px gap baseline, 12-16px padding
- Skeleton loading with shimmer effect
- Spring physics for card press animations
- Haptic feedback on button presses (`expo-haptics`)
- Linear gradients for backgrounds (`expo-linear-gradient`)
- Blurred background images with overlay

---

## Key Components Detail

### `useChat` Hook
The core chat hook manages:
- **Messages array** with optimistic user message insertion
- **Streaming** via `XMLHttpRequest` — reads `responseText` on `onprogress`, diffs to get new chunks
- **Drain buffer** — characters queued and displayed at 4 chars per 16ms interval for smooth typing
- **Abort** — cancels XHR and clears drain interval
- **State:** `isStreaming` (XHR active), `isDisplaying` (drain buffer not empty), `streamingContent` (current partial text)

### `ColoredRenderer`
Custom markdown renderer that detects percentage patterns (`+12.3%`, `-5.2%`) and colors them green (positive) or red (negative). Extends `react-native-marked` renderer.

### Card Detail Screen
- Fetches card data and determines available pricing tiers
- Splits tiers into **conditions** (raw: NEAR_MINT, LIGHTLY_PLAYED, etc.) and **graded** (PSA_10, BGS_9_5, etc.)
- Tabs to switch between condition and graded views
- Victory Native line chart for price history
- Period selector (7d, 30d, 90d, 1y, all)
- Formats tier labels: `PSA_10` → `PSA 10`, `NEAR_MINT` → `Near Mint`

---

## Environment

```env
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

**app.json highlights:**
- Name: `rotomai`
- Orientation: portrait only
- Splash: Blue (#208AEF)
- React Compiler: enabled
- Typed Routes: enabled
- Deep link scheme: `rotomai://`

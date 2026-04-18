AGENTS.md

# CLAUDE.md — MusikaLokal

## Project Overview

MusikaLokal is a music industry marketplace platform connecting **musicians**, **studio owners**, and **venue owners** in the Philippines. Users can discover and book recording studios, find gigs, form groups/bands, and manage their music business. The platform includes AI-powered instrument suggestions, identity verification, a wallet/payment system, and real-time chat.

## Monorepo Structure

```
MusikaLokal/
├── mobile/          # React Native (Expo) — Android app (primary target)
├── web/             # React Native (Expo) — Web version (shared codebase pattern)
├── scripts/         # Root-level smoke tests
```

`mobile/` and `web/` are **independent Expo projects** with their own `package.json`, `node_modules`, configs, and Supabase directories. They share the same DB schema and edge functions but are not linked via a monorepo tool (no Turborepo/Nx). Code is duplicated across both with minor platform differences (e.g., `LocationPicker.web.tsx`, `PagerView.web.tsx`).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54, React Native 0.81, React 19.1 |
| Routing | expo-router v6 (file-based, typed routes) |
| Styling | NativeWind v4 + Tailwind CSS 3.4 |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions, Realtime) |
| State | React Context (AuthContext, ThemeContext, TopToastContext) |
| AI | Groq (chat completions), Google Gemini 2.5 Flash-Lite, pgvector (384-dim) |
| Payments | PayMongo (GCash, Card) |
| Identity | Didit (ID verification), Smile (address verification) |
| Animations | react-native-reanimated v4, @gorhom/bottom-sheet v5 |
| Fonts | Poppins (300–700 weights via @expo-google-fonts) |
| Language | TypeScript 5.9 (strict mode) |

## Key Commands

### Mobile

```bash
cd mobile
npm start                          # Start Expo dev server
npm run android                    # Build and run on Android
npm run web                        # Start web dev server
npm run lint                       # ESLint
npm run supabase:start             # Start local Supabase
npm run supabase:reset             # Reset local DB
npm run supabase:diff              # Generate migration diff
npm run ai:deploy-function         # Deploy instrument-suggestions edge function
```

### Web

```bash
cd web
npm start                          # Start Expo dev server
npm run dev                        # Start web (expo start --web)
npm run lint                       # ESLint
```

### Supabase CLI

```bash
supabase functions deploy <name> --no-verify-jwt   # Deploy edge function
supabase db push                                    # Push migrations to remote
supabase db diff -f <name>                          # Generate migration
```

## Project Structure (mobile/ — web/ mirrors this)

```
app/                    # expo-router pages (file-based routing)
  _layout.tsx           # Root layout: providers, auth gates, deep links
  index.tsx             # Login screen
  home.tsx              # Main feed with AI reranking
  signup.tsx            # Multi-step onboarding (role → details → ID verify → email verify)
  manage.tsx            # Role-based redirect to my_studio/my_group/my_venue
  bookings.tsx          # Studio booking management
  chat.tsx              # Real-time messaging
  wallet.tsx            # Wallet & transactions
  settings.tsx          # User settings
  (auth)/               # Auth group (currently empty)
  listing/              # Listing details (currently empty)
app/admin/              # (web only) Admin panel: users, reports, permits, audit

src/
  components/           # 40+ UI components
    header.tsx          # Nav header with notification badge
    navbar.tsx          # Bottom tab nav (5 tabs)
    ListingDetailsSheet.tsx  # Bottom sheet for listing details
    ChatScreen.tsx      # Message UI
    SearchBottomSheet.tsx
    CachedImage.tsx     # Supabase image optimization
    CustomAlert.tsx     # Modal alert system
    Skeleton.tsx        # Loading skeletons
    ui/                 # Reusable primitives
  context/
    AuthContext.tsx      # Session, roles, guest mode, subscription, identity, system lock
    ThemeContext.tsx      # Light/dark/system theme with AsyncStorage persistence
    TopToastContext.tsx   # Toast notifications (success/error/warning/info)
  hooks/
    useChat.ts           # Realtime messages, reactions, conversations
    useProfileCompletion.ts
    useBookingRequestAction.ts
    useInstrumentSuggestions.ts
    useCurrentUserVenueRole.ts
    useApplicationSubmissionAction.ts
    useListingSheetDerived.ts / useListingSheetEffects.ts
  services/
    groqModelRouter.ts   # Groq AI integration with caching (6h TTL)
    geminiFlashLite.ts   # Gemini API with model fallback chain
    paymongo.ts          # Payment processing
    uploadSafetyScreen.ts
  utils/
    screenCache.ts       # Dual-layer cache (memory + AsyncStorage) with TTL
    imageOptimization.ts # Supabase image transforms
    offlineInstrumentRecommender.ts  # 50+ instrument catalog, offline fallback
    navigation.ts        # Maps/Waze routing helpers
    gigApplication.ts    # Deadline/urgency calculations
  types/
    instruments.ts       # InstrumentSuggestion, ExperienceLevel, AI provider types
  constants/
    groupTypes.ts
    Images.ts
  data/
    mockData.ts

lib/
  supabase.ts            # Supabase client init (600+ lines, with auth helpers)

constants/
  theme.ts               # Theme constants

supabase/
  config.toml            # Supabase project config
  migrations/            # 64+ SQL migrations (chronological: 20260204–20260413+)
  functions/             # 34 Deno edge functions
  seed.sql               # Seed data
```

## Database Schema

### Core Entities

| Table | Owner FK | Purpose |
|-------|----------|---------|
| `profiles` | `auth.users.id` | Users (musician, studio-owner, venue-owner) |
| `groups` | `profiles.id` (owner_id) | Bands/artist groups |
| `studios` | `profiles.id` (owner_id) | Recording/rehearsal spaces |
| `gigs` | `profiles.id` (organizer_id) | Events needing performers |
| `studio_bookings` | `profiles.id` (user_id) | Studio reservations |
| `gig_applications` | `profiles.id` (applicant_id) | Musicians applying to gigs |

### 3NF Normalized Tables (expanded from legacy arrays)

- `profile_skills`, `profile_genres`, `profile_portfolio_urls`
- `studio_amenities`, `studio_media`, `studio_instruments`
- `studio_types`, `studio_availability_slots`
- `studio_settings` (slot config, pricing modifiers, buffer/lead times)
- `studio_operating_hours` (weekly template, 7 rows per studio)
- `studio_date_overrides` (exceptions)
- `gig_requirements`, `gig_media`, `gig_availability_slots`
- `booking_holds` (temporary locks during checkout, pg_cron cleanup)

### Social / Reviews / Wallet

- `reviews` — polymorphic (group_id OR studio_id OR gig_id OR user_id), CHECK exactly one
- `review_likes`, `review_comments`
- `favorites` — polymorphic bookmarks
- `reports` — moderation (pending/resolved/dismissed)
- `notifications` — with JSONB meta, realtime INSERT subscriptions
- `wallets` (1:1 per user), `wallet_transactions` (deposit/withdrawal/payment/refund/earning)

### Views

```
profiles_with_stats, groups_with_stats, studios_with_stats,
gigs_with_stats, reviews_with_stats, studio_bookings_with_cost
```

### Key DB Functions

- `is_slot_available(studio_id, date, start, end, user_id)` — booking conflict check
- `calculate_booking_price(studio_id, date, start, end, cart_hours)` — pricing with modifiers
- `match_listings(embedding, threshold, count, type)` — pgvector cosine similarity search
- `update_user_interest(user_id, item_vector, weight)` — personalization vector update
- `get_entity_rating(entity_type, entity_id)` — polymorphic rating lookup
- `cleanup_expired_holds()` — pg_cron automation

### RLS

All user-facing tables have Row Level Security enabled. General pattern:
- SELECT: public (anyone can view listings/profiles)
- INSERT/UPDATE/DELETE: `auth.uid() = owner_id` (owners manage their own)
- Private tables (notifications, wallets): `auth.uid() = user_id`

### Storage Buckets

| Bucket | Public | Purpose |
|--------|--------|---------|
| `avatars` | Yes | Profile pictures |
| `portfolio` | Yes | Artist portfolios |
| `listings` | Yes | Group/Studio/Gig media |
| `documents` | No | Contracts, permits, sensitive docs |

## Edge Functions (34 Deno functions)

Most functions have `verify_jwt = false` (auth handled internally).

**Core CRUD:** `home-feed`, `search-content`, `manage-listings`, `manage-details`, `manage-profile`, `user-profile`, `listings-crud`, `manage-content`

**Bookings:** `manage-bookings`, `bookings-manage`

**Applications:** `gig-applications`, `group-members`

**Payments:** `paymongo`, `withdrawals`

**Auth/Identity:** `verify-identity`, `create-didit-session`, `didit-webhook`, `smile-webhook`, `create-address-verification`, `address-verification-redirect`, `login-redirect`, `initiate-signup`, `create-unverified-user`, `verification-redirect`

**Other:** `instrument-suggestions`, `manage-notifications`, `upload-file`, `upload-safety-screen`, `delete-account`, `delete-studio-with-storage`, `setup-storage`, `test-deploy`

## AI Integration

### Instrument Suggestions
- **Online:** Groq Chat Completions → Gemini Flash-Lite (fallback chain)
- **Offline:** `offlineInstrumentRecommender.ts` — 50+ instrument catalog with genre/difficulty/category filtering
- Cache: 6h TTL for suggestions, 10min for home feed, 30min for chat

### Home Feed Reranking
- Gemini Flash-Lite reranks listings based on user profile signals (skills, genres)
- Freshness scoring applied to listings

### Vector Search
- pgvector extension, 384-dim embeddings (all-MiniLM-L6-v2)
- Entities: groups, studios, gigs (embedding column)
- User personalization: `profiles.interest_vector` (weighted average updates)

## Auth & User Roles

**Roles:** `musician`, `studio-owner`, `venue-owner`, `admin`

### Auth Flow
1. Role selection → Details/email/password → Identity verification (Didit WebView) → Email verification
2. Guest mode supported (limited access)
3. Admin role detected via `isAdminRole()` check

### Auth Guards (in `_layout.tsx`)
- **Identity gate:** Unverified users redirected to `/identity_verification` (allows settings, wallet, help)
- **Subscription gate:** Unpaid users shown subscription modal (allows payment screens)
- **System lock:** Users with unpaid bookings get locked out

### Important Auth Patterns
- `roleResolved` flag prevents race conditions (don't render admin guards until role lookup completes)
- Realtime presence channel tracks active users
- Profile changes trigger realtime subscription updates

## Theme System

### ThemeContext Colors
- **Light:** background `#F9FAFB`, surface `#FFFFFF`, primary `#4F46E5` (Indigo 600)
- **Dark:** background `#0F172A` (Slate 900), surface `#1E293B`, primary `#6366F1` (Indigo 500)
- Persisted to AsyncStorage

### Tailwind Theme
- Primary: Spotify-inspired green scale (`#169C46` at 500)
- Secondary: Dark gray scale (`#1A1A1A` at 500)
- Accent: Gray scale (`#404040` at 500)

## Provider Hierarchy

```
GestureHandlerRootView
  → ThemeProvider
    → TopToastProvider
      → AuthProvider
        → BottomSheetModalProvider
          → RootContent (routing, deep links, realtime notifications)
```

## Navigation

- **Bottom tabs (navbar.tsx):** Home, Activity, Manage, AI Suggest, Profile
- **Manage route** redirects by role: studio-owner → `/my_studio`, musician → `/my_group`, venue-owner → `/my_venue`
- **Navbar constants:** `NAVBAR_HEIGHT = 84`, `NAVBAR_BOTTOM_OFFSET = 24`
- **Deep link scheme:** `musikalokal://`

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL          # Supabase project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY     # Supabase anon key
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY   # Google Maps
EXPO_PUBLIC_GROQ_API_KEY          # Groq AI
EXPO_PUBLIC_GEMINI_API_KEY        # Google Gemini AI
EXPO_PUBLIC_GEMINI_MODEL          # Gemini model name (default: gemini-2.5-flash-lite)
GROQ_API_KEY                      # Server-side Groq key
SUPABASE_ACCESS_TOKEN             # Supabase CLI auth (PAT)
```

Env vars are read in `app.config.js` via `process.env` with fallbacks to `app.json` extra. After changing env vars, restart Metro with `--clear`.

## Responsive Scaling (mobile)

Used in `home.tsx` and other screens for cross-device consistency (optimized for iPhone SE):
- `scale()` — width-based
- `verticalScale()` — clamped 0.8–1.2 ratio
- `moderateScale(factor=0.3)` — less aggressive scaling

## Testing

- **Playwright** listed as devDependency (mobile)
- **Smoke tests:** `scripts/smoke_test.mjs` — tests `manage-details` edge function
- **Test users:** `musician@test.com`, `studio@test.com`, `venue2@test.com` (password: `pass123`)
- **No CI/CD configured** (no `.github/` folder)

## Conventions

- File-based routing with expo-router; screen files in `app/`, shared code in `src/`
- Path alias: `@/*` maps to project root
- Bottom sheets via `@gorhom/bottom-sheet` for detail views
- Supabase client initialized in `lib/supabase.ts` (shared singleton)
- Toast notifications via `showTopToast()` from TopToastContext
- Polymorphic patterns for reviews/favorites (CHECK constraints ensure exactly one FK)
- Edge functions are Deno-based, located in `supabase/functions/`
- Migrations are SQL files with date prefixes in `supabase/migrations/`
- Manila timezone (`Asia/Manila`) is the default for booking calculations

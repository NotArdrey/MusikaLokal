# MusikaLokal

MusikaLokal is a mobile-first platform for connecting Filipino musicians, groups, producers, venues, and gig organizers. The repository contains the customer-facing mobile application, a web/admin application, shared Supabase infrastructure, and cross-application end-to-end tests.

## Product areas

- Musician, group, producer, venue, and gig-user profiles
- Social feed, posts, follows, privacy controls, verification, and realtime updates
- Gig publishing, discovery, applications, applicant review, and production-team workflows
- AI-assisted applicant classification with human review and configurable score/distance criteria
- Music playback, radio-style queues, media uploads, and notification flows
- Booking, cancellation, duplicate-identity, and account-protection rules
- Administrative CRUD and moderation workflows

## Technology

- Expo 54, React Native 0.81, React 19, and Expo Router
- Supabase Auth, Postgres, Storage, Realtime, Edge Functions, and Row Level Security
- TanStack React Query with persisted cache and FlashList virtualization
- Groq-backed server-side AI features
- Expo audio/video, notifications, camera, image picker, location, and deep linking
- Playwright cross-app tests and mobile automation assets

## Repository layout

```text
mobile/     Expo mobile application
web/        Expo Router web/admin application
e2e/        Playwright cross-application test suite
supabase/   Shared database, migrations, policies, and Edge Functions
```

## Mobile development

```bash
cd mobile
npm install
npm start
```

Useful commands:

```bash
npm run android
npm run ios
npm run web
npm run lint
```

## Web/admin development

```bash
cd web
npm install
npm run dev
```

The web development server is configured to use port `8082`.

## End-to-end tests

Install root test dependencies, configure `.env.e2e` from `.env.e2e.example`, and run the required suite:

```bash
npm install
npm run e2e:admin-crud
npm run e2e:mobile-crud
npm run e2e:cross-app
```

## Security

Only public Supabase configuration belongs in client applications. Keep service-role keys, Groq keys, verification-provider secrets, signing credentials, and other privileged values in Supabase or deployment secret storage. Never commit real `.env` files, private identity documents, or production logs containing user data.

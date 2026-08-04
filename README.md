# MusikaLokal

MusikaLokal is a mobile-first platform for connecting Filipino musicians, groups, producers, venues, and gig organizers.

## Technology

- Expo and React Native
- Supabase authentication, database, storage, Realtime, Edge Functions, and Row Level Security
- React Query and FlashList for responsive data flows
- Groq-powered AI assistance and applicant filtering
- Maestro and Playwright for automated testing

## Product areas

- Musician and organization profiles
- Social feed, follows, posts, and realtime updates
- Gig discovery, applications, applicant review, and production-team workflows
- Music playback and radio-style queues
- Identity, privacy, cancellation, and verification controls
- AI-assisted applicant classification with human review

## Local setup

Install dependencies and start Expo:

```bash
npm install
npx expo start
```

Keep Supabase service-role credentials, Groq keys, verification-provider secrets, and other privileged values in server-side secret storage. Never commit `.env` files containing real credentials.

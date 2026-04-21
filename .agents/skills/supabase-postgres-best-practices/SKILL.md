---
name: supabase-postgres-best-practices
description: Postgres performance optimization and best practices from Supabase. Use this skill when writing, reviewing, or optimizing Postgres queries, schema designs, or database configurations.
license: MIT
metadata:
  author: supabase
  version: "1.1.0"
  organization: Supabase
  date: January 2026
  abstract: Comprehensive Postgres performance optimization guide for developers using Supabase and Postgres. Contains performance rules across 8 categories, prioritized by impact from critical (query performance, connection management) to incremental (advanced features). Each rule includes detailed explanations, incorrect vs. correct SQL examples, query plan analysis, and specific performance metrics to guide automated optimization and code generation.
---

# Supabase Postgres Best Practices

Comprehensive performance optimization guide for Postgres, maintained by Supabase. Contains rules across 8 categories, prioritized by impact to guide automated query optimization and schema design.

## When to Apply

Reference these guidelines when:
- Writing SQL queries or designing schemas
- Implementing indexes or query optimization
- Reviewing database performance issues
- Configuring connection pooling or scaling
- Optimizing for Postgres-specific features
- Working with Row-Level Security (RLS)

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Query Performance | CRITICAL | `query-` |
| 2 | Connection Management | CRITICAL | `conn-` |
| 3 | Security & RLS | CRITICAL | `security-` |
| 4 | Schema Design | HIGH | `schema-` |
| 5 | Concurrency & Locking | MEDIUM-HIGH | `lock-` |
| 6 | Data Access Patterns | MEDIUM | `data-` |
| 7 | Monitoring & Diagnostics | LOW-MEDIUM | `monitor-` |
| 8 | Advanced Features | LOW | `advanced-` |

## How to Use

Read individual rule files for detailed explanations and SQL examples:

```
references/query-missing-indexes.md
references/schema-partial-indexes.md
references/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect SQL example with explanation
- Correct SQL example with explanation
- Optional EXPLAIN output or metrics
- Additional context and references
- Supabase-specific notes (when applicable)


# MusikaLokal: Supabase Edge Function Troubleshooting

## 🚨 The Core Issue: "Non-2xx Status Code"
In the MusikaLokal repository, Edge Function client symptoms often surface as the generic error: `Edge Function returned a non-2xx status code`. 

Because patched clients in both `mobile/lib/supabase.ts` and `web/lib/supabase.ts` normalize server-side errors, multiple distinct backend failures will collapse into this same generic message unless the caller logs the structured error fields.

## 🔍 Primary Causes to Check First
Before assuming there is a Postgres or database issue, verify the following:
1. **Stale Deployments:** Did you recently add a new action to an action-router function (e.g., `manage-playlists`, `manage-social-feed`, `manage-marketplace`)? Confirm the updated Edge Function was successfully deployed.
2. **Missing Action Handlers:** Ensure the specific action you are trying to invoke actually exists and is properly handled within the router function.
3. **Hidden Error Details:** Do not just log the `catch` value or use `const { data } = await...` while ignoring the `error` object. This hides critical debugging info like `status`, `code`, `details`, `hint`, and `context`.

## 📱💻 Affected Surfaces (Mobile & Web)
This generic failure pattern frequently occurs across the following areas:

**Mobile App:**
* **Playlists & Radio:** `profile.tsx`, `create_playlist.tsx`, `create_station.tsx`, `playlist_details.tsx`, `station_details.tsx`
* **Social Feed:** `feed.tsx`, `post_details.tsx`
* **Producer Network:** `producer_projects.tsx`, `producer_project_details.tsx`
* **Marketplace:** `marketplace.tsx`, `shop.tsx`, `seller_hub.tsx`, `product_details.tsx`, `orders.tsx`

**Web App:**
* Similar generic failures can recur anywhere the web app utilizes `web/lib/supabase.ts` to invoke Edge Functions.

## 🛠️ Required Debugging Pattern
To reveal the actual cause of the failure, you **must** implement this structured logging pattern when invoking Edge Functions in this codebase:

```typescript
const { data, error } = await supabase.functions.invoke("manage-social-feed", { body });

if (error) {
  console.error("Edge Function failed:", {
    message: error.message,
    status: (error as any).status,
    code: (error as any).code,
    details: (error as any).details,
    hint: (error as any).hint,
    context: (error as any).context,
    body,
  });
  throw error;
}
```

## Another Repository Troubleshooting Note

MusikaLokal has a recurring Supabase Edge Function client symptom that often appears as:

- `Edge Function returned a non-2xx status code`

In this repo, that message is usually normalized by the patched clients in `mobile/lib/supabase.ts` and `web/lib/supabase.ts`, so multiple server-side failures collapse into the same generic error unless the caller logs the structured error fields.

First checks for this codebase:

- Confirm the Edge Function was deployed after adding a new action to an action-router function such as `manage-playlists`, `manage-social-feed`, `manage-marketplace`, `manage-producer-network`, `manage-deals`, or `manage-bookings`.
- Do not assume the problem is Postgres first. In this repo, stale deployments and missing action handlers are a common cause of the same generic non-2xx failure.
- Do not ignore the returned `error` from `supabase.functions.invoke(...)`. Many screens currently do `const { data } = await ...` and only log the catch value, which hides `status`, `code`, `details`, `hint`, and `context`.

Known screens where this generic failure pattern can recur:

- Mobile playlist and radio surfaces: `mobile/app/profile.tsx`, `mobile/app/create_playlist.tsx`, `mobile/app/create_station.tsx`, `mobile/app/playlist_details.tsx`, `mobile/app/station_details.tsx`, `mobile/app/feed.tsx`
- Mobile social feed surfaces: `mobile/app/feed.tsx`, `mobile/app/post_details.tsx`
- Mobile producer-network surfaces: `mobile/app/producer_projects.tsx`, `mobile/app/producer_project_details.tsx`
- Mobile marketplace surfaces: `mobile/app/marketplace.tsx`, `mobile/app/shop.tsx`, `mobile/app/seller_hub.tsx`, `mobile/app/product_details.tsx`, `mobile/app/orders.tsx`
- Web also uses the same normalization pattern via `web/lib/supabase.ts`, so similar generic failures can recur there as well.

Required debugging pattern for this repo:

```ts
const { data, error } = await supabase.functions.invoke("manage-social-feed", { body });

if (error) {
  console.error("manage-social-feed failed", {
    message: error.message,
    status: (error as any).status,
    code: (error as any).code,
    details: (error as any).details,
    hint: (error as any).hint,
    context: (error as any).context,
    body,
  });
  throw error;
}
```

Current project-specific takeaway:

- If a new client flow starts failing with this generic message right after adding an action to `manage-playlists`, `manage-social-feed`, or another action-router function, verify deployment before debugging the screen.

## References

- https://www.postgresql.org/docs/current/
- https://supabase.com/docs
- https://wiki.postgresql.org/wiki/Performance_Optimization
- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/auth/row-level-security

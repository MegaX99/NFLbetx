# NFLbetx

Version 0.1 of a modern NFL against-the-spread pick'em pool.

## Local setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the Supabase project URL and publishable key.
4. Start with `pnpm dev`.

## Supabase

The initial database schema is versioned in `supabase/migrations`. It includes profiles,
pools, pool memberships, multiple entries per user, NFL games, ATS picks, kickoff locking,
and Row Level Security policies.

The current preview still displays sample games and standings. Authentication and live
database-backed pages are the next application milestone.

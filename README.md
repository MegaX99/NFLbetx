# NFLbetx

Version 0.1 of a modern NFL against-the-spread pick'em pool.

## Local setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the Supabase project URL and anon key.
4. Start with `pnpm dev`.

## PayPal Commissioner Pass checkout

The Commissioner Pass uses PayPal's Orders v2 API. Vercel Preview deployments and
local development default to PayPal Sandbox; Vercel Production defaults to PayPal
Live. `PAYPAL_ENVIRONMENT` can explicitly select `sandbox` or `live`.

Add these server-only variables to the matching Vercel environments:

- `SUPABASE_SECRET_KEY`: a Supabase secret key used only by authenticated payment routes.
- `PAYPAL_SANDBOX_CLIENT_ID`: the client ID from a PayPal sandbox REST app.
- `PAYPAL_SANDBOX_CLIENT_SECRET`: the secret from that same sandbox app.
- `PAYPAL_LIVE_CLIENT_ID`: the client ID from the PayPal live REST app.
- `PAYPAL_LIVE_CLIENT_SECRET`: the secret from that same live app.
- `PAYPAL_ENVIRONMENT`: optional explicit override; only `sandbox` or `live` is accepted.

Never prefix these values with `NEXT_PUBLIC_`, paste them into source code, or
commit them. Preview should use sandbox credentials and Production should use live
credentials. The server calculates the price from the pool roster, captures the
order in its recorded environment, verifies the completed USD amount and pool
identifiers, and then records the entitlement through the locked payment ledger.

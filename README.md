# NFLbetx

Version 0.1 of a modern NFL against-the-spread pick'em pool.

## Local setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the Supabase project URL and anon key.
4. Start with `pnpm dev`.

## PayPal Sandbox Commissioner Pass checkout

The Commissioner Pass uses PayPal's sandbox Orders API. Live PayPal endpoints are
not present in the application, so this integration cannot move real money.

Add these server-only variables locally and to the Vercel Preview environment:

- `SUPABASE_SECRET_KEY`: a Supabase secret key used only by authenticated payment routes.
- `PAYPAL_SANDBOX_CLIENT_ID`: the client ID from a PayPal sandbox REST app.
- `PAYPAL_SANDBOX_CLIENT_SECRET`: the secret from that same sandbox app.

Never prefix these values with `NEXT_PUBLIC_`, paste them into source code, or
commit them. Use a PayPal sandbox buyer account when testing checkout. The server
calculates the price from the pool roster, captures the sandbox order, verifies
the completed USD amount and pool identifiers, and then records the entitlement
through the locked payment ledger.

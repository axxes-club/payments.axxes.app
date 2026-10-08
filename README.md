# AXXES Payments

Central, embedded checkout at **payments.axxes.app** for customers purchasing any AXXES product or service. Payments go directly to the AXXES Stripe account. Tollbooth is a separate product and deployment.

## Create a purchase

Trusted AXXES servers call `POST https://payments.axxes.app/api/v1/checkouts` with `Authorization: Bearer <environment integration key>`, `Idempotency-Key: <unique-order-key>` (12–100 letters, digits, underscores or hyphens), and JSON:

```json
{
  "mode": "live",
  "product": "quill",
  "reference": "your-order-id",
  "description": "Your approved service quote",
  "amount": 10000,
  "currency": "usd",
  "quantity": 1
}
```

Amounts are integer minor units: this example is $100, not a published AXXES price. Only send approved server-side quotes; never forward a browser-supplied amount. Supported currencies: USD, EUR, GBP and CAD. Amounts must be at least 50 minor units; quantities 1–99; totals at most 99,999,999 minor units. Optional `email` prefills the buyer’s email. Mode defaults to live.

Alternatively supply `priceId` instead of `amount` and `description`. The price must exist in the matching Stripe environment. For a recurring price, **explicitly set `purchase: "subscription"`**; otherwise purchase defaults to one-time payment. Stripe validates price activity and recurrence. There is no invented product catalog or automatic pricing.

Response: `{ "id": "cs_live_...", "mode": "live", "checkout_url": "https://payments.axxes.app/checkout/cs_live_..." }`. Send the buyer to this URL. The payment form stays inside the AXXES page. Card methods are enabled; redirect-based methods are excluded. Authentication challenges can still be required by the card issuer.

Use a stable Idempotency-Key for retries of the exact same quote. Reusing it with a different quote is rejected by Stripe. Live and test integration tokens are distinct. Keep them exclusively on trusted servers; these are administrative integrations able to create quotes for any AXXES product.

## Verify before granting access

Call `GET /api/v1/checkouts/<id>` using the matching environment integration key. The response includes `state`, `payment_status`, `reference`, `product`, `amount_total`, `currency` and a subscription ID when applicable. Check the reference, product and expected total against your own order. `paid` means Stripe confirms a completed paid checkout; `no_payment_due` means a completed order requiring no payment. `open`, `processing` and `expired` must not be treated as paid.

Do not grant access based on a browser URL, callback, or redirect. Each selling app retains its order and entitlement records and verifies this server endpoint before fulfillment. A completed subscription checkout verifies the initial transaction only; ongoing subscription access requires checking Stripe subscription and invoice status and handling cancellations/renewals in the selling app.

Payments forwards signed events (see Product integration) but keeps no entitlement records or fulfilment ledger of its own. Products must integrate the creation/status API before their customers can use this checkout. Existing product checkout flows are not automatically replaced by deploying this service.

Purchase URLs are bearer links; treat them as private. Public pages expose only checkout UI and confirmation. Sessions created by other applications on the same Stripe account are rejected.

## Product integration

Each selling product is registered in `PAYMENTS_PRODUCTS` (JSON in `payments-env`, never in source):

```json
{ "afters": { "name": "afters.am", "keys": { "live": "<64 hex>", "test": "<64 hex>" },
  "returnOrigins": ["https://afters.am"],
  "events": { "live": "https://afters.am/api/axxes-payments/events" }, "eventSecret": "<64 hex>" } }
```

- **Product keys.** A product key can create and read purchases only for its own `product`. The administrative `PAYMENTS_API_KEY_*` keys still act for any product.
- **Return to the product.** Pass `returnUrl` when creating a checkout. Its origin must be in the product's `returnOrigins`. After paying, the confirmation page shows "Return to <name>" and appends `axxes_checkout=<checkout id>`. Verify that ID server-side before granting anything.
- **Lookup keys.** Instead of `priceId`, pass `lookupKey` (for example `vitrine_collector_monthly`). It is the same in test and live, must start with `<product>_`, and is resolved to the active Stripe price server-side.
- **Trials.** Subscriptions may pass `trialDays` (1–30).
- **Signed events.** Stripe checkout, subscription and invoice events for a product's purchases are re-read from Stripe and POSTed to the product's events URL as `checkout.updated` or `subscription.updated`. Each carries the current subscription snapshot (`status`, `current_period_end`, `cancel_at_period_end`, `price`, …), so applying them in any order converges. The `AXXES-Payments-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<body>">` header is signed with `eventSecret`; `verifyEvent` in `src/lib/products.ts` is the reference verifier. A non-2xx response makes Stripe retry the original event (for up to three days). Deduplicate on `id`.
- **Subscription status.** `GET /api/v1/subscriptions/<sub id>?mode=live|test` returns the same snapshot.
- **Manage subscription.** `POST /api/v1/portal-sessions` with `{ mode, subscription, returnUrl }` returns a short-lived Stripe billing portal URL where the buyer can update their card or cancel. The product must check that the signed-in user owns that subscription first.

## Development

`npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. See [DEPLOYMENT.md](DEPLOYMENT.md) for the independent Linux runtime and secret configuration.

Order references live in Payments-specific Stripe metadata. `client_reference_id` is deliberately omitted because the separate Tollbooth webhook treats that legacy field as a Tollbooth payment ID.

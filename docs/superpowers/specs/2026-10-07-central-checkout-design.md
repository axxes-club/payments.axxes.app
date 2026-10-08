# AXXES customer payments

Owner intent: payments.axxes.app is the separate place where customers pay AXXES for any AXXES product or service. Tollbooth remains the merchant SaaS for customers receiving their own money. Customers should stay within AXXES during checkout.

Implement a standalone Next.js service with Stripe Embedded Checkout, direct charges to AXXES's activated Stripe account, and no Connect onboarding or application fees. Authenticated AXXES server callers create quotes using explicit amounts or existing Stripe prices. Customers receive an opaque checkout link, view the product/service and complete their payment inside an AXXES page. Recurring prices create subscriptions; no prices or plans are invented or published by this implementation.

The authenticated creation API accepts payment/test mode, product key, immutable order reference, currency/amount for one-time quotes or a Stripe price ID, quantity and optional customer email. Require a sufficiently strong per-environment integration key and idempotency key. Validate all input; fix the merchant and return origin server-side. Public reads accept only Embedded Checkout sessions created by this service and expose minimal customer-safe purchase information. Protected status reads let the selling app verify the actual Stripe status before granting paid access. Webhook signatures are verified; received events provide operational audit logging, while Stripe remains the authoritative payment record. There is no local fulfillment ledger or claim of automatic cross-app entitlement updates.

Use only card-based payment methods for this first checkout so completion remains inside the app; Stripe-required cardholder authentication may be shown in the component. Completion checks Stripe on the server, never browser callbacks or URL flags. Paid, processing, expired and invalid sessions receive honest distinct states. The server secret key never reaches the browser. Native currency inputs cannot change the agreed server quote.

Deploy a distinct Cloud Run payments service and payments-env secret behind the existing load balancer. Route only payments.axxes.app to it; preserve Tollbooth hosts and deployments. Verify test checkout/payment and webhook signatures, Linux build/tests, live anonymous API denial, and public domain routing. Do not charge a live card as a test.

Implementation clarification: recurring prices require explicit `purchase: "subscription"`; completed zero-payment purchases return `no_payment_due`, without claiming a charge occurred. Latest Stripe endive API uses `embedded_page` and `allowed_payment_method_types`.

Shared-account isolation: Payments does not set `client_reference_id`; Tollbooth’s legacy webhook interprets that field as a Tollbooth payment UUID. Payments uses its metadata reference exclusively.

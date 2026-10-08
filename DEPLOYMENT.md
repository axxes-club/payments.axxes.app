# AXXES Payments deployment

`payments.axxes.app` is the central checkout for AXXES products and services. This repository is independent of Tollbooth, which lets AXXES customers collect their own payments.

Runtime: Next.js standalone on Cloud Run `payments`, region `us-west1`, project `gravy-meta`. Artifact Registry: `ci-payments`. Runtime account: `payments-runtime@gravy-meta.iam.gserviceaccount.com`. Runtime configuration: dedicated Secret Manager secret `payments-env`, mounted at `/secrets/env`. No credentials are included in images or source control.

Cloud Build runs unit tests, lint, type checks and the production build inside Linux before publishing the image. Submit with `gcloud builds submit --config=cloudbuild.yaml --project=gravy-meta`; deploy the resulting image to the Payments service, mount the secret, and route `payments.axxes.app` through `axxes-lb` → `payments-be` → `payments-neg`. DNS A record points to `136.81.161.193`. TLS uses the existing active wildcard `*.axxes.app` certificate.

Required variables: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TEST_WEBHOOK_SECRET`, `PAYMENTS_API_KEY_LIVE`, `PAYMENTS_API_KEY_TEST`. Live and test API credentials must each contain at least 32 characters. Optional: `PAYMENTS_PRODUCTS` (product registry JSON; see README), `STRIPE_PORTAL_CONFIGURATION` / `STRIPE_TEST_PORTAL_CONFIGURATION` (billing portal configuration IDs). Both Stripe webhook endpoints must subscribe to `checkout.session.*`, `customer.subscription.*` and `invoice.paid` / `invoice.payment_failed`. The environment file must use POSIX-compatible `KEY=value` assignments. Webhook URLs for both environments: `https://payments.axxes.app/api/webhooks/stripe`.

Verify `/api/health` returns HTTP 200 and `ready:true`, then create and pay a sandbox checkout before sending customers live purchase links. `/api/health` validates configuration structure; actual provider connectivity requires a checkout/status request.

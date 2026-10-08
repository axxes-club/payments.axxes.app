# Central AXXES Checkout Implementation Plan

> Use superpowers:executing-plans inline; request one independent review before release.

**Goal:** Customers pay AXXES inside payments.axxes.app for a trusted product/service quote.
**Architecture:** Stripe is the authoritative payment record. Server-authenticated integrations create Embedded Checkout sessions; customer pages verify session ownership and status. No Connect accounts or Tollbooth dependency.
**Tech Stack:** Next.js 16.3.6, React 19.2.8, Stripe SDK and Embedded Checkout.
**Spec:** docs/superpowers/specs/2026-10-07-central-checkout-design.md

## Constraints and review focus
- No invented prices; caller-authenticated quote creation only.
- Reject wrong environment credentials, malformed amounts and provider sessions from other apps.
- Opaque customer checkout URLs are bearer purchase capabilities; no customer PII in public status responses.
- Idempotency is scoped to the provider/environment and immutable order/product identity.
- Paid status comes from Stripe, not a completion URL or callback.

## Task 1 — Payment boundary and API
- [ ] Write failing tests for authentication, quote validation, ownership, idempotency and unpaid completion.
- [ ] Implement server payment/session service and creation/status/webhook routes.
- [ ] Run full tests, lint and typecheck.

## Task 2 — Embedded buyer flow and release
- [ ] Implement branded landing, checkout and verified result pages.
- [ ] Configure keys/webhooks in a separate payments-env secret.
- [ ] Independent code review; fix important findings.
- [ ] Run Linux CI/build and live sandbox browser payment verification.
- [ ] Deploy separate Cloud Run runtime, configure domain, and smoke-test domain/API.
- [ ] Document integration and verified limits. Commit and report evidence.

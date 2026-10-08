import { test } from "node:test"
import assert from "node:assert/strict"
import { parseRegistry, resolveCaller, mayActFor, allowedReturnUrl, returnLink, signEvent, verifyEvent } from "../src/lib/products"
import { parseQuote, checkoutParams, ownsSubscription } from "../src/lib/payment-policy"
const A = "a".repeat(40), Q = "q".repeat(40), ADMIN = "x".repeat(40), S = "s".repeat(40)
const products = parseRegistry(JSON.stringify({
  afters: { name: "afters.am", keys: { live: A }, returnOrigins: ["https://afters.am"], events: { live: "https://afters.am/api/axxes-payments/events" }, eventSecret: S },
  qortr: { name: "Qortr", keys: { live: Q }, returnOrigins: ["https://qortr.app"] },
}))
test("registry rejects weak keys, non-origin return URLs and events without a secret", () => {
  assert.throws(() => parseRegistry(JSON.stringify({ a: { name: "A", keys: { live: "short" }, returnOrigins: [] } })))
  assert.throws(() => parseRegistry(JSON.stringify({ a: { name: "A", keys: {}, returnOrigins: ["https://a.app/path"] } })))
  assert.throws(() => parseRegistry(JSON.stringify({ a: { name: "A", keys: {}, returnOrigins: ["http://a.app"] } })))
  assert.throws(() => parseRegistry(JSON.stringify({ a: { name: "A", keys: {}, returnOrigins: [], events: { live: "https://a.app/e" } } })))
  assert.deepEqual(parseRegistry(undefined), {})
})
test("a product key acts only for its own product and only in its environment", () => {
  const caller = resolveCaller("Bearer " + A, "live", { live: ADMIN }, products)
  assert.deepEqual(caller, { admin: false, product: "afters" })
  assert.equal(mayActFor(caller!, "afters"), true)
  assert.equal(mayActFor(caller!, "qortr"), false)
  assert.equal(resolveCaller("Bearer " + A, "test", { live: ADMIN }, products), null)
  assert.equal(resolveCaller("Bearer " + "z".repeat(40), "live", { live: ADMIN }, products), null)
  const admin = resolveCaller("Bearer " + ADMIN, "live", { live: ADMIN }, products)
  assert.equal(mayActFor(admin!, "qortr"), true)
  assert.equal(mayActFor(admin!, undefined), false)
})
test("buyers return only to origins registered for the purchasing product", () => {
  assert.equal(allowedReturnUrl("https://afters.am/b/settings/billing", "afters", products), "https://afters.am/b/settings/billing")
  for (const url of ["https://qortr.app/x", "http://afters.am/x", "https://afters.am.evil.com/x", "https://user@afters.am/x", "javascript:alert(1)"])
    assert.equal(allowedReturnUrl(url, "afters", products), null, url)
  assert.equal(allowedReturnUrl("https://afters.am/x", "unknown", products), null)
  assert.equal(returnLink("https://afters.am/b?tab=1", "cs_test_1"), "https://afters.am/b?tab=1&axxes_checkout=cs_test_1")
})
test("event signatures verify, and reject tampering, other secrets and stale timestamps", () => {
  const body = JSON.stringify({ id: "evt_1" }), now = 1_800_000_000
  const header = signEvent(body, S, now)
  assert.equal(verifyEvent(body, header, S, 300, now + 10), true)
  assert.equal(verifyEvent(body + " ", header, S, 300, now), false)
  assert.equal(verifyEvent(body, header, "o".repeat(40), 300, now), false)
  assert.equal(verifyEvent(body, header, S, 300, now + 301), false)
  assert.equal(verifyEvent(body, null, S), false)
})
test("subscriptions carry product identity onto the Stripe subscription and allow a bounded trial", () => {
  const quote = parseQuote({ mode: "test", product: "afters", reference: "org-1", priceId: "price_abc123", purchase: "subscription", trialDays: 7, returnUrl: "https://afters.am/b" })
  const params = checkoutParams(quote)
  assert.equal(params.subscription_data?.metadata?.product, "afters")
  assert.equal(params.subscription_data?.metadata?.source, "axxes_payments")
  assert.equal(params.subscription_data?.trial_period_days, 7)
  assert.equal(params.metadata?.return_url, "https://afters.am/b")
  assert.throws(() => parseQuote({ mode: "test", product: "afters", reference: "o", amount: 100, description: "x", trialDays: 7 }))
  assert.throws(() => parseQuote({ mode: "test", product: "afters", reference: "o", priceId: "price_abc123", purchase: "subscription", trialDays: 90 }))
  assert.equal(checkoutParams(parseQuote({ mode: "test", product: "q", reference: "o", amount: 100, description: "x" })).subscription_data, undefined)
  assert.equal(ownsSubscription({ metadata: { source: "axxes_payments", product: "afters" } }), true)
  assert.equal(ownsSubscription({ metadata: { organizerProfileId: "x" } }), false)
})
test("lookup keys are confined to the purchasing product and must be resolved before checkout", () => {
  const base = { mode: "test", product: "vitrine", reference: "t-1", purchase: "subscription" }
  assert.equal(parseQuote({ ...base, lookupKey: "vitrine_collector_monthly" }).lookupKey, "vitrine_collector_monthly")
  assert.throws(() => parseQuote({ ...base, lookupKey: "afters_signature_30d" }))
  assert.throws(() => parseQuote({ ...base, lookupKey: "vitrine_collector_monthly", priceId: "price_abc123" }))
  assert.throws(() => checkoutParams({ ...base, lookupKey: "vitrine_collector_monthly" }))
})

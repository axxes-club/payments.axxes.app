import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
async function implementation() {
  try { return await import("../src/lib/payment-policy") }
  catch { assert.fail("Payment policy must exist") }
}
const quote = { mode: "test", product: "quill", reference: "order-123", description: "Approved service quote", amount: 100, currency: "usd", quantity: 1 }
test("server quote rejects buyer-style amounts and malformed product identity", async () => {
  const { parseQuote } = await implementation()
  assert.equal(parseQuote(quote).amount, 100)
  for (const patch of [{ amount: 0 }, { amount: 49 }, { amount: 1.5 }, { amount: "100" }, { quantity: 0 }, { mode: "other" }, { product: "../../admin" }, { reference: "" }, { currency: "xyz" }]) {
    assert.throws(() => parseQuote({ ...quote, ...patch }))
  }
})
test("live credentials cannot create sandbox purchases", async () => {
  const { authorized } = await implementation()
  assert.equal(authorized("Bearer "+"L".repeat(40), "test", { live: "L".repeat(40), test: "T".repeat(40) }), false)
  assert.equal(authorized("Bearer "+"T".repeat(40), "test", { live: "L".repeat(40), test: "T".repeat(40) }), true)
  assert.equal(authorized("Bearer ", "live", { live: "", test: "" }), false)
})
test("provider sessions from other AXXES apps are not exposed", async () => {
  const { ownsSession } = await implementation()
  assert.equal(ownsSession({ metadata: { source: "axxes_payments" }, ui_mode: "embedded_page" }), true)
  assert.equal(ownsSession({ metadata: { source: "tollbooth" }, ui_mode: "embedded_page" }), false)
  assert.equal(ownsSession({ metadata: { source: "axxes_payments" }, ui_mode: "hosted" }), false)
})
test("browser completion alone is not payment confirmation", async () => {
  const { paymentState } = await implementation()
  assert.equal(paymentState({ status: "complete", payment_status: "unpaid" }), "processing")
  assert.equal(paymentState({ status: "complete", payment_status: "paid" }), "paid")
  assert.equal(paymentState({ status: "expired", payment_status: "unpaid" }), "expired")
  assert.equal(paymentState({ status: "open", payment_status: "unpaid" }), "open")
})
test("server requests use embedded direct charges without merchant transfers", async () => {
  const { checkoutParams } = await implementation()
  const params = checkoutParams(quote)
  assert.equal(params.ui_mode, "embedded_page")
  assert.equal(params.redirect_on_completion, "never")
  assert.equal(params.metadata?.source, "axxes_payments")
  assert.equal(params.metadata?.reference, quote.reference)
  assert.deepEqual(params.allowed_payment_method_types, ["card"])
  assert.equal(params.payment_intent_data, undefined)
  assert.equal(params.line_items?.[0].price_data?.unit_amount, quote.amount)
})
test("subscriptions require a stored Stripe recurring price", async () => {
  const { parseQuote, checkoutParams } = await implementation()
  const request = { mode: "live", product: "office", reference: "subscription-1", priceId: "price_abc123", purchase: "subscription", quantity: 1 }
  assert.equal(checkoutParams(parseQuote(request)).mode, "subscription")
  assert.throws(() => parseQuote({ ...quote, purchase: "subscription" }))
})
test("idempotency keys have fixed length and scope to the environment and caller key", async () => {
  const { providerIdempotencyKey } = await implementation()
  const a = providerIdempotencyKey("request-one", "test", "T".repeat(40))
  assert.equal(a.length < 256, true)
  assert.notEqual(a, providerIdempotencyKey("request-one", "live", "T".repeat(40)))
  assert.notEqual(a, providerIdempotencyKey("request-one", "test", "L".repeat(40)))
  assert.equal(a, providerIdempotencyKey("request-one", "test", "T".repeat(40)))
  assert.equal(a.includes(createHash("sha256").update("request-one").digest("hex")), true)
})
test("zero-payment orders are confirmed without claiming money was paid", async () => {
  const { paymentState } = await implementation()
  assert.equal(paymentState({ status: "complete", payment_status: "no_payment_required" }), "no_payment_due")
})
test("AXXES order references cannot be mistaken for Tollbooth payment IDs", async () => {
  const { checkoutParams } = await implementation()
  const params = checkoutParams(quote)
  assert.equal(params.client_reference_id, undefined)
  assert.equal(params.metadata?.reference, quote.reference)
})

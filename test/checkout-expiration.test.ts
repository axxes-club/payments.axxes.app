import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expireCheckout } from '../src/lib/checkout-expiration';

test('expiration refuses another product before mutating Stripe', async () => {
  let expired = false;
  const client = { retrieve: async () => ({id:'cs_test_fixture',status:'open',ui_mode:'embedded_page',metadata:{source:'axxes_payments',product:'qortr'}}), expire: async () => { expired=true; } };
  await assert.rejects(expireCheckout(client as unknown as Parameters<typeof expireCheckout>[0], 'cs_test_fixture', {admin:false,product:'pulse'}), /unavailable/);
  assert.equal(expired,false);
});
test('completion winning expiration is returned for reconciliation', async () => {
  let reads=0;
  const client = { retrieve: async () => ({id:'cs_test_fixture',status:++reads===1?'open':'complete',ui_mode:'embedded_page',metadata:{source:'axxes_payments',product:'pulse'},subscription:'sub_fixture'}), expire: async () => {throw new Error('already complete');} };
  const result = await expireCheckout(client as unknown as Parameters<typeof expireCheckout>[0],'cs_test_fixture',{admin:false,product:'pulse'});
  assert.equal(result.status,'complete');
  assert.equal(result.subscription,'sub_fixture');
});
test('an unresolved expiration failure cannot allow replacement checkout', async () => {
  const client = { retrieve: async () => ({status:'open',ui_mode:'embedded_page',metadata:{source:'axxes_payments',product:'pulse'}}), expire: async () => {throw new Error('outage');} };
  await assert.rejects(expireCheckout(client as unknown as Parameters<typeof expireCheckout>[0],'cs_test_fixture',{admin:false,product:'pulse'}));
});

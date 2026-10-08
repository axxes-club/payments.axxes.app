import type Stripe from 'stripe';
import { ownsSession } from './payment-policy';
import { mayActFor, type Caller } from './products';
export async function expireCheckout(client: { retrieve(id: string): Promise<Stripe.Checkout.Session>; expire(id: string): Promise<Stripe.Checkout.Session> }, id: string, caller: Caller) {
  const current = await client.retrieve(id);
  if (!ownsSession(current) || !mayActFor(caller,current.metadata?.product)) throw new Error('Checkout unavailable');
  if (current.status !== 'open') return current;
  try { return await client.expire(id); }
  catch (error) {
    // A checkout can complete between retrieval and expiry. Only a confirmed terminal state
    // permits the caller to reconcile or replace it; an uncertain outage keeps its reservation.
    const latest = await client.retrieve(id);
    if (!ownsSession(latest) || !mayActFor(caller,latest.metadata?.product)) throw new Error('Checkout unavailable');
    if (latest.status !== 'open') return latest;
    throw error;
  }
}

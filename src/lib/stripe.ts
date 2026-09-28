import Stripe from 'stripe'

function createStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    // Return a placeholder during build time
    return null
  }
  return new Stripe(key)
}

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = createStripe()
  }
  if (!_stripe) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return _stripe
}

// Lazy stripe accessor
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getStripe() as any)[prop as string]
  },
})

// Fee constants
export const PLATFORM_FEE_PERCENTAGE = 0.10 // 10%
export const PLATFORM_FEE_FIXED_CENTS = 99 // $0.99 per ticket

export function calculateFees(subtotalCents: number, ticketCount: number) {
  // Free tickets have no fees - completely free
  if (subtotalCents === 0) {
    return {
      subtotal: 0,
      platformFee: 0,
      total: 0,
    }
  }

  const percentageFee = Math.round(subtotalCents * PLATFORM_FEE_PERCENTAGE)
  const fixedFee = PLATFORM_FEE_FIXED_CENTS * ticketCount
  const platformFee = percentageFee + fixedFee
  const total = subtotalCents + platformFee

  return {
    subtotal: subtotalCents,
    platformFee,
    total,
  }
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

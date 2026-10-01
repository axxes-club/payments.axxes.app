import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  isSignaturePlan,
  PLAN_LABELS,
  PLAN_STRIPE_INTERVAL,
  PLAN_PRICES,
} from "@/lib/subscription";
import { Plan } from "@prisma/client";

// Helper to get the app base URL from the request
function getBaseUrl(req: NextRequest): string {
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && !appUrl.includes("localhost")) return appUrl;

  const host = req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

// Map from our plan enum to a Stripe lookup key
function stripeLookupKey(plan: Plan): string {
  return `afters_signature_${plan.toLowerCase()}`;
}

// POST - Create checkout session for Signature subscription
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Which plan? Default to 30-day (monthly) with trial
  let body: { plan?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body = default plan
  }

  const requestedPlan = (body.plan as Plan) || "SIGNATURE_30D";

  // Validate plan
  const validPlans: Plan[] = ["SIGNATURE_30D", "SIGNATURE_180D", "SIGNATURE_360D"];
  if (!validPlans.includes(requestedPlan)) {
    return NextResponse.json(
      { error: "Invalid plan. Use SIGNATURE_30D, SIGNATURE_180D, or SIGNATURE_360D" },
      { status: 400 }
    );
  }

  const profile = await prisma.organizerProfile.findUnique({
    where: { userId },
    include: { user: { select: { email: true } }, subscription: true },
  });

  if (!profile) {
    return NextResponse.json(
      { error: "Organizer profile required" },
      { status: 404 }
    );
  }

  // Already on an active Signature plan?
  if (
    profile.subscription &&
    isSignaturePlan(profile.subscription.plan) &&
    (profile.subscription.status === "ACTIVE" ||
      profile.subscription.status === "TRIALING")
  ) {
    return NextResponse.json(
      { error: "Already on a Signature plan" },
      { status: 400 }
    );
  }

  try {
    // Get or create Stripe customer
    let customerId = profile.subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.user.email,
        metadata: {
          organizerProfileId: profile.id,
          userId,
        },
      });
      customerId = customer.id;
    }

    // Get or create the Stripe price for this plan
    const lookupKey = stripeLookupKey(requestedPlan);
    const intervalConfig = PLAN_STRIPE_INTERVAL[requestedPlan];
    const unitAmount = PLAN_PRICES[requestedPlan];

    if (!intervalConfig || !unitAmount) {
      return NextResponse.json({ error: "Plan config missing" }, { status: 500 });
    }

    // Try env var first (e.g. STRIPE_PRICE_SIGNATURE_30D)
    const envKey = `STRIPE_PRICE_${requestedPlan}`;
    let priceId = process.env[envKey];

    if (!priceId) {
      // Search by lookup key
      const existingPrices = await stripe.prices.list({
        lookup_keys: [lookupKey],
        active: true,
        limit: 1,
      });

      if (existingPrices.data.length > 0) {
        priceId = existingPrices.data[0].id;
      }
    }

    if (!priceId) {
      // Find or create product
      const existingProducts = await stripe.products.search({
        query: "name:'Afters Signature'",
      });

      let productId: string;
      if (existingProducts.data.length > 0) {
        productId = existingProducts.data[0].id;
      } else {
        const product = await stripe.products.create({
          name: "Afters Signature",
          description:
            "Priority placement, reduced fees, staff management, and more",
        });
        productId = product.id;
      }

      // Create price with lookup key
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: unitAmount,
        currency: "usd",
        recurring: {
          interval: intervalConfig.interval,
          interval_count: intervalConfig.interval_count,
        },
        lookup_key: lookupKey,
      });

      priceId = price.id;
      console.log(
        `Created Stripe Price: ${price.id} for ${requestedPlan} (${lookupKey})`
      );
    }

    // Check if this user has ever had a trial before
    const hadTrial = profile.subscription?.plan === "SIGNATURE_TRIAL_7D" ||
      (profile.subscription?.trialEndsAt !== null && profile.subscription?.trialEndsAt !== undefined);

    const baseUrl = getBaseUrl(req);

    const sessionConfig = {
      customer: customerId,
      payment_method_types: ["card" as const],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription" as const,
      subscription_data: {
        metadata: {
          organizerProfileId: profile.id,
          plan: requestedPlan,
        },
        // Only offer 7-day trial for monthly plan and if they haven't had one
        ...(requestedPlan === "SIGNATURE_30D" && !hadTrial
          ? { trial_period_days: 7 }
          : {}),
      },
      success_url: `${baseUrl}/d/settings?subscription=success`,
      cancel_url: `${baseUrl}/d/settings?subscription=cancelled`,
      metadata: {
        organizerProfileId: profile.id,
        userId,
        plan: requestedPlan,
      },
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe subscription error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

// GET - Get current subscription status
export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.organizerProfile.findUnique({
    where: { userId },
    include: { subscription: true },
  });

  if (!profile) {
    return NextResponse.json(
      { error: "No organizer profile" },
      { status: 404 }
    );
  }

  const sub = profile.subscription;

  return NextResponse.json({
    plan: sub?.plan || "FREE",
    status: sub?.status || "ACTIVE",
    label: PLAN_LABELS[sub?.plan || "FREE"],
    isSignature: sub ? isSignaturePlan(sub.plan) : false,
    trialEndsAt: sub?.trialEndsAt,
    currentPeriodEnd: sub?.currentPeriodEnd,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd || false,
  });
}

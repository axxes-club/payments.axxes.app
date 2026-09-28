import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.organizerProfile.findUnique({
    where: { userId },
    include: { subscription: true },
  });

  if (!profile?.subscription?.stripeSubscriptionId) {
    return NextResponse.json(
      { error: "No active subscription" },
      { status: 400 }
    );
  }

  // Cancel at period end (don't immediately cancel)
  await stripe.subscriptions.update(
    profile.subscription.stripeSubscriptionId,
    {
      cancel_at_period_end: true,
    }
  );

  await prisma.subscription.update({
    where: { id: profile.subscription.id },
    data: { cancelAtPeriodEnd: true },
  });

  return NextResponse.json({ success: true });
}

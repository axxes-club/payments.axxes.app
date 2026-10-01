import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"

// Sync Stripe account status from Stripe API
export async function POST() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const profile = await prisma.organizerProfile.findUnique({
      where: { userId },
    })

    if (!profile?.stripeAccountId) {
      return NextResponse.json(
        { message: "No Stripe account found" },
        { status: 400 }
      )
    }

    // Fetch current status from Stripe
    const account = await stripe.accounts.retrieve(profile.stripeAccountId)

    // Update our database with the latest status
    const updatedProfile = await prisma.organizerProfile.update({
      where: { userId },
      data: {
        stripeOnboardingComplete: account.details_submitted ?? false,
        stripeChargesEnabled: account.charges_enabled ?? false,
        stripePayoutsEnabled: account.payouts_enabled ?? false,
      },
    })

    return NextResponse.json({
      stripeOnboardingComplete: updatedProfile.stripeOnboardingComplete,
      stripeChargesEnabled: updatedProfile.stripeChargesEnabled,
      stripePayoutsEnabled: updatedProfile.stripePayoutsEnabled,
    })
  } catch (error) {
    console.error("Error syncing Stripe status:", error)
    return NextResponse.json(
      { message: "Failed to sync Stripe status" },
      { status: 500 }
    )
  }
}

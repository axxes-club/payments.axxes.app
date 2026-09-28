import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"

export async function POST() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    let profile = await prisma.organizerProfile.findUnique({
      where: { userId },
      include: { user: { select: { email: true } } },
    })

    if (!profile) {
      return NextResponse.json(
        { message: "Organizer profile not found" },
        { status: 404 }
      )
    }

    // Create Stripe account if it doesn't exist
    let stripeAccountId = profile.stripeAccountId
    if (!stripeAccountId) {
      const stripeAccount = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: profile.user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        settings: {
          payouts: {
            schedule: {
              interval: "daily",
            },
          },
        },
      })
      
      stripeAccountId = stripeAccount.id
      
      // Update profile with the new Stripe account ID
      profile = await prisma.organizerProfile.update({
        where: { userId },
        data: { stripeAccountId },
        include: { user: { select: { email: true } } },
      })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${baseUrl}/d/settings/payouts?refresh=true`,
      return_url: `${baseUrl}/d/settings/payouts?success=true`,
      type: "account_onboarding",
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (error) {
    console.error("Error creating account link:", error)
    return NextResponse.json(
      { message: "Failed to create onboarding link" },
      { status: 500 }
    )
  }
}

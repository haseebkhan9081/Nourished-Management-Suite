import { NextResponse } from "next/server"
import Stripe from "stripe"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST /api/stripe/sync-donors
// Body: { startDate?: "YYYY-MM-DD", endDate?: "YYYY-MM-DD" }
// Fetches every succeeded Stripe charge in the window (default: last 24 months),
// resolves the customer object so we have email/name/address, then posts the
// batch to the backend's /receipt/stripe-bulk-upsert endpoint which handles
// the actual DB write. This covers both one-off donations and subscription
// invoices (Stripe issues a charge for each subscription payment).

interface SyncBody {
  startDate?: string
  endDate?: string
}

export async function POST(request: Request) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!stripeSecret) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not configured" }, { status: 500 })
  }
  if (!apiBase) {
    return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE_URL not configured" }, { status: 500 })
  }

  let body: SyncBody = {}
  try {
    body = await request.json()
  } catch {
    /* empty body is fine */
  }

  // Default window: last 24 months so recurring subs are covered end-to-end.
  const now = new Date()
  const defaultStart = new Date(now.getFullYear() - 2, now.getMonth(), 1)
  const start = body.startDate ? new Date(body.startDate) : defaultStart
  const end = body.endDate ? new Date(body.endDate) : now
  const startTs = Math.floor(start.getTime() / 1000)
  const endTs = Math.floor(end.getTime() / 1000)

  const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" })

  // Pull every succeeded charge, expanding the customer so we have email +
  // name without a second round-trip per charge.
  interface ChargePayload {
    paymentIntentId: string
    amount: number
    amountRefunded: number
    fullyRefunded: boolean
    date: string
    email: string | null
    name: string | null
    phone: string | null
    city: string | null
    country: string | null
    postalCode: string | null
    subscriptionId: string | null
    customerId: string | null
    purpose: string | null
  }

  const charges: ChargePayload[] = []
  let totalFetched = 0
  let skippedNoPI = 0
  let skippedNonUsd = 0

  try {
    for await (const charge of stripe.charges.list({
      limit: 100,
      created: { gte: startTs, lte: endTs },
      expand: ["data.customer"],
    })) {
      totalFetched++
      if (charge.status !== "succeeded") continue
      if (charge.currency !== "usd") {
        skippedNonUsd++
        continue
      }
      if (!charge.payment_intent || typeof charge.payment_intent !== "string") {
        skippedNoPI++
        continue
      }

      const cust = charge.customer as Stripe.Customer | string | null
      const custObj = typeof cust === "object" && cust ? cust : null
      const custId = custObj?.id ?? (typeof cust === "string" ? cust : null)

      const email = custObj?.email ?? charge.billing_details?.email ?? charge.receipt_email ?? null
      const name = custObj?.name ?? charge.billing_details?.name ?? null
      const phone = custObj?.phone ?? charge.billing_details?.phone ?? null

      // Address: prefer customer.address, fall back to billing_details.address.
      const addr = custObj?.address ?? charge.billing_details?.address ?? null
      const city = addr?.city ?? null
      const country = addr?.country ?? null
      const postalCode = addr?.postal_code ?? null

      // Subscription ID comes from invoice → subscription link. For charges
      // tied to a subscription invoice, charge.invoice is an invoice id. We
      // could expand invoice.subscription but that's another expand; skip for
      // now unless the backend stores subscription_id already.
      const subscriptionId =
        typeof charge.invoice === "string" ? null : charge.invoice?.subscription as string | null

      const grossCents = charge.amount
      const refundedCents = charge.amount_refunded ?? 0
      // Donation form on the public site writes the category into
      // charge.metadata.purposeOfDonation ("Zakat" | "Sadaqah" | "General Fund"
      // | …). Older charges predate this field — those stay null.
      const purposeRaw = charge.metadata?.purposeOfDonation ?? null

      charges.push({
        paymentIntentId: charge.payment_intent,
        // Store the gross amount — we track refund separately so the UI can
        // compute net on demand and filter fully-refunded rows out of donor
        // search without losing the historical record.
        amount: grossCents / 100,
        amountRefunded: refundedCents / 100,
        fullyRefunded: refundedCents >= grossCents,
        date: new Date(charge.created * 1000).toISOString(),
        email,
        name,
        phone,
        city,
        country,
        postalCode,
        subscriptionId: subscriptionId ?? null,
        customerId: custId,
        purpose: purposeRaw,
      })
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: `Stripe fetch failed: ${err?.message ?? err}` },
      { status: 502 },
    )
  }

  if (charges.length === 0) {
    return NextResponse.json({
      message: "No Stripe charges found in range",
      fetched: totalFetched,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    })
  }

  // Forward to backend in batches so very large windows don't time out a
  // single request.
  const BATCH_SIZE = 200
  let inserted = 0
  let updatedFilled = 0
  let unchanged = 0
  let failed = 0

  for (let i = 0; i < charges.length; i += BATCH_SIZE) {
    const batch = charges.slice(i, i + BATCH_SIZE)
    const res = await fetch(`${apiBase}/receipt/stripe-bulk-upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ charges: batch }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      return NextResponse.json(
        {
          error: `Backend upsert failed on batch ${i / BATCH_SIZE + 1}: ${errBody.error ?? res.statusText}`,
          partialProgress: { inserted, updatedFilled, unchanged, failed },
        },
        { status: 502 },
      )
    }
    const data = await res.json()
    inserted += data.inserted ?? 0
    updatedFilled += data.updatedFilled ?? 0
    unchanged += data.unchanged ?? 0
    failed += data.failed ?? 0
  }

  return NextResponse.json({
    message: "Stripe sync complete",
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    fetched: totalFetched,
    eligible: charges.length,
    skippedNoPaymentIntent: skippedNoPI,
    skippedNonUsd,
    inserted,
    updatedFilled,
    unchanged,
    failed,
  })
}

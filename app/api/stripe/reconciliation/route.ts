import { NextResponse } from "next/server"
import Stripe from "stripe"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/stripe/reconciliation?start=YYYY-MM-DD&end=YYYY-MM-DD
// Reads every succeeded Stripe charge in the window, cross-references against
// the backend payment table via payment_intent_id, and returns counts so the
// admin can sanity-check data integrity before/after running a sync.

export async function GET(request: Request) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!stripeSecret) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not configured" }, { status: 500 })
  }
  if (!apiBase) {
    return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE_URL not configured" }, { status: 500 })
  }

  const url = new URL(request.url)
  const startParam = url.searchParams.get("start")
  const endParam = url.searchParams.get("end")

  const now = new Date()
  const defaultStart = new Date(now.getFullYear() - 2, now.getMonth(), 1)
  const start = startParam ? new Date(startParam) : defaultStart
  const end = endParam ? new Date(endParam) : now
  const startTs = Math.floor(start.getTime() / 1000)
  const endTs = Math.floor(end.getTime() / 1000)

  // ── Stripe side ─────────────────────────────────────────────────────────
  // We expand balance_transaction so we can compute the true payout (net of
  // Stripe's processing fee). The receipt to the donor still shows what THEY
  // paid (gross) — the payout figure is for internal reconciliation against
  // bank deposits.
  const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" })
  const stripePiIds = new Set<string>()
  let totalCharges = 0
  let succeededCharges = 0
  let nonUsdSkipped = 0
  let noPiSkipped = 0
  let totalGrossCents = 0      // what donors paid (less refunds) — the receipt amount
  let totalPayoutCents = 0     // what Nourished received after Stripe fees
  let totalFeesCents = 0       // Stripe processing fees

  try {
    for await (const charge of stripe.charges.list({
      limit: 100,
      created: { gte: startTs, lte: endTs },
      expand: ["data.balance_transaction"],
    })) {
      totalCharges++
      if (charge.status !== "succeeded") continue
      succeededCharges++
      if (charge.currency !== "usd") {
        nonUsdSkipped++
        continue
      }
      if (!charge.payment_intent || typeof charge.payment_intent !== "string") {
        noPiSkipped++
        continue
      }
      stripePiIds.add(charge.payment_intent)
      const refundedCents = charge.amount_refunded ?? 0
      const gross = charge.amount - refundedCents
      totalGrossCents += gross

      const bt = charge.balance_transaction as Stripe.BalanceTransaction | null
      if (bt && typeof bt === "object") {
        // bt.net is net of fees for the full amount; if there are refunds we
        // subtract their processor-refunded portion. Stripe typically does
        // NOT refund fees, so a partial refund of $X reduces net by $X.
        const netCents = bt.net - refundedCents
        const feeCents = bt.fee
        totalPayoutCents += netCents
        totalFeesCents += feeCents
      } else {
        // Fallback: if balance_transaction didn't expand, treat payout as
        // gross (slightly optimistic but keeps the page from breaking).
        totalPayoutCents += gross
      }
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: `Stripe fetch failed: ${err?.message ?? err}` },
      { status: 502 },
    )
  }

  // ── DB side ─────────────────────────────────────────────────────────────
  // Ask backend for payment rows in the same window. We need the full set of
  // payment_intent_ids plus which of those have complete donor info.
  let dbPayments: Array<{ paymentIntentId: string; hasDonorInfo: boolean; amount: number }> = []
  try {
    const res = await fetch(
      `${apiBase}/receipt/stripe-intents-in-range?start=${encodeURIComponent(
        start.toISOString(),
      )}&end=${encodeURIComponent(end.toISOString())}`,
    )
    if (!res.ok) throw new Error(`Backend returned ${res.status}`)
    const data = await res.json()
    dbPayments = data.payments ?? []
  } catch (err: any) {
    return NextResponse.json(
      { error: `Backend lookup failed: ${err?.message ?? err}` },
      { status: 502 },
    )
  }

  const dbPiIdSet = new Set(dbPayments.map((p) => p.paymentIntentId))
  const dbComplete = dbPayments.filter((p) => p.hasDonorInfo).length
  const dbIncomplete = dbPayments.length - dbComplete

  const missingFromDb: string[] = []
  for (const pi of stripePiIds) {
    if (!dbPiIdSet.has(pi)) missingFromDb.push(pi)
  }

  const extraInDb: string[] = []
  for (const pi of dbPiIdSet) {
    if (!stripePiIds.has(pi)) extraInDb.push(pi)
  }

  return NextResponse.json({
    window: {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    },
    stripe: {
      totalCharges,
      succeededCharges,
      eligibleForSync: stripePiIds.size,
      nonUsdSkipped,
      noPiSkipped,
      totalUsd: (totalGrossCents / 100).toFixed(2),
      // Split out so the UI can show donor-paid vs. what actually landed in
      // the bank account after Stripe fees.
      donorPaidUsd: (totalGrossCents / 100).toFixed(2),
      payoutUsd: (totalPayoutCents / 100).toFixed(2),
      feesUsd: (totalFeesCents / 100).toFixed(2),
    },
    db: {
      stripeIntentsInRange: dbPayments.length,
      withDonorInfo: dbComplete,
      missingDonorInfo: dbIncomplete,
    },
    gap: {
      missingFromDb: missingFromDb.length,
      extraInDb: extraInDb.length,
      missingSample: missingFromDb.slice(0, 10),
      extraSample: extraInDb.slice(0, 10),
    },
  })
}

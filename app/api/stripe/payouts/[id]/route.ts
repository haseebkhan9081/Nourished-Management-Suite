import { NextResponse } from "next/server"
import Stripe from "stripe"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function deriveNameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const local = email.split("@")[0]
  if (!local) return null
  const cleaned = local
    .replace(/\+.*$/, "")
    .replace(/[0-9]+$/, "")
    .replace(/[._-]+/g, " ")
    .trim()
  if (!cleaned) return null
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 500 })
  }

  const stripe = new Stripe(secret, { apiVersion: "2024-06-20" })

  try {
    const payout = await stripe.payouts.retrieve(id)

    // Pull every balance transaction that was bundled into this payout
    const charges: Array<{
      id: string
      created: string
      gross: number
      fee: number
      net: number
      type: string
      typeLabel: string
      description: string | null
      donorName: string | null
      donorEmail: string | null
      nameDerived: boolean
      chargeId: string | null
    }> = []

    let grossSum = 0
    let feeSum = 0
    let netSum = 0
    let chargeCount = 0
    let refundCount = 0

    // Cache charge lookups to avoid N+1 when multiple refunds point to same charge
    const chargeCache = new Map<string, Stripe.Charge>()
    async function getCharge(chargeId: string): Promise<Stripe.Charge | null> {
      if (chargeCache.has(chargeId)) return chargeCache.get(chargeId)!
      try {
        const c = await stripe.charges.retrieve(chargeId)
        chargeCache.set(chargeId, c)
        return c
      } catch {
        return null
      }
    }

    for await (const bt of stripe.balanceTransactions.list({
      payout: id,
      limit: 100,
      expand: ["data.source"],
    })) {
      // Skip the payout line itself — it represents the money leaving Stripe
      // and would double-count if shown in a drill-down of that same payout.
      if (bt.type === "payout") continue

      const src = bt.source as any
      let donorName: string | null = null
      let donorEmail: string | null = null
      let chargeId: string | null = null

      if (src && typeof src === "object") {
        if (src.object === "charge") {
          chargeId = src.id
          donorEmail =
            src.billing_details?.email ??
            (typeof src.customer === "object" ? src.customer?.email : null) ??
            null
          donorName =
            src.billing_details?.name ??
            (typeof src.customer === "object" ? src.customer?.name : null) ??
            null
        } else if (src.object === "refund") {
          // Resolve donor by fetching the original charge
          const refundChargeId = typeof src.charge === "string" ? src.charge : src.charge?.id ?? null
          chargeId = refundChargeId
          if (refundChargeId) {
            const originalCharge = await getCharge(refundChargeId)
            if (originalCharge) {
              donorEmail =
                originalCharge.billing_details?.email ??
                (typeof originalCharge.customer === "object" ? (originalCharge.customer as any)?.email : null) ??
                null
              donorName =
                originalCharge.billing_details?.name ??
                (typeof originalCharge.customer === "object" ? (originalCharge.customer as any)?.name : null) ??
                null
            }
          }
        }
      }

      let nameDerived = false
      if (!donorName && donorEmail) {
        const d = deriveNameFromEmail(donorEmail)
        if (d) {
          donorName = d
          nameDerived = true
        }
      }

      // Summary counters
      if (bt.type === "charge") {
        chargeCount++
        grossSum += bt.amount
        feeSum += bt.fee
        netSum += bt.net
      } else if (bt.type === "refund" || bt.type === "payment_refund") {
        refundCount++
        netSum += bt.net
        feeSum += bt.fee
      }

      // Human-readable type label + classification bucket
      const typeLabel = (() => {
        switch (bt.type) {
          case "charge": return "Donation"
          case "refund":
          case "payment_refund": return "Refund"
          case "adjustment": return "Adjustment"
          case "stripe_fee": return "Stripe Fee"
          case "application_fee": return "App Fee"
          case "transfer": return "Transfer"
          case "dispute": return "Dispute"
          case "dispute_reversal": return "Dispute Reversal"
          case "payout_minimum_balance_hold": return "Reserve Hold"
          case "payout_minimum_balance_release": return "Reserve Release"
          case "reserve_transaction": return "Reserve"
          default: return bt.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
        }
      })()

      // Classification bucket — tells the UI whether a row matters or is noise
      const bucket = (() => {
        if (bt.type === "charge") return "donation"
        if (bt.type === "refund" || bt.type === "payment_refund") return "refund"
        if (bt.type === "dispute" || bt.type === "dispute_reversal") return "dispute"
        if (
          bt.type === "payout_minimum_balance_hold" ||
          bt.type === "payout_minimum_balance_release" ||
          bt.type === "reserve_transaction"
        ) return "accounting"
        return "other"
      })()

      charges.push({
        id: bt.id,
        created: new Date(bt.created * 1000).toISOString(),
        gross: bt.amount / 100,
        fee: bt.fee / 100,
        net: bt.net / 100,
        type: bt.type,
        typeLabel,
        bucket,
        description: bt.description ?? null,
        donorName,
        donorEmail,
        nameDerived,
        chargeId,
      })
    }

    // Breakdown totals by bucket for the summary cards
    const breakdown = {
      donations:  { count: 0, gross: 0, fees: 0, net: 0 },
      refunds:    { count: 0, net: 0 },
      disputes:   { count: 0, net: 0 },
      accounting: { count: 0, net: 0 },
      other:      { count: 0, net: 0 },
    }
    for (const c of charges) {
      if (c.bucket === "donation") {
        breakdown.donations.count++
        breakdown.donations.gross += c.gross
        breakdown.donations.fees += c.fee
        breakdown.donations.net += c.net
      } else if (c.bucket === "refund") {
        breakdown.refunds.count++
        breakdown.refunds.net += c.net
      } else if (c.bucket === "dispute") {
        breakdown.disputes.count++
        breakdown.disputes.net += c.net
      } else if (c.bucket === "accounting") {
        breakdown.accounting.count++
        breakdown.accounting.net += c.net
      } else {
        breakdown.other.count++
        breakdown.other.net += c.net
      }
    }

    const traceValue =
      (payout as any).trace_id?.value ??
      (payout as any).trace_id ??
      null

    return NextResponse.json({
      id: payout.id,
      amount: payout.amount / 100,
      currency: payout.currency,
      arrivalDate: new Date(payout.arrival_date * 1000).toISOString(),
      created: new Date(payout.created * 1000).toISOString(),
      status: payout.status,
      method: payout.method,
      statementDescriptor: payout.statement_descriptor ?? null,
      traceId: typeof traceValue === "string" ? traceValue : null,
      summary: {
        chargeCount,
        refundCount,
        gross: grossSum / 100,
        fees: feeSum / 100,
        net: netSum / 100,
      },
      breakdown,
      charges: charges.sort((a, b) => {
        // Donations first (biggest first), then refunds, disputes, accounting, other
        const order = { donation: 0, refund: 1, dispute: 2, other: 3, accounting: 4 }
        const oa = order[a.bucket as keyof typeof order] ?? 99
        const ob = order[b.bucket as keyof typeof order] ?? 99
        if (oa !== ob) return oa - ob
        return Math.abs(b.gross) - Math.abs(a.gross)
      }),
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: "Stripe fetch failed", message: err?.message ?? String(err) },
      { status: 502 }
    )
  }
}

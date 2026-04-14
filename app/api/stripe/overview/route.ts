import { NextResponse } from "next/server"
import Stripe from "stripe"

// Cache the result in-memory for 5 minutes. All-time aggregation hits the
// Stripe API hard, so we don't want to redo it on every page load.
type CachedOverview = {
  fetchedAt: number
  data: unknown
}
let cache: CachedOverview | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

export const dynamic = "force-dynamic"
export const maxDuration = 60 // seconds — all-time pull can be slow

// Derive a display name from an email address when Stripe has no name on file.
// "john.smith@gmail.com" -> "John Smith"
// "najeeb_hashmi92@yahoo.com" -> "Najeeb Hashmi"
// "zakihass@gmail.com" -> "Zakihass" (best-effort single word)
function deriveNameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const local = email.split("@")[0]
  if (!local) return null
  const cleaned = local
    .replace(/\+.*$/, "")        // strip "+tag" aliases
    .replace(/[0-9]+$/, "")      // strip trailing digits
    .replace(/[._-]+/g, " ")     // separators -> space
    .trim()
  if (!cleaned) return null
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const bust = url.searchParams.get("refresh") === "1"

  if (!bust && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ ...cache.data, cached: true })
  }

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 500 })
  }

  const stripe = new Stripe(secret, { apiVersion: "2024-06-20" })

  // ── Pull all successful charges (paginated, all-time) ────────────────────
  let grossCents = 0
  let feesCents = 0
  let netCents = 0
  let chargeCount = 0
  let refundedCount = 0
  let refundedCents = 0
  const monthly: Record<string, { gross: number; net: number; count: number }> = {}
  const donors: Record<
    string,
    { name: string | null; email: string | null; totalCents: number; count: number; nameDerived: boolean }
  > = {}
  const cardBrands: Record<string, number> = {}
  const countries: Record<string, number> = {}

  try {
    for await (const charge of stripe.charges.list({
      limit: 100,
      expand: ["data.customer", "data.balance_transaction"],
    })) {
      if (charge.status !== "succeeded") continue

      chargeCount++
      grossCents += charge.amount

      const bt = charge.balance_transaction as Stripe.BalanceTransaction | null
      if (bt && typeof bt === "object") {
        feesCents += bt.fee
        netCents += bt.net
      }

      if (charge.amount_refunded > 0) {
        refundedCount++
        refundedCents += charge.amount_refunded
      }

      // Monthly
      const ym = new Date(charge.created * 1000).toISOString().slice(0, 7)
      if (!monthly[ym]) monthly[ym] = { gross: 0, net: 0, count: 0 }
      monthly[ym].gross += charge.amount / 100
      monthly[ym].net += (bt?.net ?? charge.amount) / 100
      monthly[ym].count++

      // Donor aggregation
      const cust = charge.customer as Stripe.Customer | string | null
      const custId =
        typeof cust === "string"
          ? cust
          : cust?.id ?? charge.billing_details?.email ?? `anon-${charge.id}`
      const custName =
        typeof cust === "object" && cust
          ? cust.name ?? charge.billing_details?.name ?? null
          : charge.billing_details?.name ?? null
      const custEmail =
        typeof cust === "object" && cust
          ? cust.email ?? charge.billing_details?.email ?? null
          : charge.billing_details?.email ?? null

      if (!donors[custId]) {
        let finalName = custName
        let nameDerived = false
        if (!finalName) {
          const derived = deriveNameFromEmail(custEmail)
          if (derived) {
            finalName = derived
            nameDerived = true
          }
        }
        donors[custId] = {
          name: finalName,
          email: custEmail,
          totalCents: 0,
          count: 0,
          nameDerived,
        }
      }
      donors[custId].totalCents += charge.amount
      donors[custId].count++

      // Card brand
      const brand = charge.payment_method_details?.card?.brand ?? "other"
      cardBrands[brand] = (cardBrands[brand] || 0) + 1

      // Country
      const country = charge.billing_details?.address?.country ?? "unknown"
      countries[country] = (countries[country] || 0) + 1
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: "Stripe fetch failed", message: err?.message ?? String(err) },
      { status: 502 }
    )
  }

  // ── Recurring donors + MRR ────────────────────────────────────────────────
  // Count all non-terminal subscriptions — active, trialing, and past_due are
  // all "still a donor." Canceled/incomplete/unpaid are excluded.
  let recurringCount = 0
  let mrrCents = 0
  const recurringCustomers = new Set<string>()
  const subscriptionsByStatus: Record<string, number> = {}
  try {
    for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) {
      subscriptionsByStatus[sub.status] = (subscriptionsByStatus[sub.status] || 0) + 1
      // Exclude terminal / stuck statuses
      if (
        sub.status === "canceled" ||
        sub.status === "incomplete" ||
        sub.status === "incomplete_expired" ||
        sub.status === "unpaid"
      ) continue

      recurringCount++
      const custId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id
      if (custId) recurringCustomers.add(custId)

      for (const item of sub.items.data) {
        const price = item.price
        if (!price.unit_amount) continue
        const interval = price.recurring?.interval
        const count = price.recurring?.interval_count ?? 1
        let monthlyEquivalent = price.unit_amount * (item.quantity ?? 1)
        if (interval === "year") monthlyEquivalent = monthlyEquivalent / (12 * count)
        else if (interval === "week") monthlyEquivalent = monthlyEquivalent * (52 / 12 / count)
        else if (interval === "day") monthlyEquivalent = monthlyEquivalent * (30 / count)
        else if (interval === "month") monthlyEquivalent = monthlyEquivalent / count
        mrrCents += monthlyEquivalent
      }
    }
  } catch {
    // Subscriptions fetch is best-effort; don't fail the whole page
  }

  // ── Top donors ───────────────────────────────────────────────────────────
  const topDonors = Object.entries(donors)
    .map(([id, d]) => ({
      id,
      name: d.name,
      email: d.email,
      total: d.totalCents / 100,
      count: d.count,
      nameDerived: d.nameDerived,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  const monthlyArr = Object.entries(monthly)
    .map(([ym, v]) => ({ ym, gross: v.gross, net: v.net, count: v.count }))
    .sort((a, b) => a.ym.localeCompare(b.ym))

  const cardBrandArr = Object.entries(cardBrands)
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count)

  const countryArr = Object.entries(countries)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)

  const data = {
    currency: "usd",
    asOf: new Date().toISOString(),
    gross: grossCents / 100,
    fees: feesCents / 100,
    net: netCents / 100,
    chargeCount,
    refundedCount,
    refundedTotal: refundedCents / 100,
    refundRate: chargeCount > 0 ? refundedCount / chargeCount : 0,
    activeSubscriptions: recurringCount,
    uniqueRecurringDonors: recurringCustomers.size,
    subscriptionsByStatus,
    mrr: mrrCents / 100,
    avgDonation: chargeCount > 0 ? grossCents / 100 / chargeCount : 0,
    uniqueDonors: Object.keys(donors).length,
    topDonors,
    monthly: monthlyArr,
    cardBrands: cardBrandArr,
    countries: countryArr,
    cached: false,
  }

  cache = { fetchedAt: Date.now(), data }
  return NextResponse.json(data)
}

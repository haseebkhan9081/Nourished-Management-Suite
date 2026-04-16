import { NextResponse } from "next/server"
import Stripe from "stripe"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DonorRow {
  id: string
  name: string
  email: string | null
  monthly: Record<string, number>  // "YYYY-MM" -> amount
  total: number
}

interface Section {
  name: string
  note?: string
  donors: DonorRow[]
  sectionTotals: Record<string, number>
  sectionTotal: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function monthKey(d: Date) {
  return d.toISOString().slice(0, 7) // "2026-04"
}

function enumerateMonths(start: string, end: string): string[] {
  // inclusive, "YYYY-MM" strings
  const [sy, sm] = start.split("-").map(Number)
  const [ey, em] = end.split("-").map(Number)
  const months: string[] = []
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

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
  return cleaned.split(/\s+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
}

// Classify a bank transaction's details field into (section, donorName)
function classifyBankRow(details: string): { section: string; donor: string } | null {
  const d = (details ?? "").toUpperCase()
  // Exclude outflows and Stripe transfers (Stripe donors come from API, not bank)
  if (d.includes("STRIPE")) return null
  if (d.includes("WT ") && d.includes("UNITED BANK")) return null
  if (d.includes("XOOM") || d.includes("RMTLY") || d.includes("REMITLY")) return null
  if (d.includes("ZELLE TO")) return null
  if (d.includes("PURCHASE AUTHORIZED") || d.includes("WITHDRAWAL")) return null
  if (d.includes("HARLAND CLARKE")) return null
  if (d.includes("WIRE TRANS SVC CHARGE")) return null

  // Corporate / Platform giving — lump sum, no donor breakdown
  if (d.includes("AMER ONLINE GIV") || d.includes("REF*TN*") || d.includes("CYBERGRANT") || d.includes("BENEV")) {
    return { section: "Corporate / Platform (AOG + Benevity + CyberGrants)", donor: "Benevity Batch (pending breakdown)" }
  }

  // Named direct transfers — "ONLINE TRANSFER FROM X", "Transfer in Branch - From X"
  const onlineFrom = details.match(/ONLINE TRANSFER FROM (.+?)(?:\s+REF\b|\s+EVERYDAY\b|\s*$)/i)
  if (onlineFrom) {
    const name = onlineFrom[1].trim().replace(/\s+/g, " ")
    return { section: "Wells Fargo — Named Donors", donor: titleCase(name) }
  }
  const branchFrom = details.match(/Transfer in Branch - From (.+?)(?:\s+DDA\b|\s*$)/i)
  if (branchFrom) {
    const name = branchFrom[1].trim().replace(/\s+/g, " ")
    return { section: "Wells Fargo — Named Donors", donor: titleCase(name) }
  }
  const zelleFrom = details.match(/ZELLE FROM (.+?)(?:\s+ON\s+\d|\s*$)/i)
  if (zelleFrom) {
    const name = zelleFrom[1].trim().replace(/\s+/g, " ")
    return { section: "Wells Fargo — Named Donors", donor: titleCase(name) }
  }

  // Check deposits — unknown donor
  if (d.includes("MOBILE DEPOSIT") || d.includes("EDEPOSIT")) {
    return { section: "Wells Fargo — Check Deposits (unknown)", donor: "Unknown Check Donor" }
  }

  // Everything else — "other income"
  return { section: "Wells Fargo — Other", donor: details.slice(0, 40) }
}

function titleCase(s: string) {
  return s.toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

// Reversal pair detector — matches the logic in the main dashboard.
// A credit of $X within 3 days of a debit of $X are treated as a cancelled
// round-trip and both are excluded from all totals.
function findReversalPairIds(
  txns: Array<{ id: number; date: string; amount: number | string }>,
  windowDays = 3
): Set<number> {
  const excluded = new Set<number>()
  const dayMs = 24 * 60 * 60 * 1000
  const rows = txns.map(tx => ({
    tx,
    amt: Number(tx.amount),
    t: new Date(tx.date).getTime(),
  }))
  const credits = rows.filter(r => r.amt > 0)
  const debits = rows.filter(r => r.amt < 0)
  for (const c of credits) {
    if (excluded.has(c.tx.id)) continue
    const match = debits.find(d =>
      !excluded.has(d.tx.id) &&
      Math.abs(d.amt) === c.amt &&
      Math.abs(d.t - c.t) <= windowDays * dayMs
    )
    if (match) {
      excluded.add(c.tx.id)
      excluded.add(match.tx.id)
    }
  }
  return excluded
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const url = new URL(request.url)
  const start = url.searchParams.get("start")  // "YYYY-MM"
  const end = url.searchParams.get("end")       // "YYYY-MM"

  if (!start || !end) {
    return NextResponse.json({ error: "start and end query params required (YYYY-MM)" }, { status: 400 })
  }

  const months = enumerateMonths(start, end)
  const startTs = Math.floor(new Date(`${start}-01T00:00:00Z`).getTime() / 1000)
  const [ey, em] = end.split("-").map(Number)
  const endLastDay = new Date(Date.UTC(ey, em, 0)).getUTCDate()  // last day of end month
  const endTs = Math.floor(new Date(`${end}-${String(endLastDay).padStart(2, "0")}T23:59:59Z`).getTime() / 1000)

  // ── Stripe: pull charges in range, group by customer id ─────────────────
  // Uses balance_transaction.net so totals reconcile with bank-side STRIPE
  // TRANSFER rows (which are net of Stripe fees). Gross would count fees as
  // donations and inflate the report vs the main dashboard.
  const stripeDonors = new Map<string, DonorRow>()
  const stripeSecret = process.env.STRIPE_SECRET_KEY
  if (stripeSecret) {
    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" })
    try {
      for await (const charge of stripe.charges.list({
        limit: 100,
        created: { gte: startTs, lte: endTs },
        expand: ["data.customer", "data.balance_transaction"],
      })) {
        if (charge.status !== "succeeded") continue
        const createdDate = new Date(charge.created * 1000)
        const mk = monthKey(createdDate)
        if (!months.includes(mk)) continue

        const cust = charge.customer as Stripe.Customer | string | null
        const custId = typeof cust === "string"
          ? cust
          : cust?.id ?? charge.billing_details?.email ?? `anon-${charge.id}`
        const custEmail = typeof cust === "object" && cust
          ? cust.email ?? charge.billing_details?.email ?? null
          : charge.billing_details?.email ?? null
        let custName = typeof cust === "object" && cust
          ? cust.name ?? charge.billing_details?.name ?? null
          : charge.billing_details?.name ?? null
        if (!custName && custEmail) custName = deriveNameFromEmail(custEmail)
        if (!custName) custName = "Anonymous"

        if (!stripeDonors.has(custId)) {
          stripeDonors.set(custId, {
            id: custId,
            name: custName,
            email: custEmail,
            monthly: Object.fromEntries(months.map(m => [m, 0])),
            total: 0,
          })
        }
        const row = stripeDonors.get(custId)!
        // Use net (after Stripe fees) to match what arrived in Wells Fargo
        const bt = charge.balance_transaction as Stripe.BalanceTransaction | null
        const netCents = bt && typeof bt === "object" ? bt.net : charge.amount
        // Subtract refunded portion
        const refundedCents = charge.amount_refunded ?? 0
        const netAfterRefunds = (netCents - refundedCents) / 100
        if (netAfterRefunds <= 0) continue
        row.monthly[mk] = (row.monthly[mk] || 0) + netAfterRefunds
        row.total += netAfterRefunds
      }
    } catch (err: any) {
      // don't fail the whole report — Stripe section will just be empty
      console.error("Stripe charges fetch failed:", err?.message ?? err)
    }
  }

  // ── Bank transactions: fetch from backend, classify, group ──────────────
  // Reversal pair netting is applied BEFORE classification so round-trip
  // refunds don't inflate donor totals (matches main dashboard behavior).
  const bankSections = new Map<string, Map<string, DonorRow>>()
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
    if (apiBase) {
      const res = await fetch(`${apiBase}/transactions`, { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        const rawTxns: Array<{ id: number; date: string; amount: number | string; details: string | null }> =
          data.transactions ?? []

        // Net out reversal pairs across the FULL set (not just in-range) so
        // pairs straddling range boundaries still get caught
        const reversalIds = findReversalPairIds(rawTxns)
        const txns = rawTxns.filter(tx => !reversalIds.has(tx.id))

        for (const tx of txns) {
          const amt = Number(tx.amount)
          if (amt <= 0) continue
          const mk = tx.date?.slice(0, 7)
          if (!mk || !months.includes(mk)) continue

          const classification = classifyBankRow(tx.details ?? "")
          if (!classification) continue

          if (!bankSections.has(classification.section)) {
            bankSections.set(classification.section, new Map())
          }
          const secMap = bankSections.get(classification.section)!
          if (!secMap.has(classification.donor)) {
            secMap.set(classification.donor, {
              id: classification.donor,
              name: classification.donor,
              email: null,
              monthly: Object.fromEntries(months.map(m => [m, 0])),
              total: 0,
            })
          }
          const row = secMap.get(classification.donor)!
          row.monthly[mk] = (row.monthly[mk] || 0) + amt
          row.total += amt
        }
      }
    }
  } catch (err: any) {
    console.error("Bank transactions fetch failed:", err?.message ?? err)
  }

  // ── Build section list with totals ──────────────────────────────────────
  function buildSection(name: string, donorMap: Map<string, DonorRow>, note?: string): Section {
    const donors = Array.from(donorMap.values()).sort((a, b) => b.total - a.total)
    const sectionTotals: Record<string, number> = Object.fromEntries(months.map(m => [m, 0]))
    let sectionTotal = 0
    for (const d of donors) {
      for (const m of months) sectionTotals[m] += d.monthly[m] ?? 0
      sectionTotal += d.total
    }
    return { name, note, donors, sectionTotals, sectionTotal }
  }

  const sections: Section[] = []
  sections.push(buildSection("Stripe", stripeDonors))

  // ── Benevity: pull donor-level data from backend if available ───────────
  // If Benevity donations are present for this date range, they REPLACE the
  // lump-sum "Corporate / Platform" bank section to avoid double counting.
  const benevityDonors = new Map<string, DonorRow>()
  let benevityHasData = false
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
    if (apiBase) {
      const startDate = `${start}-01`
      const [ey, em] = end.split("-").map(Number)
      const lastDay = new Date(Date.UTC(ey, em, 0)).getUTCDate()
      const endDate = `${end}-${String(lastDay).padStart(2, "0")}`
      const res = await fetch(
        `${apiBase}/benevity/donations?start=${startDate}&end=${endDate}`,
        { cache: "no-store" }
      )
      if (res.ok) {
        const body = await res.json()
        const rows: Array<{
          donation_date: string
          donor_first_name: string | null
          donor_last_name: string | null
          donor_email: string | null
          company: string | null
          donation_amount: number | string
          match_amount: number | string
          cause_support_fee: number | string
          merchant_fee: number | string
        }> = body.donations ?? []
        if (rows.length > 0) {
          benevityHasData = true
          for (const r of rows) {
            const mk = (new Date(r.donation_date).toISOString() ?? "").slice(0, 7)
            if (!mk || !months.includes(mk)) continue
            // Dedupe by email (falls back to donor name if email missing)
            const key = r.donor_email
              ?? `${r.donor_first_name ?? ""} ${r.donor_last_name ?? ""}`.trim()
              ?? "anon"
            if (!benevityDonors.has(key)) {
              const displayName = [r.donor_first_name, r.donor_last_name]
                .filter(Boolean).join(" ") || "Anonymous"
              benevityDonors.set(key, {
                id: key,
                name: displayName,
                email: r.donor_email,
                monthly: Object.fromEntries(months.map(m => [m, 0])),
                total: 0,
              })
            }
            const row = benevityDonors.get(key)!
            const donation = Number(r.donation_amount) || 0
            const match = Number(r.match_amount) || 0
            const fees = (Number(r.cause_support_fee) || 0) + (Number(r.merchant_fee) || 0)
            // Use net (donation + match - fees) so totals reconcile with bank
            const net = Math.max(donation + match - fees, 0)
            row.monthly[mk] = (row.monthly[mk] || 0) + net
            row.total += net
          }
        }
      }
    }
  } catch (err: any) {
    console.error("Benevity donations fetch failed:", err?.message ?? err)
  }

  // Wells Fargo sections — enumerate in the order we want
  const bankOrder = [
    "Wells Fargo — Named Donors",
    "Wells Fargo — Check Deposits (unknown)",
    "Wells Fargo — Other",
  ]
  for (const secName of bankOrder) {
    const secMap = bankSections.get(secName)
    if (secMap && secMap.size > 0) {
      const note = secName === "Wells Fargo — Check Deposits (unknown)"
        ? "Check deposits from bank statement. Donors unknown until manually tagged."
        : undefined
      sections.push(buildSection(secName, secMap, note))
    }
  }

  // Benevity — if we have donor-level data use it, otherwise fall back to bank lump sum
  if (benevityHasData && benevityDonors.size > 0) {
    sections.push(buildSection(
      "Benevity / AOG / CyberGrants (donor-level)",
      benevityDonors,
      "Donor-level data from uploaded Benevity detailed reports. Lump-sum bank rows for these disbursements are excluded to avoid double counting."
    ))
  } else {
    const lumpSum = bankSections.get("Corporate / Platform (AOG + Benevity + CyberGrants)")
    if (lumpSum && lumpSum.size > 0) {
      sections.push(buildSection(
        "Corporate / Platform (AOG + Benevity + CyberGrants)",
        lumpSum,
        "Lump-sum deposits from Benevity/AOG/CyberGrants. Upload Benevity CSV for donor-level breakdown."
      ))
    }
  }

  // Grand totals
  const grandTotals: Record<string, number> = Object.fromEntries(months.map(m => [m, 0]))
  let grandTotal = 0
  for (const s of sections) {
    for (const m of months) grandTotals[m] += s.sectionTotals[m] ?? 0
    grandTotal += s.sectionTotal
  }

  return NextResponse.json({
    start,
    end,
    months,
    sections,
    grandTotals,
    grandTotal,
  })
}

import { NextResponse } from "next/server"

// Aggregates Benevity + CyberGrants donor data from the Express backend into
// the same shape as the Stripe overview route. Cached in-memory for 5 minutes
// like Stripe. Bank-side lump sum deposits that haven't been broken down into
// donor-level CSVs yet appear as "Pending Upload" placeholder rows.

type CachedOverview = { fetchedAt: number; data: unknown }
let cache: CachedOverview | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

export const dynamic = "force-dynamic"
export const maxDuration = 30

interface BenevityDonationRow {
  id: number
  disbursement_id: string
  transaction_id: string
  donation_date: string
  company: string | null
  project: string | null
  donor_first_name: string | null
  donor_last_name: string | null
  donor_email: string | null
  donation_frequency: string | null
  currency: string
  donation_amount: number | string
  match_amount: number | string
  cause_support_fee: number | string
  merchant_fee: number | string
}

interface BankTx {
  id: number
  date: string
  amount: number | string
  details: string | null
}

function extractDisbursementId(details: string): string | null {
  if (!details) return null
  // Benevity / AOG pattern: REF*TN*XXXXXXXXXX
  const refTn = details.match(/REF\*TN\*([A-Z0-9]+)/i)
  if (refTn) return refTn[1].toUpperCase()
  // CyberGrants pattern: ACH_XXXXXXX
  const ach = details.match(/ACH_?(\d+)/i)
  if (ach) return `ACH_${ach[1]}`
  return null
}

function extractPlatform(details: string): "benevity" | "cybergrants" | "other" {
  const d = (details ?? "").toUpperCase()
  if (d.includes("CYBERGRANT")) return "cybergrants"
  if (d.includes("AMER ONLINE GIV") || d.includes("BENEV")) return "benevity"
  return "other"
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
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const bust = url.searchParams.get("refresh") === "1"

  if (!bust && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ ...(cache.data as object), cached: true })
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!apiBase) {
    return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE_URL not set" }, { status: 500 })
  }

  let donations: BenevityDonationRow[] = []
  try {
    const res = await fetch(`${apiBase}/benevity/donations`, { cache: "no-store" })
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch Benevity donations from backend", status: res.status },
        { status: 502 }
      )
    }
    const body = await res.json()
    donations = body.donations ?? []
  } catch (err: any) {
    return NextResponse.json(
      { error: "Benevity backend unreachable", message: err?.message ?? String(err) },
      { status: 502 }
    )
  }

  // ── Also fetch bank transactions so we can surface uncovered lump sums ──
  let bankTxns: BankTx[] = []
  try {
    const res = await fetch(`${apiBase}/transactions`, { cache: "no-store" })
    if (res.ok) {
      const body = await res.json()
      bankTxns = body.transactions ?? []
    }
  } catch (err) {
    // don't fail — bank data is optional for the placeholder feature
  }

  const coveredDisbursementIds = new Set(donations.map(d => d.disbursement_id?.toUpperCase()).filter(Boolean))
  const platformBankRows = bankTxns
    .filter(tx => {
      const d = (tx.details ?? "").toUpperCase()
      return (
        (d.includes("AMER ONLINE GIV") || d.includes("CYBERGRANT") || d.includes("REF*TN*")) &&
        Number(tx.amount) > 0
      )
    })
    .map(tx => {
      const refId = extractDisbursementId(tx.details ?? "")
      return {
        id: tx.id,
        date: typeof tx.date === "string" ? tx.date.split("T")[0] : String(tx.date),
        amount: Number(tx.amount),
        details: tx.details ?? "",
        disbursementId: refId,
        platform: extractPlatform(tx.details ?? ""),
      }
    })
  const pendingBankRows = platformBankRows.filter(r => {
    if (!r.disbursementId) return true
    return !coveredDisbursementIds.has(r.disbursementId.toUpperCase())
  })

  // ── Aggregate ────────────────────────────────────────────────────────────
  let donationCount = 0
  let personalTotal = 0    // what donors personally gave
  let matchTotal = 0       // employer match
  let feesTotal = 0        // Benevity fees
  let netTotal = 0         // what reached the bank
  let recurringCount = 0
  let oneTimeCount = 0
  const monthly: Record<string, { net: number; donationCount: number }> = {}
  const donors: Record<string, {
    id: string
    name: string
    email: string | null
    personal: number
    match: number
    net: number
    count: number
    company: string | null
    nameDerived: boolean
  }> = {}
  const companies: Record<string, { personal: number; match: number; count: number }> = {}
  const disbursementIds = new Set<string>()

  for (const d of donations) {
    const personal = Number(d.donation_amount) || 0
    const match = Number(d.match_amount) || 0
    const fees = (Number(d.cause_support_fee) || 0) + (Number(d.merchant_fee) || 0)
    const net = Math.max(personal + match - fees, 0)

    donationCount++
    personalTotal += personal
    matchTotal += match
    feesTotal += fees
    netTotal += net
    disbursementIds.add(d.disbursement_id)

    if ((d.donation_frequency ?? "").toLowerCase() === "recurring") recurringCount++
    else oneTimeCount++

    // Monthly
    const mk = new Date(d.donation_date).toISOString().slice(0, 7)
    if (!monthly[mk]) monthly[mk] = { net: 0, donationCount: 0 }
    monthly[mk].net += net
    monthly[mk].donationCount++

    // Donor aggregation (dedupe by email, fall back to id)
    const key = d.donor_email ?? `${d.donor_first_name ?? ""}-${d.donor_last_name ?? ""}-${d.id}`
    if (!donors[key]) {
      let displayName = [d.donor_first_name, d.donor_last_name].filter(Boolean).join(" ")
      let nameDerived = false
      if (!displayName && d.donor_email) {
        const derived = deriveNameFromEmail(d.donor_email)
        if (derived) {
          displayName = derived
          nameDerived = true
        }
      }
      if (!displayName) displayName = "Anonymous"
      donors[key] = {
        id: key,
        name: displayName,
        email: d.donor_email,
        personal: 0,
        match: 0,
        net: 0,
        count: 0,
        company: d.company,
        nameDerived,
      }
    }
    const row = donors[key]
    row.personal += personal
    row.match += match
    row.net += net
    row.count++

    // Company aggregation
    const companyKey = (d.company ?? "No Match").toString().trim() || "No Match"
    if (!companies[companyKey]) companies[companyKey] = { personal: 0, match: 0, count: 0 }
    companies[companyKey].personal += personal
    companies[companyKey].match += match
    companies[companyKey].count++
  }

  // Add pending bank rows as placeholder donors so totals reconcile
  let pendingTotal = 0
  let pendingCount = 0
  for (const row of pendingBankRows) {
    pendingCount++
    pendingTotal += row.amount
    // Monthly pending
    const mk = row.date.slice(0, 7)
    if (!monthly[mk]) monthly[mk] = { net: 0, donationCount: 0 }
    monthly[mk].net += row.amount
    monthly[mk].donationCount++
    // Fake a donor row keyed on the disbursement id
    const placeholderKey = `pending-${row.disbursementId ?? row.id}`
    donors[placeholderKey] = {
      id: placeholderKey,
      name:
        row.platform === "cybergrants"
          ? `CyberGrants ${row.disbursementId ?? `#${row.id}`}`
          : `Benevity ${row.disbursementId ?? `#${row.id}`}`,
      email: null,
      personal: row.amount,
      match: 0,
      net: row.amount,
      count: 1,
      company: row.platform === "cybergrants" ? "CyberGrants" : "Benevity (AOG)",
      nameDerived: false,
      pending: true,
    } as any
  }

  const topDonors = Object.values(donors)
    .sort((a: any, b: any) => b.net - a.net)
    .slice(0, 10)
    .map((d: any) => ({
      id: d.id,
      name: d.name,
      email: d.email,
      company: d.company,
      personal: d.personal,
      match: d.match,
      total: d.net,
      count: d.count,
      nameDerived: d.nameDerived,
      pending: d.pending ?? false,
    }))

  const topCompanies = Object.entries(companies)
    .map(([name, v]) => ({ name, personal: v.personal, match: v.match, total: v.personal + v.match, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  const monthlyArr = Object.entries(monthly)
    .map(([ym, v]) => ({ ym, net: v.net, donationCount: v.donationCount }))
    .sort((a, b) => a.ym.localeCompare(b.ym))

  const matchRatio = personalTotal + matchTotal > 0
    ? matchTotal / (personalTotal + matchTotal)
    : 0

  const data = {
    asOf: new Date().toISOString(),
    donationCount,
    uniqueDonors: Object.keys(donors).length,
    uniqueCompanies: Object.keys(companies).filter(c => c !== "No Match").length,
    disbursementCount: disbursementIds.size,
    personalTotal,
    matchTotal,
    feesTotal,
    netTotal: netTotal + pendingTotal,
    avgDonation: donationCount > 0 ? (personalTotal + matchTotal) / donationCount : 0,
    matchRatio,
    recurringCount,
    oneTimeCount,
    pending: {
      count: pendingCount,
      total: pendingTotal,
      rows: pendingBankRows.map(r => ({
        id: r.id,
        date: r.date,
        amount: r.amount,
        disbursementId: r.disbursementId,
        platform: r.platform,
      })),
    },
    topDonors,
    topCompanies,
    monthly: monthlyArr,
    cached: false,
  }

  cache = { fetchedAt: Date.now(), data }
  return NextResponse.json(data)
}

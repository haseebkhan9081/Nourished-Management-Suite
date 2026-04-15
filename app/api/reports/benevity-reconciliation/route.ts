import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

interface BenevityDisbursement {
  disbursement_id: string
  donation_count: string | number
  unique_donors: string | number
  total_donation: string | number
  total_match: string | number
  total_fees: string | number
  net_received: string | number
  first_donation_at: string
  last_donation_at: string
}

interface BankTx {
  id: number
  date: string
  amount: number | string
  details: string | null
}

function extractDisbursementId(details: string): string | null {
  if (!details) return null
  // Patterns seen in Wells Fargo CSV for AOG deposits:
  //   "AMER ONLINE GIV1 EDI PAYMNT APR 07 1TFNDRKDW4 REF*TN*1TFNDRKDW4*Donation..."
  // The ref code is a 10-char alphanumeric that appears after REF*TN* or directly
  const refTn = details.match(/REF\*TN\*([A-Z0-9]+)/i)
  if (refTn) return refTn[1].toUpperCase()
  // Fallback: look for AMER ONLINE GIV followed by ref code
  const aog = details.match(/AMER ONLINE GIV[^\s]*\s+\S+\s+\S+\s+\S+\s+([A-Z0-9]{8,})/i)
  if (aog) return aog[1].toUpperCase()
  return null
}

export async function GET(_request: Request) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!apiBase) {
    return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE_URL not set" }, { status: 500 })
  }

  let benevityDisbursements: BenevityDisbursement[] = []
  let bankTxns: BankTx[] = []

  // ── Fetch Benevity disbursements summary ────────────────────────────────
  try {
    const res = await fetch(`${apiBase}/benevity/disbursements`, { cache: "no-store" })
    if (res.ok) {
      const body = await res.json()
      benevityDisbursements = body.disbursements ?? []
    }
  } catch (err: any) {
    console.error("Benevity disbursements fetch failed:", err?.message ?? err)
  }

  // ── Fetch bank transactions and filter to AMER ONLINE GIV ───────────────
  try {
    const res = await fetch(`${apiBase}/transactions`, { cache: "no-store" })
    if (res.ok) {
      const body = await res.json()
      bankTxns = body.transactions ?? []
    }
  } catch (err: any) {
    console.error("Bank transactions fetch failed:", err?.message ?? err)
  }

  // Filter bank transactions to AMER ONLINE GIV credits
  const aogBankRows = bankTxns
    .filter(tx => {
      const d = (tx.details ?? "").toUpperCase()
      return d.includes("AMER ONLINE GIV") && Number(tx.amount) > 0
    })
    .map(tx => ({
      id: tx.id,
      date: typeof tx.date === "string" ? tx.date.split("T")[0] : String(tx.date),
      amount: Number(tx.amount),
      details: tx.details ?? "",
      disbursementId: extractDisbursementId(tx.details ?? ""),
    }))

  // Also check CYBERGRANTS rows since those flow through the same Benevity pipeline
  const cybergrantBankRows = bankTxns
    .filter(tx => {
      const d = (tx.details ?? "").toUpperCase()
      return d.includes("CYBERGRANT") && Number(tx.amount) > 0
    })
    .map(tx => ({
      id: tx.id,
      date: typeof tx.date === "string" ? tx.date.split("T")[0] : String(tx.date),
      amount: Number(tx.amount),
      details: tx.details ?? "",
      disbursementId: null as string | null,
    }))

  // Build disbursement lookup map
  const benevityMap = new Map<string, BenevityDisbursement>()
  for (const d of benevityDisbursements) {
    benevityMap.set(d.disbursement_id.toUpperCase(), d)
  }

  // ── Reconcile ───────────────────────────────────────────────────────────
  type Status = "matched" | "mismatch" | "missing_benevity" | "missing_bank"
  interface ReconRow {
    status: Status
    disbursementId: string | null
    bankDate: string | null
    bankAmount: number | null
    bankDetails: string | null
    benevityNet: number | null
    benevityDonorCount: number | null
    benevityUniqueDonors: number | null
    difference: number | null
  }

  const rows: ReconRow[] = []
  const matchedIds = new Set<string>()

  // Walk bank AOG rows, match against Benevity
  for (const bank of aogBankRows) {
    if (bank.disbursementId && benevityMap.has(bank.disbursementId)) {
      const ben = benevityMap.get(bank.disbursementId)!
      const benevityNet = Number(ben.net_received) || 0
      const diff = Math.round((bank.amount - benevityNet) * 100) / 100
      const status: Status = Math.abs(diff) < 0.01 ? "matched" : "mismatch"
      rows.push({
        status,
        disbursementId: bank.disbursementId,
        bankDate: bank.date,
        bankAmount: bank.amount,
        bankDetails: bank.details,
        benevityNet,
        benevityDonorCount: Number(ben.donation_count) || 0,
        benevityUniqueDonors: Number(ben.unique_donors) || 0,
        difference: diff,
      })
      matchedIds.add(bank.disbursementId)
    } else {
      // Bank row exists, no Benevity data
      rows.push({
        status: "missing_benevity",
        disbursementId: bank.disbursementId,
        bankDate: bank.date,
        bankAmount: bank.amount,
        bankDetails: bank.details,
        benevityNet: null,
        benevityDonorCount: null,
        benevityUniqueDonors: null,
        difference: null,
      })
    }
  }

  // Walk Benevity disbursements not yet matched → "missing in bank"
  for (const ben of benevityDisbursements) {
    if (matchedIds.has(ben.disbursement_id.toUpperCase())) continue
    rows.push({
      status: "missing_bank",
      disbursementId: ben.disbursement_id,
      bankDate: null,
      bankAmount: null,
      bankDetails: null,
      benevityNet: Number(ben.net_received) || 0,
      benevityDonorCount: Number(ben.donation_count) || 0,
      benevityUniqueDonors: Number(ben.unique_donors) || 0,
      difference: null,
    })
  }

  // Sort: mismatches first, then matched, then orphans, by date desc
  const statusOrder: Record<Status, number> = {
    mismatch: 0,
    missing_benevity: 1,
    missing_bank: 2,
    matched: 3,
  }
  rows.sort((a, b) => {
    const so = statusOrder[a.status] - statusOrder[b.status]
    if (so !== 0) return so
    const da = a.bankDate ?? ""
    const db = b.bankDate ?? ""
    return db.localeCompare(da)
  })

  // Summary counts
  const summary = {
    total: rows.length,
    matched: rows.filter(r => r.status === "matched").length,
    mismatch: rows.filter(r => r.status === "mismatch").length,
    missingBenevity: rows.filter(r => r.status === "missing_benevity").length,
    missingBank: rows.filter(r => r.status === "missing_bank").length,
    bankTotal: aogBankRows.reduce((s, r) => s + r.amount, 0),
    benevityTotal: benevityDisbursements.reduce((s, d) => s + (Number(d.net_received) || 0), 0),
    cybergrantCount: cybergrantBankRows.length,
    cybergrantTotal: cybergrantBankRows.reduce((s, r) => s + r.amount, 0),
  }

  return NextResponse.json({ summary, rows, cybergrantBankRows })
}

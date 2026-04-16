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
  // Benevity / AOG pattern: REF*TN*XXXXXXXXXX
  const refTn = details.match(/REF\*TN\*([A-Z0-9]+)/i)
  if (refTn) return refTn[1].toUpperCase()
  // CyberGrants pattern: ACH_XXXXXXX (appears inline in CYBERGRANT bank rows)
  const ach = details.match(/ACH_?(\d+)/i)
  if (ach) return `ACH_${ach[1]}`
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

  // Filter bank transactions to the corporate-giving pipeline: Benevity AOG
  // AND CyberGrants. Both flow into the same benevity_donation table so they
  // reconcile against the same disbursement set.
  const platformBankRows = bankTxns
    .filter(tx => {
      const d = (tx.details ?? "").toUpperCase()
      if (Number(tx.amount) <= 0) return false
      return d.includes("AMER ONLINE GIV")
          || d.includes("CYBERGRANT")
          || d.includes("REF*TN*")
          || d.includes("BENEV")
    })
    .map(tx => {
      const d = (tx.details ?? "").toUpperCase()
      const platform: "aog" | "cybergrants" =
        d.includes("CYBERGRANT") ? "cybergrants" : "aog"
      return {
        id: tx.id,
        date: typeof tx.date === "string" ? tx.date.split("T")[0] : String(tx.date),
        amount: Number(tx.amount),
        details: tx.details ?? "",
        disbursementId: extractDisbursementId(tx.details ?? ""),
        platform,
      }
    })

  // Kept so the summary card can still surface a CyberGrants tally separately.
  const cybergrantBankRows = platformBankRows.filter(r => r.platform === "cybergrants")

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

  // Walk every platform bank row (AOG + CyberGrants), match against Benevity
  for (const bank of platformBankRows) {
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
    bankTotal: platformBankRows.reduce((s, r) => s + r.amount, 0),
    benevityTotal: benevityDisbursements.reduce((s, d) => s + (Number(d.net_received) || 0), 0),
    cybergrantCount: cybergrantBankRows.length,
    cybergrantTotal: cybergrantBankRows.reduce((s, r) => s + r.amount, 0),
  }

  return NextResponse.json({ summary, rows, cybergrantBankRows })
}

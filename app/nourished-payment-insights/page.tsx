//@ts-nocheck
"use client"

import { useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx-js-style"
import { Download, ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { Line, Doughnut, Bar } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Transaction {
  id: number
  date: string
  amount: number
  flag: string | null
  check_number: string | null
  details: string | null
  created_at: string
}

type SourceFilter = "all" | "stripe" | "bank"

// Finance categories — source of truth for classification
type Category =
  | "stripe"           // online donations via Stripe
  | "corporate_giving" // AOG / Benevity / CyberGrants — all platform/corporate-routed giving
  | "check_deposit"    // mobile / branch check deposits
  | "direct_transfer"  // bank-to-bank transfers from named donors
  | "pakistan_wire"    // wire to United Bank Ltd / Nourished Welfare Trust
  | "pakistan_xoom"    // Xoom / Remitly money transfers (also Pakistan program)
  | "wire_fee"         // wire service charges (counted as Pakistan overhead)
  | "us_operations"    // Zelle, card purchases, withdrawals (US-side spend)
  | "bank_fee"         // Harland Clarke check printing, etc.
  | "other_in"
  | "other_out"

// ---------------------------------------------------------------------------
// Classification — the single most important function on this page
// ---------------------------------------------------------------------------
function classify(tx: Transaction): Category {
  const d = (tx.details ?? "").toUpperCase()
  const isDebit = tx.amount < 0

  // ── Outflows ───────────────────────────────────────────────────────────────
  if (isDebit) {
    if (d.includes("WIRE TRANS SVC CHARGE")) return "wire_fee"
    if (d.includes("WT ") && (d.includes("UNITED BANK") || d.includes("NOURISHED WELFARE"))) return "pakistan_wire"
    if (d.includes("XOOM") || d.includes("RMTLY") || d.includes("REMITLY")) return "pakistan_xoom"
    if (d.includes("ZELLE") || d.includes("PURCHASE AUTHORIZED") || d.includes("WITHDRAWAL")) return "us_operations"
    if (d.includes("HARLAND CLARKE")) return "bank_fee"
    return "other_out"
  }

  // ── Inflows ────────────────────────────────────────────────────────────────
  if (d.includes("STRIPE")) return "stripe"
  if (d.includes("AMER ONLINE GIV") || d.includes("REF*TN*") || d.includes("CYBERGRANT") || d.includes("BENEV"))
    return "corporate_giving"
  if (d.includes("MOBILE DEPOSIT") || d.includes("EDEPOSIT")) return "check_deposit"
  if (d.includes("ONLINE TRANSFER FROM") || d.includes("TRANSFER IN BRANCH")) return "direct_transfer"
  return "other_in"
}

// Simple source for legacy filter pills
function simpleSource(tx: Transaction): "stripe" | "bank" {
  return classify(tx) === "stripe" ? "stripe" : "bank"
}

// Top-level channel grouping used by the new Transaction Explorer + totals row
type Channel = "stripe" | "benevity" | "bank_deposits" | "outflow"
function channelOf(cat: Category, amount: number): Channel {
  if (cat === "stripe") return "stripe"
  if (cat === "corporate_giving") return "benevity"
  if (amount < 0) return "outflow"
  return "bank_deposits"
}

const CATEGORY_META: Record<Category, { label: string; color: string; group: "income" | "expense" }> = {
  stripe:           { label: "Stripe",                          color: "#6772E5", group: "income"  },
  corporate_giving: { label: "Corporate / Platform Giving",     color: "#4F8A70", group: "income"  },
  check_deposit:    { label: "Check Deposits",                  color: "#8FA889", group: "income"  },
  direct_transfer:  { label: "Direct Transfers",                color: "#C9DCC5", group: "income"  },
  other_in:         { label: "Other Income",                    color: "#D1D5DB", group: "income"  },
  pakistan_wire:    { label: "Pakistan Wires",                  color: "#D97757", group: "expense" },
  pakistan_xoom:    { label: "Xoom / Remitly",                  color: "#E9966F", group: "expense" },
  wire_fee:         { label: "Wire Fees",                       color: "#F4B78C", group: "expense" },
  us_operations:    { label: "US Operations",                   color: "#94A3B8", group: "expense" },
  bank_fee:          { label: "Bank Fees",                      color: "#CBD5E1", group: "expense" },
  other_out:         { label: "Other Outflow",                  color: "#E5E7EB", group: "expense" },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : ""
  return sign + "$" + Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Short currency labels for charts: $43.5K, $1.2M, $847
function abbreviateCurrency(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  const stripZero = (s: string) => (s.endsWith(".0") ? s.slice(0, -2) : s)
  if (abs >= 1e6) return sign + "$" + stripZero((abs / 1e6).toFixed(1)) + "M"
  if (abs >= 1e3) return sign + "$" + stripZero((abs / 1e3).toFixed(1)) + "K"
  return sign + "$" + Math.round(abs).toString()
}

function formatMonthLabel(ym: string) {
  const [y, m] = ym.split("-")
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleString("en-US", { month: "short", year: "numeric" })
}

// "YYYY-Qn" from a transaction date. Jan-Mar = Q1, etc.
function quarterKey(dateStr: string): string {
  const d = new Date(dateStr)
  const y = d.getUTCFullYear()
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `${y}-Q${q}`
}

// Sortable enumeration: "2024-Q3" → "2024-Q3". String comparison works.
function cmpQuarter(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

// Human label: "2026-Q1" → "Q1 2026"
function formatQuarterLabel(qk: string) {
  const [y, q] = qk.split("-")
  return `${q} ${y}`
}

// For a given quarter key, return [startDate, endDate) so drill-down can filter.
function quarterRange(qk: string): [Date, Date] {
  const [yStr, qStr] = qk.split("-")
  const y = Number(yStr)
  const q = Number(qStr.replace("Q", ""))
  const start = new Date(Date.UTC(y, (q - 1) * 3, 1))
  const end = new Date(Date.UTC(y, q * 3, 1))
  return [start, end]
}

// Map a Category to the QoQ table row it belongs in. Keeps the matrix legible
// by collapsing the classify() output into 5 income rows + 1 outflow row.
type QoQRow = "stripe" | "corporate" | "checks" | "direct" | "other_in" | "outflow"
const QOQ_ROW_META: Record<QoQRow, { label: string; color: string; group: "income" | "expense" }> = {
  stripe:    { label: "Stripe",                     color: "#6772E5", group: "income"  },
  corporate: { label: "Corporate / Platform",       color: "#4F8A70", group: "income"  },
  checks:    { label: "Check Deposits",             color: "#8FA889", group: "income"  },
  direct:    { label: "Direct Transfers",           color: "#C9DCC5", group: "income"  },
  other_in:  { label: "Other Inflow",               color: "#D1D5DB", group: "income"  },
  outflow:   { label: "Outflows (deployment + ops)", color: "#D97757", group: "expense" },
}
function qoqRowOf(tx: Transaction): QoQRow {
  const cat = classify(tx)
  if (CATEGORY_META[cat].group === "expense") return "outflow"
  if (cat === "stripe") return "stripe"
  if (cat === "corporate_giving") return "corporate"
  if (cat === "check_deposit") return "checks"
  if (cat === "direct_transfer") return "direct"
  return "other_in"
}

function sumAbs(txns: Transaction[]) {
  return txns.reduce((s, tx) => s + Math.abs(Number(tx.amount)), 0)
}

function sumCredits(txns: Transaction[]) {
  return txns.filter(tx => Number(tx.amount) > 0).reduce((s, tx) => s + Number(tx.amount), 0)
}

// Detect reversal pairs: a credit that matches an equal-amount debit within
// N days is treated as a cancelled round-trip and both sides are excluded.
// Uses the same absolute amount + ≤3 day window rule that catches Remitly/Xoom
// refund reversals like the Raheel Merchant case.
function findReversalPairs(txns: Transaction[], windowDays = 3): {
  excluded: Set<number>
  pairs: Array<{ credit: Transaction; debit: Transaction }>
} {
  const excluded = new Set<number>()
  const pairs: Array<{ credit: Transaction; debit: Transaction }> = []
  const dayMs = 24 * 60 * 60 * 1000
  const withDate = txns.map(tx => ({
    tx,
    amt: Number(tx.amount),
    t: new Date(tx.date).getTime(),
  }))
  const credits = withDate.filter(r => r.amt > 0)
  const debits  = withDate.filter(r => r.amt < 0)

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
      pairs.push({ credit: c.tx, debit: match.tx })
    }
  }
  return { excluded, pairs }
}

// Group credits (positive amounts) by month into { "YYYY-MM": total }
function monthlyCredits(txns: Transaction[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const tx of txns) {
    const amt = Number(tx.amount)
    if (amt <= 0) continue
    const ym = (tx.date ?? "").slice(0, 7)
    if (!ym) continue
    map[ym] = (map[ym] || 0) + amt
  }
  return map
}

// Group absolute-value outflows by month
function monthlyOutflow(txns: Transaction[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const tx of txns) {
    const amt = Number(tx.amount)
    if (amt >= 0) continue
    const ym = (tx.date ?? "").slice(0, 7)
    if (!ym) continue
    map[ym] = (map[ym] || 0) + Math.abs(amt)
  }
  return map
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function NourishedPaymentInsightsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Source filter has been removed from the UI — the page always shows the
  // full dataset and relies on the Channel Totals row + Transaction Explorer
  // for any slicing. Kept as a const so downstream guards still compile.
  const source: SourceFilter = "all"

  // Transaction Explorer state — independent of the top-level source filter
  const today = new Date()
  const defaultStart = new Date(today.getFullYear(), today.getMonth() - 2, 1)
    .toISOString().slice(0, 10)
  const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString().slice(0, 10)
  const [explorerStart, setExplorerStart] = useState(defaultStart)
  const [explorerEnd, setExplorerEnd] = useState(defaultEnd)
  const [explorerChannel, setExplorerChannel] = useState<"all" | Channel>("all")
  const [explorerExpanded, setExplorerExpanded] = useState(false)

  const [purposeRequestOpen, setPurposeRequestOpen] = useState(false)
  const [drillCategory, setDrillCategory] = useState<"zakat" | "sadaqah" | "charity" | null>(null)
  const [qoqDrill, setQoqDrill] = useState<{ quarter: string; row: QoQRow | "TOTAL" } | null>(null)

  // Purpose breakdown + top donors (Zakat / Sadaqah / Donation)
  const [purposeData, setPurposeData] = useState<{
    totals: {
      zakat: { amount: number; gifts: number }
      sadaqah: { amount: number; gifts: number }
      charity: { amount: number; gifts: number }
    }
    topDonors: Array<{
      email: string
      name: string
      total: number
      gifts: number
      sources: string[]
      purposeTotals: { zakat: number; sadaqah: number; charity: number }
    }>
    uniqueDonors: number
  } | null>(null)

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
    if (!apiBase) return
    fetch(`${apiBase}/reports/donor-purpose?limit=10`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPurposeData(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/transactions`)
        if (!res.ok) throw new Error("Failed to fetch transactions")
        const data = await res.json()
        setTransactions(data.transactions)
      } catch (err: any) {
        setError(err.message || "Something went wrong")
      } finally {
        setLoading(false)
      }
    }
    fetchTransactions()
  }, [])

  // ── Normalize amounts ───────────────────────────────────────────────────────
  const raw = useMemo(
    () => transactions.map(tx => ({ ...tx, amount: Number(tx.amount), _cat: classify(tx) as Category })),
    [transactions]
  )

  // ── Reversal pair netting — removes round-trip refunds from all metrics ───
  const reversalData = useMemo(() => findReversalPairs(raw), [raw])
  const reversalIds = reversalData.excluded
  const reversalPairs = reversalData.pairs
  const all = useMemo(() => raw.filter(tx => !reversalIds.has(tx.id)), [raw, reversalIds])
  const reversalCount = reversalIds.size
  const [showReversals, setShowReversals] = useState(false)

  // ── Bucket by source for filter pills ──────────────────────────────────────
  const stripeTxns = useMemo(() => all.filter(tx => simpleSource(tx) === "stripe"), [all])
  const bankTxns   = useMemo(() => all.filter(tx => simpleSource(tx) === "bank"),   [all])

  const filtered = useMemo(() => {
    if (source === "stripe") return stripeTxns
    if (source === "bank")   return bankTxns
    return all
  }, [all, stripeTxns, bankTxns, source])

  // ── Key metrics (filter-aware) ──────────────────────────────────────────────
  const credits       = filtered.filter(tx => tx.amount > 0)
  const debits        = filtered.filter(tx => tx.amount < 0)
  const totalCredits  = credits.reduce((s, tx) => s + tx.amount, 0)
  const totalDebits   = debits.reduce((s, tx) => s + Math.abs(tx.amount), 0)
  const totalCount    = filtered.length
  // Current balance is an account invariant — always the sum of every transaction
  // (reversal-netted), not filter-aware. Clicking "Bank" or "Stripe" doesn't
  // change what's actually sitting in the bank.
  const currentBalance = all.reduce((s, tx) => s + Number(tx.amount), 0)

  // ── Pakistan deployment metrics (always computed from full set) ────────────
  const pakistanTxns = useMemo(
    () => all.filter(tx => ["pakistan_wire", "pakistan_xoom", "wire_fee"].includes(tx._cat)),
    [all]
  )
  const totalDeployedToPakistan = sumAbs(pakistanTxns)
  const wireFees = sumAbs(all.filter(tx => tx._cat === "wire_fee"))
  const totalRaisedAllTime = sumCredits(all)
  const deploymentRatio = totalRaisedAllTime > 0
    ? Math.round((totalDeployedToPakistan / totalRaisedAllTime) * 100)
    : 0

  // ── Quarter-over-quarter matrix ───────────────────────────────────────────
  // Build a row-by-quarter table from the reversal-netted dataset. Each row
  // is a channel (Stripe / Corporate / Checks / etc.) and each column is a
  // calendar quarter. Used for the QoQ section + drill-downs.
  const qoqData = useMemo(() => {
    const byRowByQ: Record<QoQRow, Record<string, number>> = {
      stripe: {}, corporate: {}, checks: {}, direct: {}, other_in: {}, outflow: {},
    }
    const quarterSet = new Set<string>()
    for (const tx of all) {
      const q = quarterKey(tx.date)
      if (!q) continue
      quarterSet.add(q)
      const row = qoqRowOf(tx)
      const amt = row === "outflow" ? Math.abs(Number(tx.amount)) : Number(tx.amount)
      byRowByQ[row][q] = (byRowByQ[row][q] || 0) + amt
    }
    const quarters = Array.from(quarterSet).sort(cmpQuarter)
    // Column totals by quarter — income rows only for the "Total Raised" row.
    const incomeTotals: Record<string, number> = {}
    const netTotals: Record<string, number> = {}
    for (const q of quarters) {
      let inc = 0
      let out = 0
      for (const row of Object.keys(byRowByQ) as QoQRow[]) {
        const v = byRowByQ[row][q] || 0
        if (row === "outflow") out += v
        else inc += v
      }
      incomeTotals[q] = inc
      netTotals[q] = inc - out
    }
    return { byRowByQ, quarters, incomeTotals, netTotals }
  }, [all])

  // ── QoQ-driven KPIs ───────────────────────────────────────────────────────
  const qoqKpis = useMemo(() => {
    const qs = qoqData.quarters
    if (qs.length === 0) {
      return { current: 0, prior: 0, qoqPct: null as number | null, trailing4: 0, best: 0, bestQ: "—", yoyPct: null as number | null, currentLabel: "—", priorLabel: "—" }
    }
    const current = qs[qs.length - 1]
    const prior = qs.length > 1 ? qs[qs.length - 2] : null
    const sameQtrLastYear = (() => {
      const [y, q] = current.split("-")
      const prev = `${Number(y) - 1}-${q}`
      return qs.includes(prev) ? prev : null
    })()
    const trailing4 = qs.slice(-4).reduce((s, q) => s + (qoqData.incomeTotals[q] || 0), 0)
    let best = 0, bestQ = "—"
    for (const q of qs) {
      const v = qoqData.incomeTotals[q] || 0
      if (v > best) { best = v; bestQ = q }
    }
    const currentV = qoqData.incomeTotals[current] || 0
    const priorV = prior ? (qoqData.incomeTotals[prior] || 0) : 0
    const yoyV = sameQtrLastYear ? (qoqData.incomeTotals[sameQtrLastYear] || 0) : 0
    return {
      current: currentV,
      prior: priorV,
      qoqPct: priorV > 0 ? ((currentV - priorV) / priorV) * 100 : null,
      trailing4,
      best,
      bestQ,
      yoyPct: yoyV > 0 ? ((currentV - yoyV) / yoyV) * 100 : null,
      currentLabel: formatQuarterLabel(current),
      priorLabel: prior ? formatQuarterLabel(prior) : "—",
    }
  }, [qoqData])

  // ── US Operations metrics (always computed from full set) ─────────────────
  const usOpsTxns = useMemo(
    () => all.filter(tx => ["us_operations", "bank_fee"].includes(tx._cat)),
    [all]
  )
  const totalUsOperations = sumAbs(usOpsTxns)
  const zelleOut   = sumAbs(all.filter(tx => tx._cat === "us_operations" && (tx.details ?? "").toUpperCase().includes("ZELLE")))
  const cardSpend  = sumAbs(all.filter(tx => tx._cat === "us_operations" && (tx.details ?? "").toUpperCase().includes("PURCHASE")))
  const withdrawls = sumAbs(all.filter(tx => tx._cat === "us_operations" && (tx.details ?? "").toUpperCase().includes("WITHDRAWAL")))
  const bankFeesOut = sumAbs(all.filter(tx => tx._cat === "bank_fee"))
  const usOpsRatio = totalRaisedAllTime > 0
    ? Math.round((totalUsOperations / totalRaisedAllTime) * 100)
    : 0

  // ── Cash runway — months of program delivery at trailing-3-month burn ─────
  // Uses full dataset (filter-independent) — it's an organizational metric.
  const cashRunway = useMemo(() => {
    const now = new Date()
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime()
    const recentOutflow = all
      .filter(tx => tx.amount < 0 && new Date(tx.date).getTime() >= threeMonthsAgo)
      .reduce((s, tx) => s + Math.abs(tx.amount), 0)
    const avgMonthlyBurn = recentOutflow / 3
    const allBalance = all.reduce((s, tx) => s + Number(tx.amount), 0)
    const months = avgMonthlyBurn > 0 ? allBalance / avgMonthlyBurn : null
    return { avgMonthlyBurn, months, balance: allBalance }
  }, [all])

  // ── Period comparison — last 30 days vs prior 30 days (filter-aware) ──────
  const periodDelta = useMemo(() => {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const d30 = now - 30 * dayMs
    const d60 = now - 60 * dayMs
    let last30Cr = 0, prior30Cr = 0, last30Dr = 0, prior30Dr = 0
    for (const tx of filtered) {
      if (!tx.date) continue
      const t = new Date(tx.date).getTime()
      if (isNaN(t)) continue
      const amt = Number(tx.amount)
      if (t >= d30 && t <= now) {
        if (amt > 0) last30Cr += amt; else last30Dr += Math.abs(amt)
      } else if (t >= d60 && t < d30) {
        if (amt > 0) prior30Cr += amt; else prior30Dr += Math.abs(amt)
      }
    }
    const pct = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : null
    return {
      creditsPct: pct(last30Cr, prior30Cr),
      debitsPct:  pct(last30Dr, prior30Dr),
      last30Cr, last30Dr,
    }
  }, [filtered])

  // ── Income channel breakdown (all time) ────────────────────────────────────
  const incomeByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const tx of all) {
      if (tx.amount <= 0) continue
      map[tx._cat] = (map[tx._cat] || 0) + tx.amount
    }
    return map
  }, [all])

  // ── Top-of-page channel totals (all-time, unaffected by source filter) ─────
  const channelTotals = useMemo(() => {
    let stripe = 0, benevity = 0, bankDeposits = 0
    let stripeCount = 0, benevityCount = 0, bankDepositsCount = 0
    for (const tx of all) {
      if (tx.amount <= 0) continue
      const ch = channelOf(tx._cat, tx.amount)
      if (ch === "stripe") { stripe += tx.amount; stripeCount++ }
      else if (ch === "benevity") { benevity += tx.amount; benevityCount++ }
      else if (ch === "bank_deposits") { bankDeposits += tx.amount; bankDepositsCount++ }
    }
    return { stripe, benevity, bankDeposits, stripeCount, benevityCount, bankDepositsCount }
  }, [all])

  // ── Transaction Explorer filtering (date range + channel) ──────────────────
  const explorerTxns = useMemo(() => {
    return all
      .filter(tx => {
        const date = (tx.date ?? "").slice(0, 10)
        if (!date) return false
        if (date < explorerStart || date > explorerEnd) return false
        if (explorerChannel === "all") return true
        return channelOf(tx._cat, tx.amount) === explorerChannel
      })
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
  }, [all, explorerStart, explorerEnd, explorerChannel])

  const explorerCredits = useMemo(
    () => explorerTxns.filter(tx => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0),
    [explorerTxns]
  )
  const explorerDebits = useMemo(
    () => explorerTxns.filter(tx => tx.amount < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0),
    [explorerTxns]
  )

  const VIEW_MORE_LIMIT = 1000
  const explorerVisible = explorerExpanded
    ? explorerTxns.slice(0, VIEW_MORE_LIMIT)
    : explorerTxns.slice(0, 20)

  const downloadExplorerExcel = () => {
    if (explorerTxns.length === 0) return
    const wb = XLSX.utils.book_new()
    const ws: any = {}
    const headers = ["Date", "Amount", "Channel", "Category", "Check #", "Details"]
    const green = "5A7A55", lightGreen = "A2BD9D", dark = "111827", grey = "F3F4F6"
    const border = {
      top: { style: "thin", color: { rgb: "D1D5DB" } },
      bottom: { style: "thin", color: { rgb: "D1D5DB" } },
      left: { style: "thin", color: { rgb: "D1D5DB" } },
      right: { style: "thin", color: { rgb: "D1D5DB" } },
    }

    // Title
    ws["A1"] = {
      v: `Transactions — ${explorerStart} to ${explorerEnd}`,
      t: "s",
      s: {
        fill: { fgColor: { rgb: lightGreen } },
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14 },
        alignment: { horizontal: "left", vertical: "center" },
      },
    }
    // Summary row
    const summary = `Channel: ${explorerChannel === "all" ? "All" : explorerChannel} · ${explorerTxns.length} transactions · +${explorerCredits.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / -${explorerDebits.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ws["A2"] = {
      v: summary,
      t: "s",
      s: { font: { italic: true, color: { rgb: "6B7280" }, sz: 10 } },
    }

    // Header row (row 4, index 3)
    headers.forEach((h, c) => {
      const addr = XLSX.utils.encode_cell({ r: 3, c })
      ws[addr] = {
        v: h,
        t: "s",
        s: {
          fill: { fgColor: { rgb: green } },
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
          alignment: { horizontal: "center", vertical: "center" },
          border,
        },
      }
    })

    // Data rows (start at row 5, index 4)
    explorerTxns.forEach((tx, i) => {
      const r = 4 + i
      const cells = [
        { v: (tx.date ?? "").slice(0, 10), t: "s" },
        { v: Number(tx.amount), t: "n", z: '"$"#,##0.00;[Red]-"$"#,##0.00' },
        { v: channelOf(tx._cat, tx.amount), t: "s" },
        { v: CATEGORY_META[tx._cat]?.label ?? tx._cat, t: "s" },
        { v: tx.check_number ?? "", t: "s" },
        { v: tx.details ?? "", t: "s" },
      ]
      cells.forEach((cell, c) => {
        ws[XLSX.utils.encode_cell({ r, c })] = {
          ...cell,
          s: {
            font: { color: { rgb: dark }, sz: 10 },
            alignment: { horizontal: c === 1 ? "right" : "left", vertical: "center" },
            fill: i % 2 === 0 ? { fgColor: { rgb: "FFFFFF" } } : { fgColor: { rgb: grey } },
            border,
          },
        }
      })
    })

    // Totals row
    const totalRow = 4 + explorerTxns.length
    ws[XLSX.utils.encode_cell({ r: totalRow, c: 0 })] = {
      v: "TOTAL",
      t: "s",
      s: {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
        fill: { fgColor: { rgb: dark } },
        alignment: { horizontal: "left", vertical: "center" },
        border,
      },
    }
    ws[XLSX.utils.encode_cell({ r: totalRow, c: 1 })] = {
      v: explorerCredits - explorerDebits,
      t: "n",
      z: '"$"#,##0.00;[Red]-"$"#,##0.00',
      s: {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
        fill: { fgColor: { rgb: dark } },
        alignment: { horizontal: "right", vertical: "center" },
        border,
      },
    }
    for (let c = 2; c < headers.length; c++) {
      ws[XLSX.utils.encode_cell({ r: totalRow, c })] = {
        v: "",
        t: "s",
        s: {
          fill: { fgColor: { rgb: dark } },
          border,
        },
      }
    }

    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRow, c: headers.length - 1 } })
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
    ]
    ws["!cols"] = [
      { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 60 },
    ]
    ws["!rows"] = [{ hpt: 24 }, { hpt: 18 }, { hpt: 8 }, { hpt: 22 }]
    ws["!freeze"] = { xSplit: 0, ySplit: 4 }

    XLSX.utils.book_append_sheet(wb, ws, "Transactions")
    const channelSuffix = explorerChannel === "all" ? "all" : explorerChannel
    const filename = `transactions_${explorerStart}_to_${explorerEnd}_${channelSuffix}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // ── Volume Over Time (last 30 days, only days with txns) ───────────────────
  const lineData = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const map: Record<string, number> = {}
    for (const tx of filtered) {
      if (!tx.date) continue
      const dObj = new Date(tx.date)
      if (isNaN(dObj.getTime()) || dObj < cutoff) continue
      const d = tx.date.split("T")[0]
      map[d] = (map[d] || 0) + Math.abs(tx.amount)
    }
    const labels = Object.keys(map).sort()
    return {
      labels,
      datasets: [{
        label: "Daily Volume",
        data: labels.map(l => map[l]),
        borderColor: "#A2BD9D",
        backgroundColor: "#A2BD9D33",
        tension: 0.3,
        fill: true,
        pointRadius: 4,
      }],
    }
  }, [filtered])

  // ── Credits vs Debits doughnut ──────────────────────────────────────────────
  const doughnutData = {
    labels: ["Credits (In)", "Debits (Out)"],
    datasets: [{
      data: [totalCredits, totalDebits],
      backgroundColor: ["#A2BD9D", "#E27D7D"],
      hoverOffset: 10,
    }],
  }

  // ── MoM (credits per month, filter-aware) ──────────────────────────────────
  const momChart = useMemo(() => {
    const map = monthlyCredits(filtered)
    const labels = Object.keys(map).sort()
    return {
      labels: labels.map(formatMonthLabel),
      datasets: [{
        label: "Credits per Month",
        data: labels.map(l => map[l]),
        backgroundColor: "#A2BD9D",
        borderRadius: 4,
      }],
    }
  }, [filtered])

  // ── YoY (credits per year, filter-aware) ───────────────────────────────────
  const yoyChart = useMemo(() => {
    const map: Record<string, number> = {}
    for (const tx of filtered) {
      if (tx.amount <= 0) continue
      const y = (tx.date ?? "").slice(0, 4)
      if (!y) continue
      map[y] = (map[y] || 0) + tx.amount
    }
    const labels = Object.keys(map).sort()
    return {
      labels,
      datasets: [{
        label: "Credits per Year",
        data: labels.map(l => map[l]),
        backgroundColor: "#8FA889",
        borderRadius: 4,
      }],
    }
  }, [filtered])

  // ── Pakistan monthly deployment (always full set) ──────────────────────────
  const pakistanMonthlyChart = useMemo(() => {
    const map = monthlyOutflow(pakistanTxns)
    const labels = Object.keys(map).sort()
    return {
      labels: labels.map(formatMonthLabel),
      datasets: [{
        label: "Deployed to Pakistan",
        data: labels.map(l => map[l]),
        backgroundColor: "#D97757",
        borderRadius: 4,
      }],
    }
  }, [pakistanTxns])

  // ── US Operations monthly chart (always full set) ─────────────────────────
  const usOpsMonthlyChart = useMemo(() => {
    const map = monthlyOutflow(usOpsTxns)
    const labels = Object.keys(map).sort()
    return {
      labels: labels.map(formatMonthLabel),
      datasets: [{
        label: "US Operating Spend",
        data: labels.map(l => map[l]),
        backgroundColor: "#6772E5",
        borderRadius: 4,
      }],
    }
  }, [usOpsTxns])

  // ── Income channel breakdown horizontal bar ────────────────────────────────
  const incomeBreakdownChart = useMemo(() => {
    const entries = Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1])
    return {
      labels: entries.map(([cat]) => CATEGORY_META[cat as Category]?.label ?? cat),
      datasets: [{
        label: "Raised",
        data: entries.map(([, v]) => v),
        backgroundColor: entries.map(([cat]) => CATEGORY_META[cat as Category]?.color ?? "#A2BD9D"),
        borderRadius: 4,
      }],
    }
  }, [incomeByCategory])

  // ── Bar value label plugin (handles vertical + horizontal) ─────────────────
  const barLabelPlugin = {
    id: "barLabels",
    afterDatasetsDraw(chart: any) {
      const { ctx } = chart
      const isHorizontal = chart.options?.indexAxis === "y"
      chart.data.datasets.forEach((dataset: any, i: number) => {
        const meta = chart.getDatasetMeta(i)
        meta.data.forEach((bar: any, index: number) => {
          const value = dataset.data[index]
          if (value == null) return
          const label = abbreviateCurrency(Number(value))
          ctx.save()
          ctx.font = "600 11px system-ui, -apple-system, sans-serif"

          if (isHorizontal) {
            const barWidth = Math.abs(bar.x - bar.base)
            ctx.textBaseline = "middle"
            if (barWidth > 60) {
              ctx.fillStyle = "#ffffff"
              ctx.textAlign = "right"
              ctx.fillText(label, bar.x - 8, bar.y)
            } else {
              ctx.fillStyle = "#111827"
              ctx.textAlign = "left"
              ctx.fillText(label, bar.x + 6, bar.y)
            }
          } else {
            const barHeight = Math.abs(bar.base - bar.y)
            if (barHeight > 40) {
              // Vertical white label, rotated 90° counter-clockwise, centered inside the bar
              ctx.save()
              ctx.translate(bar.x, bar.y + barHeight / 2)
              ctx.rotate(-Math.PI / 2)
              ctx.fillStyle = "#ffffff"
              ctx.textAlign = "center"
              ctx.textBaseline = "middle"
              ctx.fillText(label, 0, 0)
              ctx.restore()
            } else {
              ctx.fillStyle = "#111827"
              ctx.textAlign = "center"
              ctx.textBaseline = "bottom"
              ctx.fillText(label, bar.x, bar.y - 4)
            }
          }
          ctx.restore()
        })
      })
    },
  }

  // ── Chart options ───────────────────────────────────────────────────────────
  const chartOptions = {
    layout: { padding: { top: 30, right: 12, bottom: 0, left: 0 } },
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: { color: "#374151", font: { weight: "500" } },
      },
      tooltip: {
        backgroundColor: "rgba(17, 24, 39, 0.95)",
        titleColor: "#ffffff",
        bodyColor: "#ffffff",
        titleFont: { weight: "600" as const, size: 12 },
        bodyFont: { weight: "500" as const, size: 12 },
        padding: 10,
        cornerRadius: 6,
        yAlign: "bottom" as const,
        caretPadding: 6,
        callbacks: {
          label: (ctx: any) => {
            const raw = ctx.raw != null
              ? ctx.raw
              : ctx.chart.options.indexAxis === "y"
                ? ctx.parsed.x
                : ctx.parsed.y
            return ` $${Number(raw).toLocaleString()}`
          },
        },
      },
    },
    scales: {
      x: { ticks: { color: "#6B7280" }, grid: { color: "#E5E7EB" } },
      y: { ticks: { color: "#6B7280" }, grid: { color: "#E5E7EB" } },
    },
    responsive: true,
    maintainAspectRatio: false,
  }

  const horizontalBarOptions = {
    ...chartOptions,
    indexAxis: "y" as const,
    layout: { padding: { top: 10, right: 50, bottom: 0, left: 0 } },
    plugins: {
      ...chartOptions.plugins,
      legend: { display: false },
    },
  }

  const doughnutOptions = {
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: { color: "#374151", font: { weight: "500" } },
      },
      tooltip: {
        backgroundColor: "rgba(17, 24, 39, 0.95)",
        titleColor: "#ffffff",
        bodyColor: "#ffffff",
        padding: 10,
        cornerRadius: 6,
        callbacks: {
          label: (ctx: any) => ` $${ctx.parsed.toLocaleString()}`,
        },
      },
    },
    responsive: true,
    maintainAspectRatio: false,
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-400 text-sm">Loading transactions…</p></div>
  }
  if (error) {
    return <div className="flex items-center justify-center h-64"><p className="text-red-400 text-sm">{error}</p></div>
  }

  const SourcePill = ({ value, label }: { value: SourceFilter; label: string }) => (
    <button
      onClick={() => setSource(value)}
      className={`px-4 py-1.5 text-sm font-medium rounded-full transition ${
        source === value
          ? "bg-[#A2BD9D] text-white shadow-sm"
          : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
      }`}
    >
      {label}
    </button>
  )

  // Stripe view has no debits — the dashboard adapts
  const showDebits = source !== "stripe"

  return (
    <div className="space-y-6">
      {/* Header + Source filter */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600">
            Overview of transactions from your payment exports
          </p>
          {reversalCount > 0 && (
            <button
              type="button"
              onClick={() => setShowReversals(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 mt-1 underline decoration-dotted underline-offset-2 flex items-center gap-1"
            >
              {reversalPairs.length} reversal pair{reversalPairs.length !== 1 ? "s" : ""} netted out ({reversalCount} transactions excluded)
              {showReversals ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <a
            href="/nourished-payment-insights/stripe"
            className="px-4 py-1.5 text-sm font-medium rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition shadow-sm"
          >
            Stripe
          </a>
          <a
            href="/nourished-payment-insights/benevity"
            className="px-4 py-1.5 text-sm font-medium rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition shadow-sm"
          >
            Benevity
          </a>
          <a
            href="/nourished-payment-insights/donor-report"
            className="px-4 py-1.5 text-sm font-medium rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition shadow-sm"
          >
            Donor Report
          </a>
        </div>
      </div>

      {showReversals && reversalPairs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs">
          <p className="font-semibold text-amber-900 mb-2">
            Excluded reversal pairs ({reversalPairs.length})
          </p>
          <p className="text-amber-800 mb-3">
            These credit/debit pairs have identical absolute amounts within 3 days of each other, so they're treated as round-trip refunds and excluded from every metric on this page (except Current Balance, which is exact).
          </p>
          <div className="divide-y divide-amber-200 bg-white rounded border border-amber-200 overflow-hidden">
            {reversalPairs.map((p, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-2 p-3">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-semibold uppercase text-[#4F8A70] bg-[#A2BD9D]/20 px-1.5 py-0.5 rounded mt-0.5 shrink-0">CREDIT</span>
                  <div className="min-w-0">
                    <p className="text-[#4F8A70] font-semibold tabular-nums">+{formatCurrency(Math.abs(Number(p.credit.amount)))}</p>
                    <p className="text-gray-500">{(p.credit.date ?? "").slice(0, 10)}</p>
                    <p className="text-gray-600 truncate">{p.credit.details ?? "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-semibold uppercase text-red-600 bg-red-100 px-1.5 py-0.5 rounded mt-0.5 shrink-0">DEBIT</span>
                  <div className="min-w-0">
                    <p className="text-red-500 font-semibold tabular-nums">-{formatCurrency(Math.abs(Number(p.debit.amount)))}</p>
                    <p className="text-gray-500">{(p.debit.date ?? "").slice(0, 10)}</p>
                    <p className="text-gray-600 truncate">{p.debit.details ?? "—"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI row — adapts to filter */}
      <div className={`grid grid-cols-2 gap-4 ${
        source === "stripe" ? "lg:grid-cols-3" : showDebits ? "lg:grid-cols-6" : "lg:grid-cols-5"
      }`}>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Current Balance</p>
          <p className={`text-2xl font-semibold ${currentBalance < 0 ? "text-red-500" : "text-gray-900"}`}>
            {formatCurrency(currentBalance)}
          </p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Raised</p>
          <p className="text-2xl font-semibold text-[#A2BD9D]">{formatCurrency(totalCredits)}</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-gray-400">{credits.length} donations</p>
            <span
              className="text-xs text-gray-400"
              title={`Last 30 days: ${formatCurrency(periodDelta.last30Cr)} · Prior 30 days: ${formatCurrency(Math.max(periodDelta.last30Cr - (periodDelta.creditsPct !== null ? periodDelta.last30Cr * (periodDelta.creditsPct / 100) / (1 + periodDelta.creditsPct / 100) : 0), 0))}`}
            >
              {periodDelta.last30Cr === 0
                ? <span className="text-gray-400">— none in last 30d</span>
                : periodDelta.creditsPct === null
                  ? <span className="text-[#4F8A70] font-semibold">new activity (30d)</span>
                  : Math.abs(periodDelta.creditsPct) < 1
                    ? <span className="text-gray-500 font-semibold">~ flat (30d)</span>
                    : <span className={`font-semibold ${periodDelta.creditsPct >= 0 ? "text-[#4F8A70]" : "text-red-500"}`}>
                        {periodDelta.creditsPct >= 0 ? "▲" : "▼"} {Math.abs(periodDelta.creditsPct).toFixed(0)}% vs prior 30d
                      </span>}
            </span>
          </div>
        </div>

        {showDebits && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-500">Total Outflow</p>
            <p className="text-2xl font-semibold text-red-400">{formatCurrency(totalDebits)}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-gray-400">{debits.length} payments</p>
              <span className="text-xs text-gray-400">
                {periodDelta.last30Dr === 0
                  ? <span className="text-[#4F8A70] font-semibold">— none in last 30d</span>
                  : periodDelta.debitsPct === null
                    ? <span className="text-red-500 font-semibold">new activity (30d)</span>
                    : Math.abs(periodDelta.debitsPct) < 1
                      ? <span className="text-gray-500 font-semibold">~ flat (30d)</span>
                      : <span className={`font-semibold ${periodDelta.debitsPct >= 0 ? "text-red-500" : "text-[#4F8A70]"}`}>
                          {periodDelta.debitsPct >= 0 ? "▲" : "▼"} {Math.abs(periodDelta.debitsPct).toFixed(0)}% vs prior 30d
                        </span>}
              </span>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Transactions</p>
          <p className="text-2xl font-semibold">{totalCount.toLocaleString()}</p>
        </div>

        {source !== "stripe" && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-500">Deployment Ratio</p>
            <p className="text-2xl font-semibold text-[#D97757]">{deploymentRatio}%</p>
            <p className="text-xs text-gray-400 mt-1">of total raised to Pakistan</p>
          </div>
        )}

        {source !== "stripe" && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-500">Cash Runway</p>
            <p className={`text-2xl font-semibold ${
              cashRunway.months === null
                ? "text-gray-400"
                : cashRunway.months < 3 ? "text-red-500"
                : cashRunway.months < 6 ? "text-[#D97757]"
                : "text-[#4F8A70]"
            }`}>
              {cashRunway.months === null ? "—" : `${cashRunway.months.toFixed(1)} mo`}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              at {formatCurrency(cashRunway.avgMonthlyBurn)}/mo burn
            </p>
          </div>
        )}
      </div>

      {/* Channel Totals — all-time breakdown by source, not affected by filter */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-5 shadow-sm border-l-4 border-[#6772E5]">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Stripe</p>
          <p className="text-2xl font-semibold text-[#6772E5] mt-1">{formatCurrency(channelTotals.stripe)}</p>
          <p className="text-xs text-gray-400 mt-1">{channelTotals.stripeCount} deposits · online donations</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border-l-4 border-[#4F8A70]">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Benevity / Corporate</p>
          <p className="text-2xl font-semibold text-[#4F8A70] mt-1">{formatCurrency(channelTotals.benevity)}</p>
          <p className="text-xs text-gray-400 mt-1">{channelTotals.benevityCount} disbursements · AOG + CyberGrants</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border-l-4 border-[#8FA889]">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Direct Bank Deposits</p>
          <p className="text-2xl font-semibold text-[#8FA889] mt-1">{formatCurrency(channelTotals.bankDeposits)}</p>
          <p className="text-xs text-gray-400 mt-1">{channelTotals.bankDepositsCount} deposits · checks, transfers, other</p>
        </div>
      </div>

      {/* Pakistan Deployment section — hidden in Stripe view (no outflows on Stripe) */}
      {source !== "stripe" && (
      <div className="bg-gradient-to-br from-[#FFF3ED] to-white border border-[#F4B78C]/40 rounded-lg p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-gray-800 font-semibold text-base">🇵🇰 Deployed to Pakistan</h3>
            <p className="text-xs text-gray-500 mt-0.5">Wire transfers + Xoom/Remitly + wire fees — program delivery to Nourished Welfare Trust</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Deployed</p>
            <p className="text-2xl font-semibold text-[#D97757]">{formatCurrency(totalDeployedToPakistan)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Wires (UBL)</p>
            <p className="text-2xl font-semibold text-gray-800">
              {formatCurrency(sumAbs(all.filter(tx => tx._cat === "pakistan_wire")))}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Xoom / Remitly</p>
            <p className="text-2xl font-semibold text-gray-800">
              {formatCurrency(sumAbs(all.filter(tx => tx._cat === "pakistan_xoom")))}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Wire Fees</p>
            <p className="text-2xl font-semibold text-gray-800">{formatCurrency(wireFees)}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-100 h-64">
          <h4 className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Monthly Deployment</h4>
          <div className="h-52">
            {pakistanMonthlyChart.labels.length > 0 ? (
              <Bar data={pakistanMonthlyChart} options={chartOptions} plugins={[barLabelPlugin]} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                No transfers recorded
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* US Operations section — mirrors the Pakistan layout for local spend */}
      {source !== "stripe" && (
      <div className="bg-gradient-to-br from-[#EEF0FF] to-white border border-[#6772E5]/30 rounded-lg p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-gray-800 font-semibold text-base">🇺🇸 US Operations</h3>
            <p className="text-xs text-gray-500 mt-0.5">Zelle, card spend, withdrawals, and bank fees — US-side operating overhead</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 uppercase tracking-wide">of total raised</p>
            <p className="text-xl font-semibold text-[#6772E5]">{usOpsRatio}%</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total US Spend</p>
            <p className="text-2xl font-semibold text-[#6772E5]">{formatCurrency(totalUsOperations)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Zelle Out</p>
            <p className="text-2xl font-semibold text-gray-800">{formatCurrency(zelleOut)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Card Spend</p>
            <p className="text-2xl font-semibold text-gray-800">{formatCurrency(cardSpend)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Withdrawals</p>
            <p className="text-2xl font-semibold text-gray-800">{formatCurrency(withdrawls)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Bank Fees</p>
            <p className="text-2xl font-semibold text-gray-800">{formatCurrency(bankFeesOut)}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-100 h-64">
          <h4 className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Monthly US Spend</h4>
          <div className="h-52">
            {usOpsMonthlyChart.labels.length > 0 ? (
              <Bar data={usOpsMonthlyChart} options={chartOptions} plugins={[barLabelPlugin]} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                No US operating spend recorded
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Charts row 1 — Volume + (conditional) Credits vs Debits */}
      <div className={`grid grid-cols-1 gap-6 ${showDebits ? "lg:grid-cols-2" : ""}`}>
        <div className="bg-white rounded-lg p-4 shadow-sm h-72">
          <h3 className="text-gray-700 font-medium mb-2">
            Volume Over Time <span className="text-xs text-gray-400 font-normal">(last 30 days)</span>
          </h3>
          <div className="h-56">
            {lineData.labels.length > 0 ? (
              <Line data={lineData} options={chartOptions} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                No transactions in the last 30 days
              </div>
            )}
          </div>
        </div>

        {showDebits && (
          <div className="bg-white rounded-lg p-4 shadow-sm h-72">
            <h3 className="text-gray-700 font-medium mb-2">Credits vs Debits</h3>
            <div className="h-56 flex items-center justify-center">
              <Doughnut data={doughnutData} options={doughnutOptions} />
            </div>
          </div>
        )}
      </div>

      {/* Charts row 2 — MoM + YoY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-4 shadow-sm h-80">
          <h3 className="text-gray-700 font-medium mb-2">Month-over-Month (Credits)</h3>
          <div className="h-64">
            {momChart.labels.length > 0 ? (
              <Bar data={momChart} options={chartOptions} plugins={[barLabelPlugin]} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">No data</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm h-80">
          <h3 className="text-gray-700 font-medium mb-2">Year-over-Year (Credits)</h3>
          <div className="h-64">
            {yoyChart.labels.length > 0 ? (
              <Bar data={yoyChart} options={chartOptions} plugins={[barLabelPlugin]} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">No data</div>
            )}
          </div>
        </div>
      </div>

      {/* Income Channel breakdown (All view only) */}
      {source === "all" && incomeBreakdownChart.labels.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-gray-700 font-medium mb-2">Income Channel Breakdown</h3>
          <p className="text-xs text-gray-400 mb-3">Lifetime credits grouped by fundraising channel</p>
          <div className="h-80">
            <Bar
              data={incomeBreakdownChart}
              options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: false } } }}
              plugins={[barLabelPlugin]}
            />
          </div>
        </div>
      )}

      {/* Quarter-over-Quarter */}
      {qoqData.quarters.length > 0 && (
        <section className="mt-4 bg-white rounded-xl shadow-md ring-1 ring-gray-200 overflow-hidden border-t-4 border-[#4F8A70]">
          <div className="px-6 py-5 border-b bg-gradient-to-r from-[#F3F8F0] to-white">
            <div className="flex items-center gap-2">
              <span className="inline-block w-1.5 h-6 rounded-full bg-[#4F8A70]" />
              <h3 className="text-gray-900 font-bold text-lg tracking-tight">Quarter-over-Quarter</h3>
            </div>
            <p className="text-xs text-gray-500 mt-1.5 ml-3.5">
              Bank-based view (reversal pairs excluded). Click any cell for the underlying transactions.
            </p>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b bg-gray-50/70">
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                {qoqKpis.currentLabel} (current)
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1.5">{formatCurrency(qoqKpis.current)}</p>
              {qoqKpis.qoqPct !== null && (
                <p className={`text-xs mt-1 font-medium ${qoqKpis.qoqPct >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {qoqKpis.qoqPct >= 0 ? "▲" : "▼"} {Math.abs(qoqKpis.qoqPct).toFixed(0)}% vs {qoqKpis.priorLabel}
                </p>
              )}
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                {qoqKpis.priorLabel} (prior)
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1.5">{formatCurrency(qoqKpis.prior)}</p>
              {qoqKpis.yoyPct !== null && (
                <p className={`text-xs mt-1 font-medium ${qoqKpis.yoyPct >= 0 ? "text-green-600" : "text-red-500"}`}>
                  YoY: {qoqKpis.yoyPct >= 0 ? "▲" : "▼"} {Math.abs(qoqKpis.yoyPct).toFixed(0)}%
                </p>
              )}
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Trailing 4 quarters</p>
              <p className="text-2xl font-bold text-gray-900 mt-1.5">{formatCurrency(qoqKpis.trailing4)}</p>
              <p className="text-xs text-gray-500 mt-1">rolling TTM</p>
            </div>
            <div className="bg-white rounded-lg border border-[#4F8A70]/30 p-4 shadow-sm bg-gradient-to-br from-white to-[#F3F8F0]">
              <p className="text-[10px] uppercase tracking-wider text-[#4F8A70] font-semibold">Best quarter</p>
              <p className="text-2xl font-bold text-[#4F8A70] mt-1.5">{formatCurrency(qoqKpis.best)}</p>
              <p className="text-xs text-gray-500 mt-1">{formatQuarterLabel(qoqKpis.bestQ)}</p>
            </div>
          </div>

          {/* Quarterly table */}
          <div className="overflow-x-auto p-2">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-xs uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold sticky left-0 bg-gray-100 z-10">Channel</th>
                  {qoqData.quarters.map((q) => (
                    <th key={q} className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                      {formatQuarterLabel(q)}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold whitespace-nowrap bg-gray-200/70">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(Object.keys(QOQ_ROW_META) as QoQRow[]).map((row, idx) => {
                  const meta = QOQ_ROW_META[row]
                  const rowTotal = qoqData.quarters.reduce(
                    (s, q) => s + (qoqData.byRowByQ[row][q] || 0),
                    0,
                  )
                  if (rowTotal === 0) return null
                  const zebra = idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                  return (
                    <tr key={row} className={`${zebra} hover:bg-[#F3F8F0]/60 transition-colors`}>
                      <td className={`px-4 py-3 sticky left-0 ${zebra} z-10 whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: meta.color }} />
                          <span className="text-gray-800 font-medium">{meta.label}</span>
                        </span>
                      </td>
                      {qoqData.quarters.map((q) => {
                        const v = qoqData.byRowByQ[row][q] || 0
                        return (
                          <td
                            key={q}
                            className={`px-4 py-3 text-right tabular-nums cursor-pointer transition-colors ${
                              v > 0 ? "text-gray-900 hover:bg-[#F3F8F0] hover:text-[#4F8A70] hover:font-semibold" : "text-gray-300"
                            }`}
                            onClick={() => v > 0 && setQoqDrill({ quarter: q, row })}
                          >
                            {v > 0 ? formatCurrency(v) : "—"}
                          </td>
                        )
                      })}
                      <td className="px-4 py-3 text-right tabular-nums font-semibold bg-gray-100/70 text-gray-900">
                        {formatCurrency(rowTotal)}
                      </td>
                    </tr>
                  )
                })}
                {/* Total raised row */}
                <tr className="border-t-2 border-[#4F8A70]/40 bg-[#F3F8F0]/70">
                  <td className="px-4 py-3.5 sticky left-0 bg-[#F3F8F0]/70 z-10 font-bold text-gray-900">
                    Total Raised
                  </td>
                  {qoqData.quarters.map((q) => (
                    <td
                      key={q}
                      className="px-4 py-3.5 text-right tabular-nums font-bold cursor-pointer hover:bg-[#E2EEDC] hover:text-[#4F8A70] transition-colors"
                      onClick={() => setQoqDrill({ quarter: q, row: "TOTAL" })}
                    >
                      {formatCurrency(qoqData.incomeTotals[q] || 0)}
                    </td>
                  ))}
                  <td className="px-4 py-3.5 text-right tabular-nums font-bold bg-[#E2EEDC] text-[#4F8A70]">
                    {formatCurrency(qoqData.quarters.reduce((s, q) => s + (qoqData.incomeTotals[q] || 0), 0))}
                  </td>
                </tr>
                {/* Net row (raised - outflow) */}
                <tr className="bg-gray-50/60">
                  <td className="px-4 py-2.5 sticky left-0 bg-gray-50/60 z-10 text-gray-600 text-xs italic">
                    Net (raised − outflow)
                  </td>
                  {qoqData.quarters.map((q) => {
                    const net = qoqData.netTotals[q] || 0
                    return (
                      <td key={q} className={`px-4 py-2.5 text-right tabular-nums text-xs italic ${net >= 0 ? "text-gray-600" : "text-red-500 font-semibold"}`}>
                        {formatCurrency(net)}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs italic bg-gray-100/70 font-semibold text-gray-700">
                    {formatCurrency(qoqData.quarters.reduce((s, q) => s + (qoqData.netTotals[q] || 0), 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Purpose Breakdown — Zakat / Sadaqah / General Donation */}
      {purposeData && (
        <div className="bg-white rounded-lg shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-800 font-semibold">Giving by Purpose</h3>
            <p className="text-xs text-gray-400">
              Donations without a specified purpose are counted as General.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setDrillCategory("zakat")}
              className="text-left rounded-lg border border-[#D4A574]/30 bg-gradient-to-br from-[#FFF5E0] to-[#FDEBC8] p-4 hover:border-[#D4A574] hover:shadow-md transition group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]"
            >
              <p className="text-xs font-semibold tracking-wider uppercase text-[#B8894F] flex items-center justify-between">
                Zakat
                <span className="text-[10px] opacity-0 group-hover:opacity-100 transition">click to view →</span>
              </p>
              <p className="text-2xl font-bold text-[#8B6521] mt-2">
                {formatCurrency(purposeData.totals.zakat.amount)}
              </p>
              <p className="text-xs text-[#8B6521]/70 mt-1">
                {purposeData.totals.zakat.gifts} gift{purposeData.totals.zakat.gifts === 1 ? "" : "s"}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setDrillCategory("sadaqah")}
              className="text-left rounded-lg border border-[#A2BD9D]/30 bg-gradient-to-br from-[#F3F8F0] to-[#E2EEDB] p-4 hover:border-[#A2BD9D] hover:shadow-md transition group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A2BD9D]"
            >
              <p className="text-xs font-semibold tracking-wider uppercase text-[#5F8571] flex items-center justify-between">
                Sadaqah
                <span className="text-[10px] opacity-0 group-hover:opacity-100 transition">click to view →</span>
              </p>
              <p className="text-2xl font-bold text-[#3D5A4B] mt-2">
                {formatCurrency(purposeData.totals.sadaqah.amount)}
              </p>
              <p className="text-xs text-[#3D5A4B]/70 mt-1">
                {purposeData.totals.sadaqah.gifts} gift{purposeData.totals.sadaqah.gifts === 1 ? "" : "s"}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setDrillCategory("charity")}
              className="text-left rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-4 hover:border-gray-400 hover:shadow-md transition group focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            >
              <p className="text-xs font-semibold tracking-wider uppercase text-gray-600 flex items-center justify-between">
                Charity
                <span className="text-[10px] opacity-0 group-hover:opacity-100 transition">click to view →</span>
              </p>
              <p className="text-2xl font-bold text-gray-800 mt-2">
                {formatCurrency(purposeData.totals.charity.amount)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {purposeData.totals.charity.gifts} gift{purposeData.totals.charity.gifts === 1 ? "" : "s"}
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Top Donors */}
      {purposeData && purposeData.topDonors.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-gray-800 font-semibold">
                Top Donors (All-Time)
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Aggregated across Stripe, Benevity, and bank-attached gifts. {purposeData.uniqueDonors} unique donors in total.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPurposeRequestOpen(true)}
                className="text-xs px-3 py-1.5 rounded-md border border-[#A2BD9D] text-[#5F8571] bg-[#F3F8F0] hover:bg-[#E8F1E4]"
              >
                Ask donors to categorize
              </button>
              <a
                href="/nourished-payment-insights/donor-report"
                className="text-xs text-[#5F8571] hover:underline"
              >
                View full donor report →
              </a>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">#</th>
                  <th className="px-5 py-3 text-left font-semibold">Donor</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                  <th className="px-5 py-3 text-right font-semibold">Gifts</th>
                  <th className="px-5 py-3 text-right font-semibold text-[#B8894F]">Zakat</th>
                  <th className="px-5 py-3 text-right font-semibold text-[#5F8571]">Sadaqah</th>
                  <th className="px-5 py-3 text-right font-semibold text-gray-700">Charity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {purposeData.topDonors.map((d, i) => (
                  <tr key={d.email} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-400 font-mono tabular-nums">
                      {i + 1}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{d.name || "Anonymous"}</div>
                      <div className="text-xs text-gray-500 truncate max-w-[280px]">{d.email}</div>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900 tabular-nums">
                      {formatCurrency(d.total)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600 tabular-nums">{d.gifts}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {d.purposeTotals.zakat > 0 ? (
                        <span className="text-[#8B6521]">{formatCurrency(d.purposeTotals.zakat)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {d.purposeTotals.sadaqah > 0 ? (
                        <span className="text-[#5F8571]">{formatCurrency(d.purposeTotals.sadaqah)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                      {d.purposeTotals.charity > 0
                        ? formatCurrency(d.purposeTotals.charity)
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction Explorer */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-gray-700 font-medium">Transaction Explorer</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Filter by date range and channel, then export to Excel. Download includes every matching row.
              </p>
            </div>
            <button
              onClick={downloadExplorerExcel}
              disabled={explorerTxns.length === 0}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-[#A2BD9D] text-white hover:bg-[#8FA889] shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={14} />
              Download Excel
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">From</label>
              <input
                type="date"
                value={explorerStart}
                onChange={(e) => setExplorerStart(e.target.value)}
                className="border border-gray-200 rounded-md px-2 py-1 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">To</label>
              <input
                type="date"
                value={explorerEnd}
                onChange={(e) => setExplorerEnd(e.target.value)}
                className="border border-gray-200 rounded-md px-2 py-1 text-xs"
              />
            </div>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {[
                { v: "all",           label: "All" },
                { v: "stripe",        label: "Stripe" },
                { v: "benevity",      label: "Benevity" },
                { v: "bank_deposits", label: "Bank Deposits" },
                { v: "outflow",       label: "Outflows" },
              ].map(pill => (
                <button
                  key={pill.v}
                  onClick={() => setExplorerChannel(pill.v as any)}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition ${
                    explorerChannel === pill.v
                      ? "bg-[#A2BD9D] text-white shadow-sm"
                      : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
            <span><strong className="text-gray-800">{explorerTxns.length.toLocaleString()}</strong> transactions</span>
            <span>Credits: <strong className="text-[#A2BD9D]">{formatCurrency(explorerCredits)}</strong></span>
            <span>Debits: <strong className="text-red-500">{formatCurrency(explorerDebits)}</strong></span>
            <span>Net: <strong className={explorerCredits - explorerDebits >= 0 ? "text-[#4F8A70]" : "text-red-500"}>
              {formatCurrency(explorerCredits - explorerDebits)}
            </strong></span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {explorerVisible.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No transactions in the selected range.
                  </td>
                </tr>
              ) : (
                explorerVisible.map(tx => {
                  const meta = CATEGORY_META[tx._cat]
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {tx.date.split("T")[0]}
                      </td>
                      <td className={`px-4 py-3 font-medium whitespace-nowrap ${
                        tx.amount < 0 ? "text-red-500" : "text-[#A2BD9D]"
                      }`}>
                        {tx.amount < 0 ? "-" : "+"}
                        {formatCurrency(Math.abs(tx.amount))}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-md truncate">
                        {tx.details ?? "—"}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {explorerTxns.length > 20 && (
          <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Showing {explorerVisible.length.toLocaleString()} of {explorerTxns.length.toLocaleString()} transactions
              {explorerExpanded && explorerTxns.length > VIEW_MORE_LIMIT && (
                <span className="text-amber-600"> · table capped at {VIEW_MORE_LIMIT.toLocaleString()}, download Excel to see all {explorerTxns.length.toLocaleString()}</span>
              )}
            </p>
            <button
              onClick={() => setExplorerExpanded(v => !v)}
              className="text-xs font-medium text-[#4F8A70] hover:text-[#3d6c58] flex items-center gap-1"
            >
              {explorerExpanded ? (
                <>Show less <ChevronUp size={12} /></>
              ) : (
                <>View more <ChevronDown size={12} /></>
              )}
            </button>
          </div>
        )}
      </div>

      {purposeRequestOpen && (
        <PurposeRequestDialog onClose={() => setPurposeRequestOpen(false)} />
      )}

      {drillCategory && (
        <PurposeDrillDialog
          category={drillCategory}
          onClose={() => setDrillCategory(null)}
        />
      )}

      {qoqDrill && (
        <QoQDrillDialog
          quarter={qoqDrill.quarter}
          row={qoqDrill.row}
          transactions={all}
          onClose={() => setQoqDrill(null)}
        />
      )}
    </div>
  )
}

// ─── QoQ drill-down: shows the raw transactions in a specific cell ──────────
function QoQDrillDialog({
  quarter,
  row,
  transactions,
  onClose,
}: {
  quarter: string
  row: QoQRow | "TOTAL"
  transactions: Array<Transaction & { _cat: Category }>
  onClose: () => void
}) {
  const [start, end] = quarterRange(quarter)
  const filtered = transactions.filter((tx) => {
    const d = new Date(tx.date)
    if (d < start || d >= end) return false
    if (row === "TOTAL") return Number(tx.amount) > 0 // income only
    return qoqRowOf(tx) === row
  })
  const total = filtered.reduce(
    (s, tx) =>
      s + (row === "outflow" ? Math.abs(Number(tx.amount)) : Number(tx.amount)),
    0,
  )
  const rowLabel = row === "TOTAL" ? "Total Raised" : QOQ_ROW_META[row].label

  function downloadCsv() {
    const rows = [
      ["Date", "Amount", "Details"].join(","),
      ...filtered
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((tx) =>
          [
            String(tx.date).slice(0, 10),
            Number(tx.amount).toFixed(2),
            `"${(tx.details ?? "").replace(/"/g, '""')}"`,
          ].join(","),
        ),
    ].join("\n")
    const blob = new Blob([rows], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${rowLabel.toLowerCase().replace(/\s+/g, "-")}-${quarter}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">
              {rowLabel} · {formatQuarterLabel(quarter)}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {filtered.length} transaction{filtered.length === 1 ? "" : "s"} · {formatCurrency(total)} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCsv}
              disabled={filtered.length === 0}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              No transactions in this cell.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((tx) => {
                    const amt = Number(tx.amount)
                    return (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-5 py-2 text-gray-600 tabular-nums whitespace-nowrap">
                          {String(tx.date).slice(0, 10)}
                        </td>
                        <td
                          className={`px-5 py-2 text-right tabular-nums font-semibold ${
                            amt < 0 ? "text-red-500" : "text-gray-900"
                          }`}
                        >
                          {formatCurrency(amt)}
                        </td>
                        <td className="px-5 py-2 text-xs text-gray-600 font-mono truncate max-w-[520px]">
                          {tx.details ?? "—"}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Purpose drill-down dialog ────────────────────────────────────────────
function PurposeDrillDialog({
  category,
  onClose,
}: {
  category: "zakat" | "sadaqah" | "charity"
  onClose: () => void
}) {
  type Gift = {
    id: string
    name: string
    email: string
    amount: number
    giftDate: string
    source: string
    storedPurpose: string | null
  }
  const [data, setData] = useState<{
    gifts: Gift[]
    total: number
    count: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
    if (!apiBase) return
    fetch(
      `${apiBase}/reports/donor-purpose/drill?category=${category}`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => setError("Could not load drill-down data"))
  }, [category])

  const labels: Record<typeof category, { title: string; accent: string; headerBg: string; accentText: string }> = {
    zakat: { title: "Zakat", accent: "#D4A574", headerBg: "#FFF5E0", accentText: "#8B6521" },
    sadaqah: { title: "Sadaqah", accent: "#A2BD9D", headerBg: "#F3F8F0", accentText: "#3D5A4B" },
    charity: { title: "Charity", accent: "#9CA3AF", headerBg: "#F9FAFB", accentText: "#374151" },
  }
  const L = labels[category]

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.gifts
    return data.gifts.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.email.includes(q) ||
        g.source.toLowerCase().includes(q),
    )
  }, [data, search])

  function downloadCsv() {
    if (!data) return
    const rows = [
      ["Date", "Donor", "Email", "Amount", "Source", "Stored Purpose"].join(","),
      ...data.gifts.map((g) =>
        [
          g.giftDate,
          `"${(g.name || "").replace(/"/g, '""')}"`,
          g.email,
          g.amount.toFixed(2),
          `"${g.source}"`,
          `"${g.storedPurpose ?? ""}"`,
        ].join(","),
      ),
    ].join("\n")
    const blob = new Blob([rows], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${category}-gifts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div
          className="px-5 py-4 border-b flex items-start justify-between"
          style={{ backgroundColor: L.headerBg }}
        >
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: L.accent }}
              />
              {L.title} · drill-down
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {data
                ? `${data.count} gift${data.count === 1 ? "" : "s"} · ${formatCurrency(data.total)} total`
                : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCsv}
              disabled={!data}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2"
            >
              ×
            </button>
          </div>
        </div>

        <div className="px-5 pt-3 pb-2 border-b">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by donor name, email, or source…"
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:border-[#A2BD9D] focus:ring-1 focus:ring-[#A2BD9D]"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="p-6 text-sm text-red-600">{error}</div>
          ) : !data ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#A2BD9D]" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Donor</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Source</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Stored Label</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((g) => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-gray-600 tabular-nums">
                      {String(g.giftDate).slice(0, 10)}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-gray-900 truncate max-w-[240px]">
                        {g.name || "Anonymous"}
                      </div>
                      {g.email && (
                        <div className="text-xs text-gray-500 truncate max-w-[240px]">
                          {g.email}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                      {formatCurrency(g.amount)}
                    </td>
                    <td className="px-5 py-2.5 text-xs text-gray-600">{g.source}</td>
                    <td className="px-5 py-2.5 text-xs text-gray-500">
                      {g.storedPurpose || <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-sm">
                      No gifts match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Purpose-request dialog: picks donors with uncategorized gifts and
//     sends them an email linking to the /my-gifts page ─────────────────────
function PurposeRequestDialog({ onClose }: { onClose: () => void }) {
  type Candidate = {
    email: string
    name: string
    total: number
    gifts: number
    needsPurpose: number
  }
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle")
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [testEmail, setTestEmail] = useState("")
  const [testStatus, setTestStatus] = useState<string | null>(null)

  useEffect(() => {
    // Use the dedicated endpoint that only returns donors with truly
    // uncategorized gifts (NULL purpose). Already-tagged donors like Fawad,
    // Khurram, Salman don't show up here even though they're top donors.
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
    if (!apiBase) return
    fetch(`${apiBase}/donor/need-purpose-candidates`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        const cs: Candidate[] = data.candidates
        setCandidates(cs)
        // Pre-select the top 10 of the already-filtered list
        setSelected(new Set(cs.slice(0, 10).map((c) => c.email)))
      })
      .catch(() => setError("Could not load donor list"))
  }, [])

  // Fetch a preview. Uses the first selected donor if any, otherwise a sample.
  async function loadPreview() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
    const sample = Array.from(selected)[0] ?? ""
    const url = `${apiBase}/donor/purpose-request-preview${sample ? `?email=${encodeURIComponent(sample)}` : ""}`
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) throw new Error("preview failed")
      const data = await res.json()
      setPreviewHtml(data.html)
      setPreviewOpen(true)
    } catch (err: any) {
      setError(err.message || "Preview failed")
    }
  }

  async function sendTestToMe() {
    if (!testEmail) return
    setTestStatus("sending")
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
      const sample = Array.from(selected)[0] ?? ""
      const res = await fetch(`${apiBase}/donor/send-purpose-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: testEmail, sampleEmail: sample || undefined }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || "Test send failed")
      }
      setTestStatus("sent")
      setTimeout(() => setTestStatus(null), 4000)
    } catch (err: any) {
      setTestStatus(`error: ${err.message}`)
    }
  }

  async function sendEmails() {
    if (selected.size === 0) return
    setStatus("sending")
    setError(null)
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
      const res = await fetch(`${apiBase}/donor/send-purpose-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: Array.from(selected) }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || "Send failed")
      }
      const data = await res.json()
      setResult(data)
      setStatus("done")
    } catch (err: any) {
      setError(err.message)
      setStatus("error")
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">
              Ask donors to categorize their gifts
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Each selected donor gets an email with a link to choose Zakat /
              Sadaqah / Donation for their gifts.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {status === "done" && result ? (
          <div className="p-6 space-y-4">
            <div className="rounded-md bg-green-50 border border-green-200 p-4">
              <p className="font-medium text-green-900">
                {result.sent} email{result.sent === 1 ? "" : "s"} sent
              </p>
              <p className="text-sm text-green-800 mt-1">
                {result.skipped > 0 && `${result.skipped} skipped (already fully categorized). `}
                {result.failed > 0 && `${result.failed} failed.`}
              </p>
            </div>
            {result.failed > 0 && (
              <div className="text-xs border rounded bg-red-50 border-red-200 p-3">
                <p className="font-medium text-red-800 mb-2">Failed deliveries:</p>
                <ul className="space-y-1">
                  {result.details
                    .filter((d: any) => d.status === "failed")
                    .map((d: any) => (
                      <li key={d.email}>
                        <span className="text-gray-700">{d.email}</span> —{" "}
                        <span className="text-red-700">{d.error}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-[#A2BD9D] hover:bg-[#8FA889] text-white rounded"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {error && (
                <div className="text-sm rounded-md bg-red-50 border border-red-200 text-red-700 p-3">
                  {error}
                </div>
              )}
              {!candidates ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#A2BD9D]" />
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>{selected.size} of {candidates.length} selected</span>
                    <div className="flex gap-2">
                      <button
                        className="text-[#5F8571] hover:underline"
                        onClick={() =>
                          setSelected(new Set(candidates.map((c) => c.email)))
                        }
                      >
                        Select all
                      </button>
                      <button
                        className="text-gray-500 hover:underline"
                        onClick={() => setSelected(new Set())}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="border rounded-md divide-y divide-gray-100">
                    {candidates.map((c) => {
                      const checked = selected.has(c.email)
                      return (
                        <label
                          key={c.email}
                          className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = new Set(selected)
                              if (checked) next.delete(c.email)
                              else next.add(c.email)
                              setSelected(next)
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">
                              {c.name || c.email}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {c.email}
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-600 tabular-nums whitespace-nowrap">
                            <div className="font-semibold text-gray-900">
                              ${c.total.toLocaleString()}
                            </div>
                            <div className="text-gray-500">
                              {c.gifts} gift{c.gifts === 1 ? "" : "s"}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@nourishedusa.org"
                  className="flex-1 min-w-[200px] text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:border-[#A2BD9D] focus:ring-1 focus:ring-[#A2BD9D]"
                />
                <button
                  onClick={sendTestToMe}
                  disabled={!testEmail || testStatus === "sending"}
                  className="px-3 py-1.5 text-xs border border-[#A2BD9D] text-[#5F8571] rounded hover:bg-[#F3F8F0] disabled:opacity-50"
                >
                  {testStatus === "sending" ? "Sending…" : "Send test to me"}
                </button>
                <button
                  onClick={loadPreview}
                  className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                >
                  Preview email
                </button>
              </div>
              {testStatus === "sent" && (
                <p className="text-xs text-green-700">✓ Test email sent — check your inbox.</p>
              )}
              {testStatus?.startsWith("error") && (
                <p className="text-xs text-red-600">{testStatus}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-gray-200 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={sendEmails}
                  disabled={status === "sending" || selected.size === 0}
                  className="px-4 py-2 text-sm bg-[#A2BD9D] hover:bg-[#8FA889] text-white rounded disabled:opacity-50"
                >
                  {status === "sending"
                    ? "Sending…"
                    : `Send to ${selected.size} donor${selected.size === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {previewOpen && previewHtml && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Email Preview</h3>
                <p className="text-xs text-gray-500">
                  Exactly what {Array.from(selected)[0] ? `${Array.from(selected)[0]}` : "each recipient"} will see
                </p>
              </div>
              <button
                onClick={() => setPreviewOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-hidden bg-gray-100 p-2">
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                className="w-full h-full bg-white border border-gray-200 rounded"
                style={{ minHeight: "60vh" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

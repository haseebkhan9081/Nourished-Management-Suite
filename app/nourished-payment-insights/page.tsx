//@ts-nocheck
"use client"

import { useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx-js-style"
import { Download, ChevronDown, ChevronUp } from "lucide-react"
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
    </div>
  )
}

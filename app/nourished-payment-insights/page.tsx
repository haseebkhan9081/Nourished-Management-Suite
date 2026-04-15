//@ts-nocheck
"use client"

import { useEffect, useMemo, useState } from "react"
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
function findReversalPairIds(txns: Transaction[], windowDays = 3): Set<number> {
  const excluded = new Set<number>()
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
    }
  }
  return excluded
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
  const [source, setSource] = useState<SourceFilter>("all")

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
  const reversalIds = useMemo(() => findReversalPairIds(raw), [raw])
  const all = useMemo(() => raw.filter(tx => !reversalIds.has(tx.id)), [raw, reversalIds])
  const reversalCount = reversalIds.size

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
  const currentBalance = filtered.reduce((s, tx) => s + tx.amount, 0)

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

  // ── Income channel breakdown (all time) ────────────────────────────────────
  const incomeByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const tx of all) {
      if (tx.amount <= 0) continue
      map[tx._cat] = (map[tx._cat] || 0) + tx.amount
    }
    return map
  }, [all])

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
            <p className="text-xs text-gray-400 mt-1">
              {reversalCount / 2} reversal pair{reversalCount / 2 !== 1 ? "s" : ""} netted out ({reversalCount} transactions excluded)
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Source:</span>
            <SourcePill value="all" label="All" />
            <SourcePill value="bank" label="Bank" />
          </div>
          <a
            href="/nourished-payment-insights/stripe"
            className="px-4 py-1.5 text-sm font-medium rounded-full bg-[#A2BD9D] text-white hover:bg-[#8FA889] transition shadow-sm"
          >
            Stripe
          </a>
          <a
            href="/nourished-payment-insights/benevity"
            className="px-4 py-1.5 text-sm font-medium rounded-full bg-[#A2BD9D] text-white hover:bg-[#8FA889] transition shadow-sm"
          >
            Benevity
          </a>
          <a
            href="/nourished-payment-insights/donor-report"
            className="px-4 py-1.5 text-sm font-medium rounded-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition shadow-sm"
          >
            Donor Report
          </a>
        </div>
      </div>

      {/* KPI row — adapts to filter */}
      <div className={`grid grid-cols-2 gap-4 ${
        source === "stripe" ? "lg:grid-cols-3" : showDebits ? "lg:grid-cols-5" : "lg:grid-cols-4"
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
          <p className="text-xs text-gray-400 mt-1">{credits.length} donations</p>
        </div>

        {showDebits && (
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-500">Total Outflow</p>
            <p className="text-2xl font-semibold text-red-400">{formatCurrency(totalDebits)}</p>
            <p className="text-xs text-gray-400 mt-1">{debits.length} payments</p>
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

      {/* Transactions table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-gray-700 font-medium">Recent Transactions</h3>
          <span className="text-xs text-gray-400">
            {source === "all" ? "All sources" : source === "stripe" ? "Stripe only" : "Bank only"}
          </span>
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
              {filtered.slice(0, 20).map(tx => {
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
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 20 && (
          <div className="px-4 py-3 border-t bg-gray-50 text-center">
            <p className="text-xs text-gray-400">
              Showing 20 of {filtered.length} transactions
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

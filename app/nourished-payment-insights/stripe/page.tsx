//@ts-nocheck
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Bar, Doughnut } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js"
import { ArrowLeft, RefreshCw, Loader2 } from "lucide-react"

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

interface OverviewData {
  currency: string
  asOf: string
  gross: number
  fees: number
  net: number
  chargeCount: number
  refundedCount: number
  refundedTotal: number
  refundRate: number
  activeSubscriptions: number
  uniqueRecurringDonors: number
  subscriptionsByStatus: Record<string, number>
  mrr: number
  avgDonation: number
  uniqueDonors: number
  topDonors: { id: string; name: string | null; email: string | null; total: number; count: number; nameDerived?: boolean }[]
  monthly: { ym: string; gross: number; net: number; count: number }[]
  cardBrands: { brand: string; count: number }[]
  countries: { code: string; count: number }[]
  cached: boolean
}

function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : ""
  return sign + "$" + Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

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
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" })
}

export default function StripeInsightsPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/stripe/overview${refresh ? "?refresh=1" : ""}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.message || "Failed to load")
      setData(j)
    } catch (err: any) {
      setError(err.message || "Something went wrong")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load(false)
  }, [])

  // ── Bar value label plugin ─────────────────────────────────────────────────
  const barLabelPlugin = {
    id: "barLabels",
    afterDatasetsDraw(chart: any) {
      const { ctx } = chart
      chart.data.datasets.forEach((dataset: any, i: number) => {
        const meta = chart.getDatasetMeta(i)
        meta.data.forEach((bar: any, index: number) => {
          const value = dataset.data[index]
          if (value == null) return
          const label = abbreviateCurrency(Number(value))
          ctx.save()
          ctx.font = "600 11px system-ui, -apple-system, sans-serif"
          const barHeight = Math.abs(bar.base - bar.y)
          if (barHeight > 40) {
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
          ctx.restore()
        })
      })
    },
  }

  const monthlyGrossChart = useMemo(() => {
    if (!data) return null
    return {
      labels: data.monthly.map(m => formatMonthLabel(m.ym)),
      datasets: [{
        label: "Gross per Month",
        data: data.monthly.map(m => m.gross),
        backgroundColor: "#6772E5",
        borderRadius: 4,
      }],
    }
  }, [data])

  const cardBrandDoughnut = useMemo(() => {
    if (!data) return null
    const palette = ["#6772E5", "#32325D", "#87BBFD", "#F6A623", "#7A73FF", "#CBD5E1"]
    return {
      labels: data.cardBrands.map(b => b.brand.toUpperCase()),
      datasets: [{
        data: data.cardBrands.map(b => b.count),
        backgroundColor: palette.slice(0, data.cardBrands.length),
        hoverOffset: 8,
      }],
    }
  }, [data])

  const chartOptions = {
    layout: { padding: { top: 30, right: 12, bottom: 0, left: 0 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(17, 24, 39, 0.95)",
        titleColor: "#ffffff",
        bodyColor: "#ffffff",
        titleFont: { weight: "600" as const, size: 12 },
        bodyFont: { weight: "500" as const, size: 12 },
        padding: 10,
        cornerRadius: 6,
        callbacks: {
          label: (ctx: any) => ` $${Number(ctx.raw).toLocaleString()}`,
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

  const doughnutOptions = {
    plugins: {
      legend: { position: "bottom" as const, labels: { color: "#374151", font: { weight: "500" } } },
      tooltip: {
        backgroundColor: "rgba(17, 24, 39, 0.95)",
        titleColor: "#ffffff",
        bodyColor: "#ffffff",
        padding: 10,
        cornerRadius: 6,
      },
    },
    responsive: true,
    maintainAspectRatio: false,
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#6772E5]" />
        <p className="text-sm text-gray-500">Pulling Stripe data (all-time)… first load can take 10-30s</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <p className="text-sm text-red-500">{error ?? "No data"}</p>
        <button
          onClick={() => load(true)}
          className="px-4 py-2 bg-[#6772E5] text-white rounded-md text-sm"
        >
          Try again
        </button>
      </div>
    )
  }

  const netMargin = data.gross > 0 ? (data.net / data.gross) * 100 : 0
  const feeRate = data.gross > 0 ? (data.fees / data.gross) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        href="/nourished-payment-insights"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 shadow-sm transition w-fit"
      >
        <ArrowLeft size={14} /> Back to Payment Insights
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Stripe Insights</h1>
          <p className="text-xs text-gray-400">
            Direct from Stripe API · all-time · {data.cached ? "cached" : "fresh"} · as of {new Date(data.asOf).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/nourished-payment-insights/stripe/payouts"
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-[#6772E5] text-white hover:bg-[#5763d4] shadow-sm"
          >
            Payouts (Bank Reconciliation) →
          </Link>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-200 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Gross Raised</p>
          <p className="text-2xl font-semibold text-[#6772E5]">{formatCurrency(data.gross)}</p>
          <p className="text-xs text-gray-400 mt-1">{data.chargeCount} successful charges</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Stripe Fees</p>
          <p className="text-2xl font-semibold text-orange-500">{formatCurrency(data.fees)}</p>
          <p className="text-xs text-gray-400 mt-1">{feeRate.toFixed(1)}% of gross</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Net Received</p>
          <p className="text-2xl font-semibold text-[#4F8A70]">{formatCurrency(data.net)}</p>
          <p className="text-xs text-gray-400 mt-1">{netMargin.toFixed(1)}% margin</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Avg Donation</p>
          <p className="text-2xl font-semibold text-gray-900">{formatCurrency(data.avgDonation)}</p>
          <p className="text-xs text-gray-400 mt-1">across all charges</p>
        </div>
      </div>

      {/* Second KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Recurring Donors</p>
          <p className="text-2xl font-semibold text-gray-900">{data.uniqueRecurringDonors}</p>
          <p className="text-xs text-gray-400 mt-1">
            {data.activeSubscriptions} subscription{data.activeSubscriptions !== 1 ? "s" : ""}
            {data.subscriptionsByStatus && Object.keys(data.subscriptionsByStatus).length > 0 && (
              <span className="block mt-0.5">
                {Object.entries(data.subscriptionsByStatus)
                  .filter(([, n]) => n > 0)
                  .map(([s, n]) => `${n} ${s}`)
                  .join(" · ")}
              </span>
            )}
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">MRR</p>
          <p className="text-2xl font-semibold text-[#4F8A70]">{formatCurrency(data.mrr)}</p>
          <p className="text-xs text-gray-400 mt-1">monthly recurring</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Refunds</p>
          <p className="text-2xl font-semibold text-red-400">{formatCurrency(data.refundedTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">{data.refundedCount} refunded · {(data.refundRate * 100).toFixed(1)}% rate</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Unique Donors</p>
          <p className="text-2xl font-semibold text-gray-900">{data.uniqueDonors.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">top 10 shown below</p>
        </div>
      </div>

      {/* MoM + Card brands */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg p-4 shadow-sm h-72 lg:col-span-2">
          <h3 className="text-gray-700 font-medium mb-2">Gross per Month</h3>
          <div className="h-56">
            {monthlyGrossChart && monthlyGrossChart.labels.length > 0 ? (
              <Bar data={monthlyGrossChart} options={chartOptions} plugins={[barLabelPlugin]} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">No data</div>
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm h-72">
          <h3 className="text-gray-700 font-medium mb-2">Card Brands</h3>
          <div className="h-56 flex items-center justify-center">
            {cardBrandDoughnut && cardBrandDoughnut.labels.length > 0 ? (
              <Doughnut data={cardBrandDoughnut} options={doughnutOptions} />
            ) : (
              <div className="text-sm text-gray-400">No data</div>
            )}
          </div>
        </div>
      </div>

      {/* Top donors */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="text-gray-700 font-medium">Top Donors (All-time)</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Click a customer ID to open in Stripe dashboard
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Customer ID</th>
                <th className="px-4 py-3 text-right">Donations</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.topDonors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">
                    No donors found
                  </td>
                </tr>
              ) : (
                data.topDonors.map((d, i) => {
                  const isStripeCustomer = d.id.startsWith("cus_")
                  const dashboardUrl = isStripeCustomer
                    ? `https://dashboard.stripe.com/customers/${d.id}`
                    : null
                  return (
                    <tr key={d.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-400">#{i + 1}</td>
                      <td className="px-4 py-3 text-gray-800">
                        {d.name ? (
                          <span className="flex items-center gap-2">
                            {d.name}
                            {d.nameDerived && (
                              <span
                                className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded"
                                title="Derived from email local part — Stripe had no name on file"
                              >
                                from email
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">Anonymous</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{d.email ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {dashboardUrl ? (
                          <a
                            href={dashboardUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#6772E5] hover:underline"
                          >
                            {d.id.slice(0, 14)}…
                          </a>
                        ) : (
                          <span className="text-gray-400">no customer</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{d.count}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#6772E5]">{formatCurrency(d.total)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

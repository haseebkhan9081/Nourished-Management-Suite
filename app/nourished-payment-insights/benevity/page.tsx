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
  asOf: string
  donationCount: number
  uniqueDonors: number
  uniqueCompanies: number
  disbursementCount: number
  personalTotal: number
  matchTotal: number
  feesTotal: number
  netTotal: number
  avgDonation: number
  matchRatio: number
  recurringCount: number
  oneTimeCount: number
  topDonors: Array<{
    id: string
    name: string
    email: string | null
    company: string | null
    personal: number
    match: number
    total: number
    count: number
    nameDerived: boolean
    pending?: boolean
  }>
  topCompanies: Array<{ name: string; personal: number; match: number; total: number; count: number }>
  monthly: Array<{ ym: string; net: number; donationCount: number }>
  pending: {
    count: number
    total: number
    rows: Array<{
      id: number
      date: string
      amount: number
      disbursementId: string | null
      platform: "benevity" | "cybergrants" | "other"
    }>
  }
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

export default function BenevityInsightsPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/benevity/overview${refresh ? "?refresh=1" : ""}`)
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

  useEffect(() => { load(false) }, [])

  // Inline bar-label plugin (same as the other pages)
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

  const monthlyChart = useMemo(() => {
    if (!data) return null
    return {
      labels: data.monthly.map(m => formatMonthLabel(m.ym)),
      datasets: [{
        label: "Net per Month",
        data: data.monthly.map(m => m.net),
        backgroundColor: "#A2BD9D",
        borderRadius: 4,
      }],
    }
  }, [data])

  const companiesChart = useMemo(() => {
    if (!data) return null
    const palette = ["#A2BD9D", "#4F8A70", "#8FA889", "#C9DCC5", "#D97757", "#E9966F", "#F4B78C", "#6772E5", "#87BBFD", "#CBD5E1"]
    return {
      labels: data.topCompanies.map(c => c.name),
      datasets: [{
        data: data.topCompanies.map(c => c.total),
        backgroundColor: palette.slice(0, data.topCompanies.length),
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
        callbacks: {
          label: (ctx: any) => ` $${Number(ctx.parsed).toLocaleString()}`,
        },
      },
    },
    responsive: true,
    maintainAspectRatio: false,
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
        <p className="text-sm text-gray-500">Loading Benevity data…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <p className="text-sm text-red-500">{error ?? "No data"}</p>
        <button onClick={() => load(true)} className="px-4 py-2 bg-[#A2BD9D] text-white rounded-md text-sm">
          Try again
        </button>
      </div>
    )
  }

  if (data.donationCount === 0 && data.pending.count === 0) {
    return (
      <div className="space-y-4">
        <Link
          href="/nourished-payment-insights"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 shadow-sm transition w-fit"
        >
          <ArrowLeft size={14} /> Back to Payment Insights
        </Link>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-sm font-semibold text-yellow-800 mb-2">No Benevity data yet</p>
          <p className="text-xs text-yellow-700">
            Upload at least one "Detailed Donation Report" CSV from the Benevity Causes Portal via the <strong>Upload Corporate</strong> button in the header, then come back to this page.
          </p>
        </div>
      </div>
    )
  }

  const netMargin = data.personalTotal + data.matchTotal > 0
    ? (data.netTotal / (data.personalTotal + data.matchTotal)) * 100
    : 0

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
          <h1 className="text-xl font-semibold text-gray-900">Benevity Insights</h1>
          <p className="text-xs text-gray-400">
            Donor-level data from uploaded Benevity detailed reports · {data.cached ? "cached" : "fresh"} · as of {new Date(data.asOf).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/nourished-payment-insights/benevity/disbursements"
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-[#A2BD9D] text-white hover:bg-[#8FA889] shadow-sm"
          >
            Disbursements
          </Link>
          <Link
            href="/nourished-payment-insights/benevity-reconciliation"
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-200 hover:bg-gray-50 text-gray-700"
          >
            Reconcile vs Bank
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

      {/* Pending upload banner */}
      {data.pending.count > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">
                {data.pending.count} bank deposit{data.pending.count !== 1 ? "s" : ""} awaiting donor-level breakdown ({formatCurrency(data.pending.total)})
              </p>
              <p className="text-xs text-amber-700 mt-1">
                These are Benevity / CyberGrants lump sums from your bank CSV that haven't had their detailed donor reports uploaded yet. They're shown below as placeholder rows with the disbursement/ACH ID as the donor name, and the amounts are included in all totals so reconciliation stays correct. Upload the matching detailed CSVs via the <strong>Upload Corporate</strong> button to replace them with real donor data.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Gross Raised</p>
          <p className="text-2xl font-semibold text-[#A2BD9D]">{formatCurrency(data.personalTotal + data.matchTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">{data.donationCount} donation{data.donationCount !== 1 ? "s" : ""}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Benevity Fees</p>
          <p className="text-2xl font-semibold text-orange-500">{formatCurrency(data.feesTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {data.personalTotal + data.matchTotal > 0
              ? ((data.feesTotal / (data.personalTotal + data.matchTotal)) * 100).toFixed(1)
              : 0}% of gross
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Net Received</p>
          <p className="text-2xl font-semibold text-[#4F8A70]">{formatCurrency(data.netTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">{netMargin.toFixed(1)}% margin</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Avg Donation</p>
          <p className="text-2xl font-semibold text-gray-900">{formatCurrency(data.avgDonation)}</p>
          <p className="text-xs text-gray-400 mt-1">across all donations</p>
        </div>
      </div>

      {/* KPI row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Unique Donors</p>
          <p className="text-2xl font-semibold text-gray-900">{data.uniqueDonors.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">by email</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Corporate Match</p>
          <p className="text-2xl font-semibold text-[#4F8A70]">{formatCurrency(data.matchTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">{(data.matchRatio * 100).toFixed(0)}% of gross</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Matching Companies</p>
          <p className="text-2xl font-semibold text-gray-900">{data.uniqueCompanies}</p>
          <p className="text-xs text-gray-400 mt-1">distinct employers</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Recurring / One-time</p>
          <p className="text-2xl font-semibold text-gray-900">
            {data.recurringCount} / {data.oneTimeCount}
          </p>
          <p className="text-xs text-gray-400 mt-1">{data.disbursementCount} disbursements</p>
        </div>
      </div>

      {/* MoM + Top Companies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg p-4 shadow-sm h-72 lg:col-span-2">
          <h3 className="text-gray-700 font-medium mb-2">Net per Month</h3>
          <div className="h-56">
            {monthlyChart && monthlyChart.labels.length > 0 ? (
              <Bar data={monthlyChart} options={chartOptions} plugins={[barLabelPlugin]} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">No data</div>
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm h-72">
          <h3 className="text-gray-700 font-medium mb-2">Top Matching Companies</h3>
          <div className="h-56 flex items-center justify-center">
            {companiesChart && companiesChart.labels.length > 0 ? (
              <Doughnut data={companiesChart} options={doughnutOptions} />
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
          <p className="text-xs text-gray-400 mt-0.5">Ranked by net amount reaching bank (donation + match − fees)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Donor</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Employer</th>
                <th className="px-4 py-3 text-right">Donations</th>
                <th className="px-4 py-3 text-right">Personal</th>
                <th className="px-4 py-3 text-right">Match</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.topDonors.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-400 text-sm">
                    No donors found
                  </td>
                </tr>
              ) : (
                data.topDonors.map((d, i) => (
                  <tr key={d.id} className={`hover:bg-gray-50/50 ${d.pending ? "bg-amber-50/50" : ""}`}>
                    <td className="px-4 py-3 text-gray-400">#{i + 1}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {d.name}
                      {d.nameDerived && (
                        <span
                          className="ml-2 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded"
                          title="Derived from email — Benevity had no name on file"
                        >
                          from email
                        </span>
                      )}
                      {d.pending && (
                        <span
                          className="ml-2 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded"
                          title="Bank deposit without matching donor-level CSV yet. Upload the detailed report to replace this placeholder."
                        >
                          pending upload
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{d.email ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{d.company ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{d.count}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(d.personal)}</td>
                    <td className="px-4 py-3 text-right text-[#4F8A70]">{formatCurrency(d.match)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#A2BD9D]">{formatCurrency(d.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

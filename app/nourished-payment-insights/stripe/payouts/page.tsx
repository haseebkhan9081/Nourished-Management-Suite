//@ts-nocheck
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, RefreshCw, Loader2, ExternalLink } from "lucide-react"

interface Payout {
  id: string
  amount: number
  currency: string
  arrivalDate: string
  created: string
  status: string
  method: string
  statementDescriptor: string | null
  traceId: string | null
}

interface PayoutsResponse {
  asOf: string
  count: number
  totalAmount: number
  payouts: Payout[]
  cached: boolean
}

function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : ""
  return sign + "$" + Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

const statusStyle: Record<string, string> = {
  paid:      "bg-[#4F8A70]/15 text-[#4F8A70]",
  pending:   "bg-amber-100 text-amber-700",
  in_transit:"bg-blue-100 text-blue-700",
  failed:    "bg-red-100 text-red-700",
  canceled:  "bg-gray-100 text-gray-500",
}

export default function PayoutsPage() {
  const [data, setData] = useState<PayoutsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/stripe/payouts${refresh ? "?refresh=1" : ""}`)
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#6772E5]" />
        <p className="text-sm text-gray-500">Loading payouts…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <p className="text-sm text-red-500">{error ?? "No data"}</p>
        <button onClick={() => load(true)} className="px-4 py-2 bg-[#6772E5] text-white rounded-md text-sm">
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        href="/nourished-payment-insights/stripe"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 shadow-sm transition w-fit"
      >
        <ArrowLeft size={14} /> Back to Stripe Insights
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Stripe Payouts (Bank Reconciliation)</h1>
          <p className="text-xs text-gray-400">
            Each row is one batched transfer to your Wells Fargo account. Click any row to see which donations were bundled into it.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-200 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Payouts</p>
          <p className="text-2xl font-semibold text-gray-900">{data.count.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Paid Out</p>
          <p className="text-2xl font-semibold text-[#6772E5]">{formatCurrency(data.totalAmount)}</p>
          <p className="text-xs text-gray-400 mt-1">sum of "paid" payouts only</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Data Freshness</p>
          <p className="text-sm font-medium text-gray-800 mt-1">{data.cached ? "Cached" : "Fresh"}</p>
          <p className="text-xs text-gray-400">as of {new Date(data.asOf).toLocaleString()}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="text-gray-700 font-medium">All Payouts</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Match a row to your Wells Fargo CSV by <span className="font-medium">arrival date + amount</span>
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Arrival Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Method</th>
                <th className="px-4 py-3 text-left">Trace / Descriptor</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.payouts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">
                    No payouts yet
                  </td>
                </tr>
              ) : (
                data.payouts.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(p.arrivalDate)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#6772E5]">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.method}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {p.traceId ?? p.statementDescriptor ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/nourished-payment-insights/stripe/payouts/${p.id}`}
                        className="text-[#6772E5] hover:underline text-xs inline-flex items-center gap-1"
                      >
                        Drill in <ExternalLink size={11} />
                      </Link>
                    </td>
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

//@ts-nocheck
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, ExternalLink, RefreshCw } from "lucide-react"

interface Disbursement {
  disbursement_id: string
  donation_count: number
  unique_donors: number
  total_donation: number
  total_match: number
  total_fees: number
  net_received: number
  first_donation_at: string
  last_donation_at: string
}

function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : ""
  return sign + "$" + Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

export default function BenevityDisbursementsPage() {
  const [rows, setRows] = useState<Disbursement[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/benevity/disbursements`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Failed to load")
      // Backend returns NUMERIC as strings — coerce
      const data = (j.disbursements ?? []).map((d: any) => ({
        disbursement_id: d.disbursement_id,
        donation_count: Number(d.donation_count) || 0,
        unique_donors: Number(d.unique_donors) || 0,
        total_donation: Number(d.total_donation) || 0,
        total_match: Number(d.total_match) || 0,
        total_fees: Number(d.total_fees) || 0,
        net_received: Number(d.net_received) || 0,
        first_donation_at: d.first_donation_at,
        last_donation_at: d.last_donation_at,
      }))
      setRows(data)
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
        <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
        <p className="text-sm text-gray-500">Loading Benevity disbursements…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={() => load(true)} className="px-4 py-2 bg-[#A2BD9D] text-white rounded-md text-sm">Try again</button>
      </div>
    )
  }

  const totals = rows.reduce((acc, r) => ({
    donations: acc.donations + r.donation_count,
    donors: acc.donors + r.unique_donors,
    gross: acc.gross + r.total_donation + r.total_match,
    fees: acc.fees + r.total_fees,
    net: acc.net + r.net_received,
  }), { donations: 0, donors: 0, gross: 0, fees: 0, net: 0 })

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        href="/nourished-payment-insights/benevity"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 shadow-sm transition w-fit"
      >
        <ArrowLeft size={14} /> Back to Benevity Insights
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Benevity Disbursements</h1>
          <p className="text-xs text-gray-400">
            Each row is one bi-weekly batch from Benevity → Wells Fargo. Click any row to see which donations were bundled into it.
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Disbursements</p>
          <p className="text-2xl font-semibold text-gray-900">{rows.length}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Donations</p>
          <p className="text-2xl font-semibold text-gray-900">{totals.donations}</p>
          <p className="text-xs text-gray-400 mt-1">{totals.donors} unique donors</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Gross Raised</p>
          <p className="text-2xl font-semibold text-[#A2BD9D]">{formatCurrency(totals.gross)}</p>
          <p className="text-xs text-gray-400 mt-1">{formatCurrency(totals.fees)} fees</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-[#4F8A70]/30">
          <p className="text-sm text-gray-500">Net to Bank</p>
          <p className="text-2xl font-semibold text-[#4F8A70]">{formatCurrency(totals.net)}</p>
          <p className="text-xs text-gray-400 mt-1">across all disbursements</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="text-gray-700 font-medium">All Disbursements</h3>
          <p className="text-xs text-gray-400 mt-0.5">Sorted by most recent donation date</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Disbursement ID</th>
                <th className="px-4 py-3 text-left">Period</th>
                <th className="px-4 py-3 text-right">Donors</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">Fees</th>
                <th className="px-4 py-3 text-right">Net to Bank</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No disbursements yet. Upload Benevity CSVs via the "Upload Benevity" button.
                  </td>
                </tr>
              ) : (
                rows.map(r => (
                  <tr key={r.disbursement_id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.disbursement_id}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {formatDate(r.first_donation_at)} – {formatDate(r.last_donation_at)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                      {r.donation_count}
                      {r.unique_donors !== r.donation_count && (
                        <span className="text-xs text-gray-400"> ({r.unique_donors} unique)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#A2BD9D] whitespace-nowrap tabular-nums">
                      {formatCurrency(r.total_donation + r.total_match)}
                    </td>
                    <td className="px-4 py-3 text-right text-orange-500 whitespace-nowrap tabular-nums">
                      {formatCurrency(r.total_fees)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[#4F8A70] whitespace-nowrap tabular-nums">
                      {formatCurrency(r.net_received)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/nourished-payment-insights/benevity/disbursements/${r.disbursement_id}`}
                        className="text-[#A2BD9D] hover:underline text-xs inline-flex items-center gap-1"
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

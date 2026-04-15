//@ts-nocheck
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, HelpCircle, Clock, RefreshCw } from "lucide-react"

interface ReconRow {
  status: "matched" | "mismatch" | "missing_benevity" | "missing_bank"
  disbursementId: string | null
  bankDate: string | null
  bankAmount: number | null
  bankDetails: string | null
  benevityNet: number | null
  benevityDonorCount: number | null
  benevityUniqueDonors: number | null
  difference: number | null
}

interface ReconData {
  summary: {
    total: number
    matched: number
    mismatch: number
    missingBenevity: number
    missingBank: number
    bankTotal: number
    benevityTotal: number
    cybergrantCount: number
    cybergrantTotal: number
  }
  rows: ReconRow[]
  cybergrantBankRows: Array<{
    id: number
    date: string
    amount: number
    details: string
  }>
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "—"
  const sign = value < 0 ? "-" : ""
  return sign + "$" + Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

const STATUS_META = {
  matched: {
    label: "Matched",
    Icon: CheckCircle2,
    bg: "bg-[#A2BD9D]/15",
    text: "text-[#4F8A70]",
    ring: "ring-[#A2BD9D]/30",
  },
  mismatch: {
    label: "Amount Mismatch",
    Icon: AlertCircle,
    bg: "bg-red-100",
    text: "text-red-600",
    ring: "ring-red-200",
  },
  missing_benevity: {
    label: "Missing in Benevity",
    Icon: HelpCircle,
    bg: "bg-amber-100",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
  missing_bank: {
    label: "Missing in Bank",
    Icon: Clock,
    bg: "bg-orange-100",
    text: "text-orange-600",
    ring: "ring-orange-200",
  },
}

export default function BenevityReconciliationPage() {
  const [data, setData] = useState<ReconData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/reports/benevity-reconciliation")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Failed to load reconciliation")
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
        <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
        <p className="text-sm text-gray-500">Loading reconciliation…</p>
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

  const { summary, rows } = data
  const diffTotal = summary.bankTotal - summary.benevityTotal
  const perfectMatch = summary.mismatch === 0 && summary.missingBenevity === 0 && summary.missingBank === 0

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
          <h1 className="text-xl font-semibold text-gray-900">Benevity ↔ Wells Fargo Reconciliation</h1>
          <p className="text-xs text-gray-400 mt-1">
            Matches each bank <span className="font-mono">AMER ONLINE GIV</span> deposit against its corresponding Benevity disbursement using the REF*TN* code. Verifies the penny-level amount.
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Bank Total (AOG)</p>
          <p className="text-2xl font-semibold text-[#6772E5]">{formatCurrency(summary.bankTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">all AMER ONLINE GIV deposits</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Benevity Total (Net)</p>
          <p className="text-2xl font-semibold text-[#4F8A70]">{formatCurrency(summary.benevityTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">sum of uploaded disbursements</p>
        </div>
        <div className={`bg-white rounded-lg p-4 shadow-sm ${Math.abs(diffTotal) < 0.01 ? "" : "ring-2 ring-red-300"}`}>
          <p className="text-sm text-gray-500">Difference</p>
          <p className={`text-2xl font-semibold ${Math.abs(diffTotal) < 0.01 ? "text-[#4F8A70]" : "text-red-500"}`}>
            {formatCurrency(diffTotal)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{Math.abs(diffTotal) < 0.01 ? "✓ reconciled" : "needs investigation"}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Matched</p>
          <p className="text-2xl font-semibold text-[#4F8A70]">{summary.matched}</p>
          <p className="text-xs text-gray-400 mt-1">of {summary.total}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Issues</p>
          <p className="text-2xl font-semibold text-red-500">
            {summary.mismatch + summary.missingBenevity + summary.missingBank}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {summary.mismatch} mismatch · {summary.missingBenevity} bank-only · {summary.missingBank} benevity-only
          </p>
        </div>
      </div>

      {perfectMatch && (
        <div className="bg-[#A2BD9D]/10 border border-[#A2BD9D]/40 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle2 size={20} className="text-[#4F8A70] shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#4F8A70]">Fully reconciled</p>
            <p className="text-xs text-gray-600">Every Benevity disbursement on file has a matching bank deposit with identical amounts. No action required.</p>
          </div>
        </div>
      )}

      {/* CyberGrants note */}
      {summary.cybergrantCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          <strong>Note:</strong> {summary.cybergrantCount} CYBERGRANTS bank deposit{summary.cybergrantCount !== 1 ? "s" : ""} totaling {formatCurrency(summary.cybergrantTotal)} were found on the bank side. CyberGrants uses different disbursement IDs than Benevity AOG, so they can't be reconciled via this view. They're shown in the main dashboard under "Corporate / Platform Giving."
        </div>
      )}

      {/* Reconciliation table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="text-gray-700 font-medium">All Disbursements</h3>
          <p className="text-xs text-gray-400 mt-0.5">Sorted by status: mismatches first, then matched, then orphans</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Disbursement ID</th>
                <th className="px-4 py-3 text-left">Bank Date</th>
                <th className="px-4 py-3 text-right">Bank Amount</th>
                <th className="px-4 py-3 text-right">Benevity Net</th>
                <th className="px-4 py-3 text-right">Diff</th>
                <th className="px-4 py-3 text-right">Donors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-sm">
                    No reconciliation data. Upload Benevity CSVs and/or bank transactions first.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const meta = STATUS_META[row.status]
                  const Icon = meta.Icon
                  return (
                    <tr key={`${row.disbursementId ?? "noid"}-${i}`} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>
                          <Icon size={11} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {row.disbursementId ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(row.bankDate)}</td>
                      <td className="px-4 py-3 text-right font-medium text-[#6772E5] whitespace-nowrap tabular-nums">
                        {formatCurrency(row.bankAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-[#4F8A70] whitespace-nowrap tabular-nums">
                        {formatCurrency(row.benevityNet)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums ${
                        row.difference === null
                          ? "text-gray-300"
                          : Math.abs(row.difference) < 0.01
                            ? "text-[#4F8A70]"
                            : "text-red-500"
                      }`}>
                        {row.difference === null ? "—" : formatCurrency(row.difference)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                        {row.benevityDonorCount ?? "—"}
                        {row.benevityUniqueDonors != null && row.benevityUniqueDonors !== row.benevityDonorCount && (
                          <span className="text-xs text-gray-400"> ({row.benevityUniqueDonors} unique)</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg p-4 shadow-sm text-xs text-gray-600 space-y-1">
        <p><strong className="text-[#4F8A70]">Matched</strong> — bank deposit amount equals Benevity net total (within $0.01)</p>
        <p><strong className="text-red-600">Amount Mismatch</strong> — both exist but differ. Usually caused by a manual adjustment or fee correction. Click the row's disbursement ID to drill in.</p>
        <p><strong className="text-amber-700">Missing in Benevity</strong> — bank shows the deposit but you haven't uploaded the Benevity CSV for that disbursement yet. Go to Upload Benevity → drop the matching report.</p>
        <p><strong className="text-orange-600">Missing in Bank</strong> — Benevity shows a disbursement but the bank CSV doesn't contain it. Either the deposit hasn't arrived yet (typical 3-5 business day ACH delay) or your bank CSV is outdated.</p>
      </div>
    </div>
  )
}

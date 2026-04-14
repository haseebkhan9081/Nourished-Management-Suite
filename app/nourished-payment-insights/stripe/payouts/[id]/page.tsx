//@ts-nocheck
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Loader2, Info } from "lucide-react"

interface PayoutDetail {
  id: string
  amount: number
  currency: string
  arrivalDate: string
  created: string
  status: string
  method: string
  statementDescriptor: string | null
  traceId: string | null
  summary: {
    chargeCount: number
    refundCount: number
    gross: number
    fees: number
    net: number
  }
  breakdown: {
    donations:  { count: number; gross: number; fees: number; net: number }
    refunds:    { count: number; net: number }
    disputes:   { count: number; net: number }
    accounting: { count: number; net: number }
    other:      { count: number; net: number }
  }
  charges: Array<{
    id: string
    created: string
    gross: number
    fee: number
    net: number
    type: string
    typeLabel: string
    bucket: "donation" | "refund" | "dispute" | "accounting" | "other"
    description: string | null
    donorName: string | null
    donorEmail: string | null
    nameDerived: boolean
    chargeId: string | null
  }>
}

function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : ""
  return sign + "$" + Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export default function PayoutDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [data, setData] = useState<PayoutDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAccounting, setShowAccounting] = useState(false)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/stripe/payouts/${id}`)
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || j.message || "Failed to load")
        setData(j)
      } catch (err: any) {
        setError(err.message || "Something went wrong")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#6772E5]" />
        <p className="text-sm text-gray-500">Loading payout details…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <p className="text-sm text-red-500">{error ?? "No data"}</p>
        <Link href="/nourished-payment-insights/stripe/payouts" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft size={12} /> Back to payouts
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        href="/nourished-payment-insights/stripe/payouts"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 shadow-sm transition w-fit"
      >
        <ArrowLeft size={14} /> Back to all payouts
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Payout of {formatCurrency(data.amount)}
        </h1>
        <p className="text-xs text-gray-400">
          Arrived {formatDate(data.arrivalDate)} · {data.method} · status: {data.status}
          {data.traceId && <> · trace <span className="font-mono">{data.traceId}</span></>}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Donations</p>
          <p className="text-2xl font-semibold text-[#6772E5]">{data.breakdown.donations.count}</p>
          <p className="text-xs text-gray-400 mt-1">{formatCurrency(data.breakdown.donations.gross)} gross</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Stripe Fees</p>
          <p className="text-2xl font-semibold text-orange-500">{formatCurrency(data.breakdown.donations.fees)}</p>
          <p className="text-xs text-gray-400 mt-1">{data.breakdown.donations.gross > 0 ? ((data.breakdown.donations.fees / data.breakdown.donations.gross) * 100).toFixed(1) : 0}% of gross</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Refunds / Disputes</p>
          <p className="text-2xl font-semibold text-red-500">
            {formatCurrency(data.breakdown.refunds.net + data.breakdown.disputes.net)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {data.breakdown.refunds.count} refund{data.breakdown.refunds.count !== 1 ? "s" : ""}
            {data.breakdown.disputes.count > 0 && ` · ${data.breakdown.disputes.count} dispute${data.breakdown.disputes.count !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-[#4F8A70]/30">
          <p className="text-sm text-gray-500">Net to Bank</p>
          <p className="text-2xl font-semibold text-[#4F8A70]">{formatCurrency(data.amount)}</p>
          <p className="text-xs text-gray-400 mt-1">matches CSV row ✓</p>
        </div>
      </div>

      {/* Breakdown explainer */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Info size={16} className="text-gray-400" />
          <h3 className="text-gray-700 font-medium text-sm">How this payout was calculated</h3>
        </div>
        <div className="space-y-1.5 text-sm font-mono">
          <div className="flex justify-between text-gray-600">
            <span>Donations (gross)</span>
            <span className="text-[#6772E5]">+{formatCurrency(data.breakdown.donations.gross)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Stripe fees</span>
            <span className="text-orange-500">−{formatCurrency(data.breakdown.donations.fees)}</span>
          </div>
          {data.breakdown.refunds.count > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Refunds netted</span>
              <span className="text-red-500">{formatCurrency(data.breakdown.refunds.net)}</span>
            </div>
          )}
          {data.breakdown.disputes.count > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Disputes netted</span>
              <span className="text-red-500">{formatCurrency(data.breakdown.disputes.net)}</span>
            </div>
          )}
          {data.breakdown.accounting.count > 0 && (
            <div className="flex justify-between text-gray-400 text-xs pt-1">
              <span>Reserve hold/release (zero-sum)</span>
              <span>{formatCurrency(data.breakdown.accounting.net)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 border-t pt-2 mt-2">
            <span>Arrives in Wells Fargo</span>
            <span className="text-[#4F8A70]">{formatCurrency(data.amount)}</span>
          </div>
        </div>
      </div>

      {/* Charges table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h3 className="text-gray-700 font-medium">Transactions in this Payout</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Click a charge ID to open in Stripe dashboard
            </p>
          </div>
          {data.breakdown.accounting.count > 0 && (
            <button
              onClick={() => setShowAccounting(s => !s)}
              className="text-xs text-gray-500 hover:text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1"
            >
              {showAccounting ? "Hide" : "Show"} {data.breakdown.accounting.count} accounting adjustment{data.breakdown.accounting.count !== 1 ? "s" : ""}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Donor</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">Fee</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="px-4 py-3 text-left">Charge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(() => {
                const rows = data.charges.filter(c => showAccounting || c.bucket !== "accounting")
                if (rows.length === 0) {
                  return (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-gray-400 text-sm">
                        No transactions to show
                      </td>
                    </tr>
                  )
                }
                return rows.map(c => {
                  const typeStyle: Record<string, string> = {
                    charge: "bg-[#6772E5]/15 text-[#6772E5]",
                    refund: "bg-red-100 text-red-600",
                    payment_refund: "bg-red-100 text-red-600",
                    adjustment: "bg-amber-100 text-amber-700",
                    stripe_fee: "bg-orange-100 text-orange-700",
                    dispute: "bg-red-100 text-red-700",
                  }
                  const badgeClass = typeStyle[c.type] ?? "bg-gray-100 text-gray-600"
                  const isOutflow = c.net < 0
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
                          {c.typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {c.donorName ? (
                          <span className="flex items-center gap-2">
                            {c.donorName}
                            {c.nameDerived && (
                              <span
                                className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded"
                                title="Derived from email local part — Stripe had no name on file"
                              >
                                from email
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{c.donorEmail ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{formatDateTime(c.created)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${c.type === "charge" ? "text-[#6772E5]" : "text-red-500"}`}>
                        {c.type === "charge" ? "+" : ""}{formatCurrency(c.gross)}
                      </td>
                      <td className="px-4 py-3 text-right text-orange-500">
                        {c.fee !== 0 ? formatCurrency(c.fee) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${isOutflow ? "text-red-500" : "text-[#4F8A70]"}`}>
                        {formatCurrency(c.net)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {c.chargeId ? (
                          <a
                            href={`https://dashboard.stripe.com/payments/${c.chargeId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#6772E5] hover:underline"
                          >
                            {c.chargeId.slice(0, 14)}…
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

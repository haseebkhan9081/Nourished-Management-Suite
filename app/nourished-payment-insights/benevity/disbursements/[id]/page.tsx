//@ts-nocheck
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Loader2, Info } from "lucide-react"

interface BenevityDonation {
  id: number
  disbursement_id: string
  transaction_id: string
  donation_date: string
  company: string | null
  project: string | null
  donor_first_name: string | null
  donor_last_name: string | null
  donor_email: string | null
  donation_frequency: string | null
  currency: string
  donation_amount: number | string
  match_amount: number | string
  cause_support_fee: number | string
  merchant_fee: number | string
  comment: string | null
}

function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : ""
  return sign + "$" + Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function deriveNameFromEmail(email: string | null): string | null {
  if (!email) return null
  const local = email.split("@")[0]
  if (!local) return null
  const cleaned = local
    .replace(/\+.*$/, "")
    .replace(/[0-9]+$/, "")
    .replace(/[._-]+/g, " ")
    .trim()
  if (!cleaned) return null
  return cleaned.split(/\s+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

export default function BenevityDisbursementDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [donations, setDonations] = useState<BenevityDonation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/benevity/disbursements/${id}`)
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || "Failed to load")
        setDonations(j.donations ?? [])
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
        <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
        <p className="text-sm text-gray-500">Loading disbursement details…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <p className="text-sm text-red-500">{error}</p>
        <Link href="/nourished-payment-insights/benevity/disbursements" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft size={12} /> Back to all disbursements
        </Link>
      </div>
    )
  }

  if (!donations.length) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <p className="text-sm text-gray-500">No donations found for disbursement {id}</p>
        <Link
          href="/nourished-payment-insights/benevity/disbursements"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm"
        >
          <ArrowLeft size={14} /> Back to all disbursements
        </Link>
      </div>
    )
  }

  // Compute totals
  const totals = donations.reduce((acc, d) => {
    const donation = Number(d.donation_amount) || 0
    const match = Number(d.match_amount) || 0
    const fees = (Number(d.cause_support_fee) || 0) + (Number(d.merchant_fee) || 0)
    return {
      donation: acc.donation + donation,
      match: acc.match + match,
      fees: acc.fees + fees,
      net: acc.net + donation + match - fees,
      count: acc.count + 1,
    }
  }, { donation: 0, match: 0, fees: 0, net: 0, count: 0 })

  const uniqueDonors = new Set(donations.map(d => d.donor_email ?? d.transaction_id)).size
  const uniqueCompanies = new Set(donations.map(d => d.company).filter(Boolean)).size
  const firstDate = donations.reduce((earliest, d) =>
    new Date(d.donation_date) < new Date(earliest) ? d.donation_date : earliest,
    donations[0].donation_date
  )
  const lastDate = donations.reduce((latest, d) =>
    new Date(d.donation_date) > new Date(latest) ? d.donation_date : latest,
    donations[0].donation_date
  )

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        href="/nourished-payment-insights/benevity/disbursements"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 shadow-sm transition w-fit"
      >
        <ArrowLeft size={14} /> Back to all disbursements
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Disbursement {id}
        </h1>
        <p className="text-xs text-gray-400">
          {formatDateTime(firstDate)} – {formatDateTime(lastDate)} · {totals.count} donation{totals.count !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Donations</p>
          <p className="text-2xl font-semibold text-gray-900">{totals.count}</p>
          <p className="text-xs text-gray-400 mt-1">{uniqueDonors} unique donors · {uniqueCompanies} companies</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Gross</p>
          <p className="text-2xl font-semibold text-[#A2BD9D]">{formatCurrency(totals.donation + totals.match)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {formatCurrency(totals.donation)} donor + {formatCurrency(totals.match)} match
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Benevity Fees</p>
          <p className="text-2xl font-semibold text-orange-500">{formatCurrency(totals.fees)}</p>
          <p className="text-xs text-gray-400 mt-1">cause support + merchant</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-[#4F8A70]/30">
          <p className="text-sm text-gray-500">Net to Bank</p>
          <p className="text-2xl font-semibold text-[#4F8A70]">{formatCurrency(totals.net)}</p>
          <p className="text-xs text-gray-400 mt-1">should match your CSV row</p>
        </div>
      </div>

      {/* Breakdown explainer */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Info size={16} className="text-gray-400" />
          <h3 className="text-gray-700 font-medium text-sm">How this disbursement was calculated</h3>
        </div>
        <div className="space-y-1.5 text-sm font-mono">
          <div className="flex justify-between text-gray-600">
            <span>Donor personal contributions</span>
            <span className="text-[#6772E5]">+{formatCurrency(totals.donation)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Corporate match</span>
            <span className="text-[#4F8A70]">+{formatCurrency(totals.match)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Benevity fees</span>
            <span className="text-orange-500">−{formatCurrency(totals.fees)}</span>
          </div>
          <div className="flex justify-between font-semibold text-gray-900 border-t pt-2 mt-2">
            <span>Arrives in Wells Fargo</span>
            <span className="text-[#4F8A70]">{formatCurrency(totals.net)}</span>
          </div>
        </div>
      </div>

      {/* Donations table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="text-gray-700 font-medium">Donations in this Disbursement</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Donor</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Employer</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Donation</th>
                <th className="px-4 py-3 text-right">Match</th>
                <th className="px-4 py-3 text-right">Fees</th>
                <th className="px-4 py-3 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {donations
                .map(d => {
                  const donation = Number(d.donation_amount) || 0
                  const match = Number(d.match_amount) || 0
                  const fees = (Number(d.cause_support_fee) || 0) + (Number(d.merchant_fee) || 0)
                  const net = donation + match - fees
                  return { d, donation, match, fees, net }
                })
                .sort((a, b) => b.net - a.net)
                .map(({ d, donation, match, fees, net }) => {
                  let displayName = [d.donor_first_name, d.donor_last_name].filter(Boolean).join(" ")
                  let nameDerived = false
                  if (!displayName) {
                    const derived = deriveNameFromEmail(d.donor_email)
                    if (derived) {
                      displayName = derived
                      nameDerived = true
                    } else {
                      displayName = "Anonymous"
                    }
                  }
                  const freq = (d.donation_frequency ?? "").toLowerCase()
                  const freqBadge = freq === "recurring"
                    ? "bg-[#4F8A70]/15 text-[#4F8A70]"
                    : freq === "one-time"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-gray-50 text-gray-500"
                  return (
                    <tr key={d.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-800">
                        {displayName}
                        {nameDerived && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                            from email
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{d.donor_email ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{d.company ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{formatDateTime(d.donation_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${freqBadge}`}>
                          {d.donation_frequency ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-[#6772E5] whitespace-nowrap tabular-nums">
                        {formatCurrency(donation)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-[#4F8A70] whitespace-nowrap tabular-nums">
                        {match > 0 ? formatCurrency(match) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-orange-500 whitespace-nowrap tabular-nums">
                        {fees > 0 ? formatCurrency(fees) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#A2BD9D] whitespace-nowrap tabular-nums">
                        {formatCurrency(net)}
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

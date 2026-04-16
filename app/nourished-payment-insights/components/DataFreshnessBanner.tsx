"use client"

import { useEffect, useState } from "react"
import { Database } from "lucide-react"
import { timeAgo, formatShortDate } from "@/lib/data-freshness"

interface Meta {
  lastUploadedAt: string | null
  earliest: string | null
  latest: string | null
  count: number
  label: string
  subLabel?: string
}

interface Props {
  source: "bank" | "benevity"
  open: boolean
}

export function DataFreshnessBanner({ source, open }: Props) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setLoaded(false)
    const url =
      source === "benevity"
        ? "/api/benevity/overview?refresh=1"
        : `${process.env.NEXT_PUBLIC_API_BASE_URL}/transactions`

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!j) {
          setMeta(null)
          return
        }
        if (source === "benevity") {
          const m = j.uploadMeta
          if (!m || m.recordCount === 0) {
            setMeta(null)
            return
          }
          setMeta({
            lastUploadedAt: m.lastUploadedAt,
            earliest: m.earliestDate,
            latest: m.latestDate,
            count: m.recordCount,
            label: "Benevity Donations",
            subLabel: `${m.disbursementCount} disbursement${m.disbursementCount !== 1 ? "s" : ""}`,
          })
        } else {
          const txns = j.transactions ?? []
          if (txns.length === 0) {
            setMeta(null)
            return
          }
          let last: string | null = null
          let earliest: string | null = null
          let latest: string | null = null
          for (const tx of txns) {
            const c = tx.created_at
            if (c && (!last || c > last)) last = c
            const d = (tx.date ?? "").slice(0, 10)
            if (d) {
              if (!earliest || d < earliest) earliest = d
              if (!latest || d > latest) latest = d
            }
          }
          setMeta({
            lastUploadedAt: last,
            earliest,
            latest,
            count: txns.length,
            label: "Bank Transactions",
          })
        }
      })
      .catch(() => setMeta(null))
      .finally(() => {
        setLoading(false)
        setLoaded(true)
      })
  }, [open, source])

  if (loading) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-xs text-gray-500">
        Checking current data…
      </div>
    )
  }

  if (loaded && !meta) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">
        <p className="font-semibold">No data in the database yet</p>
        <p className="mt-0.5">This will be the first upload for this source.</p>
      </div>
    )
  }

  if (!meta) return null

  return (
    <div className="bg-gradient-to-r from-[#F5F9F3] to-white border border-[#A2BD9D]/40 rounded-lg p-3 mb-4">
      <div className="flex items-start gap-3">
        <Database size={18} className="text-[#4F8A70] mt-0.5 shrink-0" />
        <div className="text-xs text-gray-700 flex-1">
          <p className="font-semibold text-[#4F8A70] uppercase tracking-wide">
            Current {meta.label} in database
          </p>
          <p className="mt-1 text-sm text-gray-800">
            Last upload <strong>{timeAgo(meta.lastUploadedAt)}</strong> · {meta.count.toLocaleString()} record{meta.count !== 1 ? "s" : ""}
            {meta.subLabel ? ` across ${meta.subLabel}` : ""}
          </p>
          <p className="text-gray-500 mt-0.5">
            Data covers <strong>{formatShortDate(meta.earliest)}</strong> → <strong>{formatShortDate(meta.latest)}</strong>
          </p>
        </div>
      </div>
    </div>
  )
}

"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Heart,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL!

type Gift = {
  paymentId: number
  donationId: number | null
  amount: number
  giftDate: string
  source: string
  currentPurpose: string | null
  needsPurpose: boolean
  donorName: string
}

type Purpose = "Zakat" | "Sadaqah" | "Charity"

type Loaded = {
  email: string
  donorName: string
  totalCount: number
  totalAmount: number
  gifts: Gift[]
}

const formatCurrency = (n: number) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`

function normalizeStoredPurpose(p: string | null | undefined): Purpose {
  const v = (p ?? "").toLowerCase()
  if (v.includes("zakat") || v.includes("zakah") || v.includes("zakaat"))
    return "Zakat"
  if (v.includes("sadaq") || v.includes("sadq")) return "Sadaqah"
  return "Charity"
}

function MyGiftsInner() {
  const params = useSearchParams()
  const email = params.get("email") || ""
  const token = params.get("token") || ""

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selections, setSelections] = useState<Record<number, Purpose>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!email || !token) {
      setError("This link is missing required information.")
      return
    }
    ;(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/donor/gifts?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        )
        if (res.status === 403) {
          setError("This link is invalid or expired.")
          return
        }
        if (!res.ok) {
          setError("We couldn't load your gifts. Please try again later.")
          return
        }
        const data = (await res.json()) as Loaded
        setLoaded(data)
        // Pre-fill: for uncategorized gifts default to "Charity"; for already
        // tagged gifts, the read-only UI uses the stored value.
        const init: Record<number, Purpose> = {}
        for (const g of data.gifts) {
          if (g.needsPurpose) init[g.paymentId] = "Charity"
          else init[g.paymentId] = normalizeStoredPurpose(g.currentPurpose)
        }
        setSelections(init)
      } catch {
        setError("Network error. Please try again.")
      }
    })()
  }, [email, token])

  const uncategorized = useMemo(
    () => loaded?.gifts.filter((g) => g.needsPurpose) ?? [],
    [loaded],
  )
  const alreadyCategorized = useMemo(
    () => loaded?.gifts.filter((g) => !g.needsPurpose) ?? [],
    [loaded],
  )

  function applyToAllUncategorized(p: Purpose) {
    setSelections((s) => {
      const next = { ...s }
      for (const g of uncategorized) next[g.paymentId] = p
      return next
    })
  }

  async function submit() {
    if (!loaded) return
    setSubmitting(true)
    try {
      const payload = {
        email,
        token,
        selections: uncategorized.map((g) => ({
          paymentId: g.paymentId,
          purpose: selections[g.paymentId] ?? "Charity",
        })),
      }
      const res = await fetch(`${API_BASE}/donor/gifts/update-purpose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error || "Submission failed")
        return
      }
      setDone(true)
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (error) {
    return (
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
          <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
          <p className="text-sm text-gray-600">{error}</p>
          <p className="text-xs text-gray-500">
            Please reply to our email and we'll sort this out manually.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading your gifts…
      </div>
    )
  }

  if (done) {
    return (
      <Card className="max-w-lg w-full">
        <CardContent className="p-10 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#E2EEDB] flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-[#5F8571]" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 font-serif">
            Thank you, {loaded.donorName.split(" ")[0] || "Friend"}
          </h1>
          <p className="text-sm text-gray-600">
            We've saved your categorizations and emailed you a confirmation with
            the full summary. Your records are up to date.
          </p>
          <p className="text-xs text-gray-400 pt-3">
            You can close this page now.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-2xl w-full">
      <CardContent className="p-0">
        {/* Header */}
        <div
          className="p-8 text-center text-white"
          style={{
            background: "linear-gradient(135deg, #A3C19D 0%, #7FA088 100%)",
          }}
        >
          <div className="w-14 h-14 relative mx-auto mb-3">
            <Image
              src="/images/nourished-logo.png"
              alt="NourishED"
              fill
              style={{ objectFit: "contain" }}
            />
          </div>
          <h1 className="text-2xl font-bold font-serif">
            Thank you, {loaded.donorName.split(" ")[0] || "Friend"}
          </h1>
          <p className="text-sm opacity-90 mt-1">
            {formatCurrency(loaded.totalAmount)} across {loaded.totalCount} gift
            {loaded.totalCount === 1 ? "" : "s"}
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <p className="text-sm text-gray-700 leading-relaxed">
            Please confirm whether each contribution below was <strong>Zakat</strong>,{" "}
            <strong>Sadaqah</strong>, or <strong>general charity</strong>. We use this
            to keep your records accurate.
          </p>

          {uncategorized.length > 1 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-600 mb-2">
                Apply the same label to all {uncategorized.length} uncategorized
                gifts:
              </div>
              <div className="flex gap-2">
                {(["Zakat", "Sadaqah", "Charity"] as Purpose[]).map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => applyToAllUncategorized(p)}
                  >
                    Set all to {p}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {uncategorized.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                Needs categorization ({uncategorized.length})
              </h2>
              <div className="space-y-3">
                {uncategorized.map((g) => (
                  <GiftRow
                    key={g.paymentId}
                    gift={g}
                    selected={selections[g.paymentId] ?? "Charity"}
                    onChange={(p) =>
                      setSelections((s) => ({ ...s, [g.paymentId]: p }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {alreadyCategorized.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                Already categorized ({alreadyCategorized.length})
              </h2>
              <div className="space-y-2">
                {alreadyCategorized.map((g) => (
                  <div
                    key={g.paymentId}
                    className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium text-gray-700">
                        {formatCurrency(g.amount)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {g.giftDate} · {g.source}
                      </div>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded bg-white border border-gray-200 text-gray-700">
                      {normalizeStoredPurpose(g.currentPurpose)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            className="w-full bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-11 text-base"
            onClick={submit}
            disabled={submitting || uncategorized.length === 0}
          >
            {uncategorized.length === 0 ? (
              <>
                <Heart size={16} className="mr-2" />
                Everything's already categorized
              </>
            ) : submitting ? (
              "Saving…"
            ) : (
              `Save ${uncategorized.length} categorization${
                uncategorized.length === 1 ? "" : "s"
              }`
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function GiftRow({
  gift,
  selected,
  onChange,
}: {
  gift: Gift
  selected: Purpose
  onChange: (p: Purpose) => void
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900">
          {formatCurrency(gift.amount)}
        </div>
        <div className="text-xs text-gray-500">
          {gift.giftDate} · {gift.source}
        </div>
      </div>
      <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 self-start sm:self-auto">
        {(["Zakat", "Sadaqah", "Charity"] as Purpose[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition ${
              selected === p
                ? p === "Zakat"
                  ? "bg-[#FDEBC8] text-[#8B6521]"
                  : p === "Sadaqah"
                  ? "bg-[#E2EEDB] text-[#3D5A4B]"
                  : "bg-gray-100 text-gray-700"
                : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function MyGiftsPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EEF2EC] p-4">
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        }
      >
        <MyGiftsInner />
      </Suspense>
    </div>
  )
}

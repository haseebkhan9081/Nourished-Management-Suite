"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import { Loader2, CheckCircle2, AlertCircle, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  checkSubscription,
  recordResubscribe,
  recordUnsubscribe,
} from "../donor-outreach/_lib/api"

type View =
  | { state: "loading" }
  | { state: "invalid" }
  | { state: "subscribed"; email: string }
  | { state: "unsubscribed"; email: string }
  | { state: "just-unsubscribed"; email: string }
  | { state: "just-resubscribed"; email: string }
  | { state: "working" }
  | { state: "error"; message: string }

function UnsubscribeInner() {
  const params = useSearchParams()
  const email = params.get("email") || ""
  const token = params.get("token") || ""
  const [view, setView] = useState<View>({ state: "loading" })
  const [reason, setReason] = useState("")

  useEffect(() => {
    if (!email || !token) {
      setView({ state: "invalid" })
      return
    }
    ;(async () => {
      try {
        const s = await checkSubscription(email, token)
        setView({
          state: s.unsubscribed ? "unsubscribed" : "subscribed",
          email: s.email,
        })
      } catch (err: any) {
        // Only fail-hard on a genuinely invalid token. For backend hiccups or
        // transitional deploy states (endpoint missing, 5xx, network), default
        // to the subscribed view so the user can still act — the unsubscribe /
        // resubscribe endpoints validate the token themselves.
        if (err?.code === "invalid_token") {
          setView({ state: "invalid" })
        } else {
          setView({ state: "subscribed", email: email.toLowerCase() })
        }
      }
    })()
  }, [email, token])

  async function handleUnsubscribe() {
    setView({ state: "working" })
    try {
      await recordUnsubscribe(email, token, reason || undefined)
      setView({ state: "just-unsubscribed", email })
    } catch (err: any) {
      setView({ state: "error", message: err.message })
    }
  }

  async function handleResubscribe() {
    setView({ state: "working" })
    try {
      await recordResubscribe(email, token)
      setView({ state: "just-resubscribed", email })
    } catch (err: any) {
      setView({ state: "error", message: err.message })
    }
  }

  if (view.state === "invalid") {
    return (
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
          <h1 className="text-lg font-semibold">Invalid link</h1>
          <p className="text-sm text-gray-600">
            This link is missing required information. Please reply to any of
            our emails and we'll help you manually.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (view.state === "loading" || view.state === "working") {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        {view.state === "working" ? "Updating…" : "Checking…"}
      </div>
    )
  }

  if (view.state === "error") {
    return (
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-gray-600">{view.message}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-md w-full">
      <CardContent className="p-8 space-y-5">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 relative mb-3">
            <Image
              src="/images/nourished-logo.png"
              alt="NourishED"
              fill
              style={{ objectFit: "contain" }}
            />
          </div>

          {view.state === "subscribed" && (
            <>
              <h1 className="text-xl font-semibold text-gray-900">
                Unsubscribe?
              </h1>
              <p className="text-sm text-gray-600 mt-2">
                We'll stop emailing <strong>{view.email}</strong> about campaign
                updates. You'll still receive transactional emails like tax
                receipts.
              </p>
            </>
          )}

          {view.state === "unsubscribed" && (
            <>
              <h1 className="text-xl font-semibold text-gray-900">
                You're unsubscribed
              </h1>
              <p className="text-sm text-gray-600 mt-2">
                <strong>{view.email}</strong> is no longer receiving campaign
                emails. Changed your mind?
              </p>
            </>
          )}

          {view.state === "just-unsubscribed" && (
            <>
              <CheckCircle2 className="h-10 w-10 text-green-600 mb-2" />
              <h1 className="text-xl font-semibold text-gray-900">
                You're unsubscribed
              </h1>
              <p className="text-sm text-gray-600 mt-2">
                <strong>{view.email}</strong> — done. Thank you for supporting
                NourishED.
              </p>
            </>
          )}

          {view.state === "just-resubscribed" && (
            <>
              <Mail className="h-10 w-10 text-[#A2BD9D] mb-2" />
              <h1 className="text-xl font-semibold text-gray-900">
                Welcome back
              </h1>
              <p className="text-sm text-gray-600 mt-2">
                <strong>{view.email}</strong> is subscribed again. We'll include
                you in the next impact update.
              </p>
            </>
          )}
        </div>

        {view.state === "subscribed" && (
          <>
            <div>
              <label className="text-xs text-gray-600">
                Mind sharing why? (optional)
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="mt-1"
                placeholder="Too many emails, not interested, etc."
              />
            </div>
            <Button
              className="w-full bg-[#A2BD9D] hover:bg-[#8FA889] text-white"
              onClick={handleUnsubscribe}
            >
              Confirm Unsubscribe
            </Button>
          </>
        )}

        {(view.state === "unsubscribed" || view.state === "just-unsubscribed") && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleResubscribe}
          >
            Resubscribe
          </Button>
        )}

        {view.state === "just-resubscribed" && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleUnsubscribe}
          >
            Unsubscribe again
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        }
      >
        <UnsubscribeInner />
      </Suspense>
    </div>
  )
}

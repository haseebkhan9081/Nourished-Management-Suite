import { NextResponse } from "next/server"
import Stripe from "stripe"

type CachedPayouts = { fetchedAt: number; data: unknown }
let cache: CachedPayouts | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  const url = new URL(request.url)
  const bust = url.searchParams.get("refresh") === "1"

  if (!bust && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ ...(cache.data as object), cached: true })
  }

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 500 })
  }

  const stripe = new Stripe(secret, { apiVersion: "2024-06-20" })

  const payouts: Array<{
    id: string
    amount: number
    currency: string
    arrivalDate: string
    created: string
    status: string
    method: string
    statementDescriptor: string | null
    traceId: string | null
  }> = []

  try {
    for await (const p of stripe.payouts.list({ limit: 100 })) {
      const traceValue =
        (p as any).trace_id?.value ??
        (p as any).trace_id ??
        null
      payouts.push({
        id: p.id,
        amount: p.amount / 100,
        currency: p.currency,
        arrivalDate: new Date(p.arrival_date * 1000).toISOString(),
        created: new Date(p.created * 1000).toISOString(),
        status: p.status,
        method: p.method,
        statementDescriptor: p.statement_descriptor ?? null,
        traceId: typeof traceValue === "string" ? traceValue : null,
      })
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: "Stripe fetch failed", message: err?.message ?? String(err) },
      { status: 502 }
    )
  }

  const data = {
    asOf: new Date().toISOString(),
    count: payouts.length,
    totalAmount: payouts.reduce((s, p) => s + (p.status === "paid" ? p.amount : 0), 0),
    payouts,
    cached: false,
  }

  cache = { fetchedAt: Date.now(), data }
  return NextResponse.json(data)
}

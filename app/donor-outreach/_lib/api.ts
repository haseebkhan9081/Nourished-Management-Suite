const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL!

export interface CampaignSummary {
  id: number
  name: string
  subject: string
  status: "draft" | "sending" | "sent" | "failed"
  recipient_count: number
  sent_count: number
  failed_count: number
  created_by: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface CampaignDetail extends CampaignSummary {
  html: string
  blocks: any | null
  updated_at: string
}

export interface CampaignImage {
  id: number
  mime: string
  byte_length: number
  created_at: string
  url: string
}

export interface DonorRow {
  email: string
  name: string
  total: number
  giftCount: number
  sources: string[]
  lastGiftAt: string | null
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  const res = await fetch(`${API_BASE}/outreach/campaigns`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to load campaigns")
  const data = await res.json()
  return data.campaigns
}

export async function createCampaign(
  name: string,
  createdBy?: string,
): Promise<CampaignSummary> {
  const res = await fetch(`${API_BASE}/outreach/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, createdBy }),
  })
  if (!res.ok) throw new Error((await res.json()).error || "Create failed")
  const data = await res.json()
  return data.campaign
}

export async function getCampaign(
  id: number,
): Promise<{ campaign: CampaignDetail; images: CampaignImage[] }> {
  const res = await fetch(`${API_BASE}/outreach/campaigns/${id}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error("Not found")
  return res.json()
}

export async function updateCampaign(
  id: number,
  patch: Partial<Pick<CampaignDetail, "name" | "subject" | "html" | "blocks">>,
): Promise<CampaignDetail> {
  const res = await fetch(`${API_BASE}/outreach/campaigns/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error((await res.json()).error || "Save failed")
  const data = await res.json()
  return data.campaign
}

export async function deleteCampaign(id: number) {
  const res = await fetch(`${API_BASE}/outreach/campaigns/${id}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error((await res.json()).error || "Delete failed")
}

export async function uploadImage(
  campaignId: number,
  file: File,
): Promise<{ id: number; url: string; mime: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  const res = await fetch(
    `${API_BASE}/outreach/campaigns/${campaignId}/images`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl }),
    },
  )
  if (!res.ok) throw new Error((await res.json()).error || "Upload failed")
  return res.json()
}

export async function listDonors(): Promise<{
  donors: DonorRow[]
  unsubscribedCount: number
}> {
  const res = await fetch(`${API_BASE}/outreach/donors`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to load donors")
  return res.json()
}

export async function setRecipients(
  campaignId: number,
  recipients: Array<{ email: string; name?: string }>,
) {
  const res = await fetch(
    `${API_BASE}/outreach/campaigns/${campaignId}/recipients`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients }),
    },
  )
  if (!res.ok) throw new Error((await res.json()).error || "Failed")
  return res.json()
}

export interface RecipientRow {
  email: string
  name: string | null
  status: "pending" | "sent" | "failed" | "skipped"
  error: string | null
  sent_at: string | null
}

export async function getRecipients(
  campaignId: number,
): Promise<{ recipients: RecipientRow[] }> {
  const res = await fetch(
    `${API_BASE}/outreach/campaigns/${campaignId}/recipients`,
    { cache: "no-store" },
  )
  if (!res.ok) throw new Error("Failed to load recipients")
  return res.json()
}

export async function testSend(campaignId: number, toEmail: string) {
  const res = await fetch(
    `${API_BASE}/outreach/campaigns/${campaignId}/test-send`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toEmail }),
    },
  )
  if (!res.ok) throw new Error((await res.json()).error || "Test send failed")
  return res.json()
}

export async function startSend(campaignId: number, senderEmail?: string) {
  const res = await fetch(`${API_BASE}/outreach/campaigns/${campaignId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "SEND", senderEmail }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (body.issues) throw new Error(body.issues.join(" • "))
    throw new Error(body.error || "Send failed")
  }
  return res.json()
}

export async function duplicateCampaign(
  campaignId: number,
  createdBy?: string,
): Promise<CampaignSummary> {
  const res = await fetch(
    `${API_BASE}/outreach/campaigns/${campaignId}/duplicate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ createdBy }),
    },
  )
  if (!res.ok) throw new Error((await res.json()).error || "Duplicate failed")
  const data = await res.json()
  return data.campaign
}

export async function retryFailed(campaignId: number) {
  const res = await fetch(
    `${API_BASE}/outreach/campaigns/${campaignId}/retry-failed`,
    { method: "POST" },
  )
  if (!res.ok) throw new Error((await res.json()).error || "Retry failed")
  return res.json()
}

export async function preflightCheck(
  campaignId: number,
): Promise<{ ok: boolean; issues: string[] }> {
  const res = await fetch(
    `${API_BASE}/outreach/campaigns/${campaignId}/preflight`,
    { cache: "no-store" },
  )
  if (!res.ok) throw new Error("Preflight failed")
  return res.json()
}

export async function recordUnsubscribe(
  email: string,
  token: string,
  reason?: string,
) {
  const res = await fetch(`${API_BASE}/outreach/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, token, reason }),
  })
  if (!res.ok) throw new Error((await res.json()).error || "Unsubscribe failed")
  return res.json()
}

export async function recordResubscribe(email: string, token: string) {
  const res = await fetch(`${API_BASE}/outreach/resubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, token }),
  })
  if (!res.ok) throw new Error((await res.json()).error || "Resubscribe failed")
  return res.json()
}

export async function checkSubscription(email: string, token: string) {
  const res = await fetch(
    `${API_BASE}/outreach/subscription?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  )
  if (res.status === 403) {
    const err: any = new Error("Invalid or expired unsubscribe link")
    err.code = "invalid_token"
    throw err
  }
  if (!res.ok) {
    const err: any = new Error("Subscription check unavailable")
    err.code = "unavailable"
    throw err
  }
  return res.json() as Promise<{
    email: string
    unsubscribed: boolean
    unsubscribedAt: string | null
  }>
}

export async function getProgress(campaignId: number) {
  const res = await fetch(
    `${API_BASE}/outreach/campaigns/${campaignId}/progress`,
    { cache: "no-store" },
  )
  if (!res.ok) throw new Error("Progress failed")
  return res.json()
}

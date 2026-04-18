"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  Loader2,
  Send,
  Users,
  Eye,
  Smartphone,
  Monitor,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  Copy,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Block,
  BlockType,
  CtaBlock,
  Doc,
  HeadingBlock,
  HighlightBlock,
  ImageBlock,
  MetricsBlock,
  ParagraphBlock,
  StoryBlock,
  defaultBlock,
  defaultDoc,
  findDocIssues,
  newId,
  renderEmailHtml,
} from "../_lib/blocks"
import {
  CampaignDetail,
  DonorRow,
  duplicateCampaign,
  getCampaign,
  getProgress,
  getRecipients,
  listDonors,
  preflightCheck,
  retryFailed,
  setRecipients,
  startSend,
  testSend,
  updateCampaign,
  uploadImage,
} from "../_lib/api"
import { useSession } from "next-auth/react"

type Status = "idle" | "saving" | "saved" | "error"

export default function ComposeCampaignPage() {
  const params = useParams<{ id: string }>()
  const campaignId = Number(params.id)
  const router = useRouter()
  const { data: session } = useSession()

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [doc, setDoc] = useState<Doc>(defaultDoc())
  const [subject, setSubject] = useState("")
  const [name, setName] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)

  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop")
  const [recipientsOpen, setRecipientsOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [testEmail, setTestEmail] = useState("")
  const [testStatus, setTestStatus] = useState<string | null>(null)
  const [progress, setProgress] = useState<{
    sent: number
    failed: number
    total: number
    status: string
  } | null>(null)
  const [preflightIssues, setPreflightIssues] = useState<string[]>([])

  const html = useMemo(() => renderEmailHtml(doc), [doc])
  const readOnly = campaign?.status && campaign.status !== "draft"

  // ─── load campaign ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const { campaign } = await getCampaign(campaignId)
        if (cancel) return
        setCampaign(campaign)
        setName(campaign.name)
        setSubject(campaign.subject || "")
        if (campaign.blocks) {
          try {
            setDoc(campaign.blocks as Doc)
          } catch {
            setDoc(defaultDoc())
          }
        }
      } catch (err: any) {
        setError(err.message)
      }
    })()
    return () => {
      cancel = true
    }
  }, [campaignId])

  // ─── debounced autosave ───────────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const save = useCallback(
    async (nextDoc: Doc, nextName: string, nextSubject: string) => {
      try {
        setStatus("saving")
        await updateCampaign(campaignId, {
          name: nextName,
          subject: nextSubject,
          blocks: nextDoc as any,
          html: renderEmailHtml(nextDoc),
        })
        setStatus("saved")
        setTimeout(() => setStatus("idle"), 1200)
      } catch (err: any) {
        setStatus("error")
        setError(err.message)
      }
    },
    [campaignId],
  )

  useEffect(() => {
    if (!campaign || readOnly) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      save(doc, name, subject)
    }, 1200)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, name, subject, campaign?.id, readOnly])

  // ─── preflight check ──────────────────────────────────────────────────────
  // Block-aware issues come straight from the doc (instant). Subject and
  // recipient-count checks round it out.
  useEffect(() => {
    if (!campaign) return
    const issues = findDocIssues(doc)
    if (!subject?.trim()) issues.unshift("Subject is empty")
    else if (/replace|todo|\[.*\]/i.test(subject))
      issues.unshift(`Subject looks like placeholder: "${subject}"`)
    if (!campaign.recipient_count) issues.push("No recipients selected")
    setPreflightIssues(issues)
  }, [doc, subject, campaign])

  // ─── poll progress while sending ──────────────────────────────────────────
  useEffect(() => {
    if (!campaign) return
    if (campaign.status !== "sending") return
    const iv = setInterval(async () => {
      try {
        const p = await getProgress(campaignId)
        setProgress({
          sent: p.sent_count,
          failed: p.failed_count,
          total: p.recipient_count,
          status: p.status,
        })
        if (p.status === "sent" || p.status === "failed") {
          clearInterval(iv)
          setCampaign((c) => (c ? { ...c, status: p.status } : c))
        }
      } catch {
        // ignore transient errors
      }
    }, 2500)
    return () => clearInterval(iv)
  }, [campaign?.status, campaignId])

  // ─── block ops ────────────────────────────────────────────────────────────
  const addBlock = (type: BlockType, after?: string) => {
    setDoc((d) => {
      const blocks = [...d.blocks]
      const idx = after ? blocks.findIndex((b) => b.id === after) : blocks.length - 1
      blocks.splice(idx + 1, 0, defaultBlock(type))
      return { ...d, blocks }
    })
  }
  const removeBlock = (id: string) =>
    setDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }))
  const moveBlock = (id: string, dir: -1 | 1) => {
    setDoc((d) => {
      const idx = d.blocks.findIndex((b) => b.id === id)
      if (idx === -1) return d
      const nextIdx = idx + dir
      if (nextIdx < 0 || nextIdx >= d.blocks.length) return d
      const blocks = [...d.blocks]
      const [b] = blocks.splice(idx, 1)
      blocks.splice(nextIdx, 0, b)
      return { ...d, blocks }
    })
  }
  const patchBlock = <B extends Block>(id: string, patch: Partial<B>) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as B) : b)),
    }))
  }

  // ─── image upload ────────────────────────────────────────────────────────
  const handleImageUpload = async (blockId: string, file: File) => {
    try {
      const { url } = await uploadImage(campaignId, file)
      patchBlock<ImageBlock>(blockId, { url })
    } catch (err: any) {
      setError(err.message)
    }
  }

  // ─── test send ─────────────────────────────────────────────────────────────
  const handleTestSend = async () => {
    if (!testEmail) return
    try {
      setTestStatus("sending")
      await testSend(campaignId, testEmail)
      setTestStatus("sent")
      setTimeout(() => setTestStatus(null), 3000)
    } catch (err: any) {
      setTestStatus(`error: ${err.message}`)
    }
  }

  if (!campaign && !error) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
      </div>
    )
  }

  if (error && !campaign) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-red-600">
          {error}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/donor-outreach"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#A2BD9D]"
      >
        <ArrowLeft size={14} />
        Back to campaigns
      </Link>

      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly ?? false}
            className="text-lg font-semibold border-0 shadow-none focus-visible:ring-1 focus-visible:ring-[#A2BD9D] px-2 h-auto py-1 bg-transparent"
            placeholder="Campaign name"
          />
          <div className="text-xs text-gray-500 px-2 flex items-center gap-2">
            {status === "saving" && <span>Saving…</span>}
            {status === "saved" && (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle2 size={12} /> Saved
              </span>
            )}
            {status === "error" && (
              <span className="text-red-600 flex items-center gap-1">
                <AlertCircle size={12} /> {error}
              </span>
            )}
            {readOnly && (
              <span className="text-amber-700">
                Read-only — campaign is {campaign?.status}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const copy = await duplicateCampaign(
                  campaignId,
                  session?.user?.email ?? undefined,
                )
                router.push(`/donor-outreach/${copy.id}`)
              } catch (err: any) {
                setError(err.message)
              }
            }}
          >
            <Copy size={14} className="mr-1" />
            Duplicate
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRecipientsOpen(true)}
          >
            <Users size={14} className="mr-1" />
            Recipients ({campaign?.recipient_count ?? 0})
          </Button>
          <TestSendControl
            testEmail={testEmail}
            setTestEmail={setTestEmail}
            status={testStatus}
            onSend={handleTestSend}
            disabled={!subject || !html}
          />
          <Button
            size="sm"
            className="bg-[#D35400] hover:bg-[#B8470E] text-white"
            onClick={() => setSendOpen(true)}
            disabled={
              readOnly ||
              campaign?.status !== "draft" ||
              preflightIssues.length > 0
            }
            title={
              preflightIssues.length > 0
                ? `Fix ${preflightIssues.length} issue(s) before sending`
                : undefined
            }
          >
            <Send size={14} className="mr-1" />
            Send Campaign
          </Button>
        </div>
      </div>

      {/* Preflight issues */}
      {campaign?.status === "draft" && preflightIssues.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium mb-1 flex items-center gap-1">
            <AlertCircle size={14} />
            Before you send, fix these:
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            {preflightIssues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Personalization hint */}
      {campaign?.status === "draft" && preflightIssues.length === 0 && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          💡 Use <code className="bg-white px-1 rounded border">{"{{firstName}}"}</code>,{" "}
          <code className="bg-white px-1 rounded border">{"{{name}}"}</code>, or{" "}
          <code className="bg-white px-1 rounded border">{"{{email}}"}</code> anywhere in the
          subject or body to personalize per recipient.
        </div>
      )}

      {campaign?.status === "sending" && progress && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Sending in progress — {progress.sent}/{progress.total} sent
          {progress.failed > 0 && `, ${progress.failed} failed`}. Progress updates
          every few seconds; you can leave this page and come back.
        </div>
      )}

      {campaign?.status === "sent" && (
        <CampaignResults
          campaignId={campaignId}
          sentCount={campaign.sent_count}
          failedCount={campaign.failed_count}
          recipientCount={campaign.recipient_count}
          onRetry={async () => {
            await retryFailed(campaignId)
            setCampaign((c) => (c ? { ...c, status: "sending" } : c))
          }}
        />
      )}

      {/* Editor + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editor */}
        <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
          <CardContent className="p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                Email subject
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={readOnly ?? false}
                placeholder="Ramadan Mubarak from NourishED 🌙"
                className="mt-1"
              />
            </div>

            <div className="space-y-3 pt-2 border-t">
              <h3 className="text-sm font-semibold text-gray-900">Header</h3>
              <div>
                <label className="text-xs text-gray-600">Title</label>
                <Textarea
                  value={doc.header.title}
                  onChange={(e) =>
                    setDoc({ ...doc, header: { ...doc.header, title: e.target.value } })
                  }
                  disabled={readOnly ?? false}
                  rows={2}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Subtitle</label>
                <Input
                  value={doc.header.subtitle}
                  onChange={(e) =>
                    setDoc({ ...doc, header: { ...doc.header, subtitle: e.target.value } })
                  }
                  disabled={readOnly ?? false}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Greeting</label>
                <Input
                  value={doc.header.greeting}
                  onChange={(e) =>
                    setDoc({ ...doc, header: { ...doc.header, greeting: e.target.value } })
                  }
                  disabled={readOnly ?? false}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <h3 className="text-sm font-semibold text-gray-900">Blocks</h3>
              {doc.blocks.map((block, i) => (
                <BlockEditor
                  key={block.id}
                  block={block}
                  onChange={(patch) => patchBlock(block.id, patch)}
                  onRemove={() => removeBlock(block.id)}
                  onMoveUp={i > 0 ? () => moveBlock(block.id, -1) : undefined}
                  onMoveDown={
                    i < doc.blocks.length - 1
                      ? () => moveBlock(block.id, 1)
                      : undefined
                  }
                  onUploadImage={(file) => handleImageUpload(block.id, file)}
                  disabled={readOnly ?? false}
                />
              ))}

              {!readOnly && (
                <AddBlockMenu onAdd={(type) => addBlock(type)} />
              )}
            </div>

            <div className="space-y-3 pt-2 border-t">
              <h3 className="text-sm font-semibold text-gray-900">Footer</h3>
              <div>
                <label className="text-xs text-gray-600">Closing text</label>
                <Textarea
                  value={doc.footer.closingText}
                  onChange={(e) =>
                    setDoc({
                      ...doc,
                      footer: { ...doc.footer, closingText: e.target.value },
                    })
                  }
                  disabled={readOnly ?? false}
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Signature name</label>
                <Input
                  value={doc.footer.signatureName}
                  onChange={(e) =>
                    setDoc({
                      ...doc,
                      footer: { ...doc.footer, signatureName: e.target.value },
                    })
                  }
                  disabled={readOnly ?? false}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Signature role</label>
                <Input
                  value={doc.footer.signatureRole}
                  onChange={(e) =>
                    setDoc({
                      ...doc,
                      footer: { ...doc.footer, signatureRole: e.target.value },
                    })
                  }
                  disabled={readOnly ?? false}
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-10rem)]">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Eye size={14} /> Live Preview
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={previewMode === "desktop" ? "default" : "outline"}
                  onClick={() => setPreviewMode("desktop")}
                  className={
                    previewMode === "desktop"
                      ? "bg-[#A2BD9D] hover:bg-[#8FA889]"
                      : ""
                  }
                >
                  <Monitor size={14} />
                </Button>
                <Button
                  size="sm"
                  variant={previewMode === "mobile" ? "default" : "outline"}
                  onClick={() => setPreviewMode("mobile")}
                  className={
                    previewMode === "mobile"
                      ? "bg-[#A2BD9D] hover:bg-[#8FA889]"
                      : ""
                  }
                >
                  <Smartphone size={14} />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100 rounded-md p-2">
              <iframe
                title="Email preview"
                srcDoc={html}
                className="bg-white border border-gray-200 rounded shadow-sm mx-auto block"
                style={{
                  width: previewMode === "mobile" ? "375px" : "100%",
                  height: previewMode === "mobile" ? "600px" : "calc(100vh - 15rem)",
                  transition: "width 120ms ease",
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <RecipientsDialog
        open={recipientsOpen}
        onOpenChange={setRecipientsOpen}
        campaignId={campaignId}
        currentCount={campaign?.recipient_count ?? 0}
        onSaved={(count) =>
          setCampaign((c) => (c ? { ...c, recipient_count: count } : c))
        }
        readOnly={!!readOnly}
      />

      <SendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        campaignId={campaignId}
        recipientCount={campaign?.recipient_count ?? 0}
        senderEmail={session?.user?.email ?? undefined}
        onSent={() => {
          setCampaign((c) => (c ? { ...c, status: "sending" } : c))
          setSendOpen(false)
        }}
      />
    </div>
  )
}

// ─── block editor ──────────────────────────────────────────────────────────

function BlockEditor(props: {
  block: Block
  onChange: (patch: any) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onUploadImage: (file: File) => void
  disabled?: boolean
}) {
  const { block, onChange, onRemove, onMoveUp, onMoveDown, onUploadImage, disabled } =
    props

  const LABELS: Record<BlockType, string> = {
    heading: "Heading",
    paragraph: "Paragraph",
    image: "Image",
    metrics: "Metrics",
    story: "Story / Quote",
    highlight: "Highlight Box",
    cta: "Call to Action",
    divider: "Divider",
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase">
          {LABELS[block.type]}
        </span>
        {!disabled && (
          <div className="flex gap-1">
            {onMoveUp && (
              <button
                onClick={onMoveUp}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Move up"
              >
                <ArrowUp size={14} />
              </button>
            )}
            {onMoveDown && (
              <button
                onClick={onMoveDown}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Move down"
              >
                <ArrowDown size={14} />
              </button>
            )}
            <button
              onClick={onRemove}
              className="text-gray-400 hover:text-red-600"
              aria-label="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {block.type === "heading" && (
        <Input
          value={(block as HeadingBlock).text}
          onChange={(e) => onChange({ text: e.target.value })}
          disabled={disabled}
        />
      )}

      {block.type === "paragraph" && (
        <>
          <Textarea
            value={(block as ParagraphBlock).text}
            onChange={(e) => onChange({ text: e.target.value })}
            disabled={disabled}
            rows={4}
          />
          <div className="flex gap-2 text-xs">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name={`tone-${block.id}`}
                checked={(block as ParagraphBlock).tone !== "callout"}
                onChange={() => onChange({ tone: "default" })}
                disabled={disabled}
              />
              Normal
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name={`tone-${block.id}`}
                checked={(block as ParagraphBlock).tone === "callout"}
                onChange={() => onChange({ tone: "callout" })}
                disabled={disabled}
              />
              Callout box (yellow)
            </label>
          </div>
        </>
      )}

      {block.type === "image" && (
        <ImageBlockEditor
          block={block as ImageBlock}
          onChange={onChange}
          onUpload={onUploadImage}
          disabled={disabled}
        />
      )}

      {block.type === "metrics" && (
        <MetricsBlockEditor
          block={block as MetricsBlock}
          onChange={onChange}
          disabled={disabled}
        />
      )}

      {block.type === "story" && (
        <>
          <Textarea
            value={(block as StoryBlock).quote}
            onChange={(e) => onChange({ quote: e.target.value })}
            disabled={disabled}
            rows={3}
            placeholder="The quote"
          />
          <Input
            value={(block as StoryBlock).attribution}
            onChange={(e) => onChange({ attribution: e.target.value })}
            disabled={disabled}
            placeholder="— Attribution"
          />
        </>
      )}

      {block.type === "highlight" && (
        <HighlightBlockEditor
          block={block as HighlightBlock}
          onChange={onChange}
          disabled={disabled}
        />
      )}

      {block.type === "cta" && (
        <>
          <Input
            value={(block as CtaBlock).title}
            onChange={(e) => onChange({ title: e.target.value })}
            disabled={disabled}
            placeholder="CTA heading"
          />
          <Textarea
            value={(block as CtaBlock).text}
            onChange={(e) => onChange({ text: e.target.value })}
            disabled={disabled}
            rows={3}
            placeholder="Supporting text"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={(block as CtaBlock).buttonText}
              onChange={(e) => onChange({ buttonText: e.target.value })}
              disabled={disabled}
              placeholder="Button text"
            />
            <Input
              value={(block as CtaBlock).buttonUrl}
              onChange={(e) => onChange({ buttonUrl: e.target.value })}
              disabled={disabled}
              placeholder="https://..."
            />
          </div>
        </>
      )}

      {block.type === "divider" && (
        <p className="text-xs text-gray-500 italic">Horizontal rule</p>
      )}
    </div>
  )
}

function ImageBlockEditor({
  block,
  onChange,
  onUpload,
  disabled,
}: {
  block: ImageBlock
  onChange: (patch: Partial<ImageBlock>) => void
  onUpload: (file: File) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  return (
    <div className="space-y-2">
      {block.url ? (
        <img
          src={block.url}
          alt={block.alt}
          className="w-full max-h-48 object-contain rounded border border-gray-200 bg-white"
        />
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center text-xs text-gray-500">
          No image selected
        </div>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={14} className="mr-1" />
          {uploading ? "Uploading…" : block.url ? "Replace" : "Upload"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            setUploading(true)
            try {
              await onUpload(f)
            } finally {
              setUploading(false)
              if (inputRef.current) inputRef.current.value = ""
            }
          }}
        />
        {block.url && !disabled && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange({ url: "" })}
          >
            <X size={14} />
          </Button>
        )}
      </div>
      <Input
        value={block.alt}
        onChange={(e) => onChange({ alt: e.target.value })}
        disabled={disabled}
        placeholder="Alt text (for accessibility)"
      />
      <Input
        value={block.caption ?? ""}
        onChange={(e) => onChange({ caption: e.target.value })}
        disabled={disabled}
        placeholder="Caption (optional)"
      />
    </div>
  )
}

function MetricsBlockEditor({
  block,
  onChange,
  disabled,
}: {
  block: MetricsBlock
  onChange: (patch: Partial<MetricsBlock>) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Input
        value={block.title}
        onChange={(e) => onChange({ title: e.target.value })}
        disabled={disabled}
        placeholder="Section title"
      />
      {block.items.map((it, i) => (
        <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
          <Input
            value={it.number}
            onChange={(e) => {
              const items = [...block.items]
              items[i] = { ...it, number: e.target.value }
              onChange({ items })
            }}
            disabled={disabled}
            placeholder="Number"
          />
          <Input
            value={it.label}
            onChange={(e) => {
              const items = [...block.items]
              items[i] = { ...it, label: e.target.value }
              onChange({ items })
            }}
            disabled={disabled}
            placeholder="Label"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              const items = block.items.filter((_, idx) => idx !== i)
              onChange({ items })
            }}
            disabled={disabled || block.items.length <= 1}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
      {!disabled && block.items.length < 4 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({ items: [...block.items, { number: "", label: "" }] })
          }
        >
          <Plus size={14} className="mr-1" />
          Add metric
        </Button>
      )}
    </div>
  )
}

function HighlightBlockEditor({
  block,
  onChange,
  disabled,
}: {
  block: HighlightBlock
  onChange: (patch: Partial<HighlightBlock>) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Input
        value={block.title}
        onChange={(e) => onChange({ title: e.target.value })}
        disabled={disabled}
        placeholder="Highlight title"
      />
      {block.items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={it}
            onChange={(e) => {
              const items = [...block.items]
              items[i] = e.target.value
              onChange({ items })
            }}
            disabled={disabled}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              const items = block.items.filter((_, idx) => idx !== i)
              onChange({ items })
            }}
            disabled={disabled || block.items.length <= 1}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
      {!disabled && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ items: [...block.items, ""] })}
        >
          <Plus size={14} className="mr-1" />
          Add item
        </Button>
      )}
    </div>
  )
}

function AddBlockMenu({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const ITEMS: Array<[BlockType, string]> = [
    ["heading", "Heading"],
    ["paragraph", "Paragraph"],
    ["image", "Image"],
    ["metrics", "Metrics (3 numbers)"],
    ["story", "Story / Quote"],
    ["highlight", "Highlight Box"],
    ["cta", "Call to Action"],
    ["divider", "Divider"],
  ]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full border-dashed">
          <Plus size={14} className="mr-1" />
          Add block
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {ITEMS.map(([t, label]) => (
          <DropdownMenuItem key={t} onClick={() => onAdd(t)}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── test send inline control ──────────────────────────────────────────────

function TestSendControl({
  testEmail,
  setTestEmail,
  status,
  onSend,
  disabled,
}: {
  testEmail: string
  setTestEmail: (v: string) => void
  status: string | null
  onSend: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Send size={14} className="mr-1" />
          Test
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="p-3 w-72">
        <div className="space-y-2">
          <label className="text-xs text-gray-600">Send test email to:</label>
          <Input
            placeholder="you@nourishedusa.org"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <Button
            size="sm"
            className="w-full bg-[#A2BD9D] hover:bg-[#8FA889]"
            onClick={onSend}
            disabled={!testEmail || status === "sending"}
          >
            {status === "sending" ? "Sending…" : "Send Test"}
          </Button>
          {status === "sent" && (
            <p className="text-xs text-green-700">Sent — check your inbox.</p>
          )}
          {status?.startsWith("error") && (
            <p className="text-xs text-red-600">{status}</p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── recipients picker ─────────────────────────────────────────────────────

function RecipientsDialog({
  open,
  onOpenChange,
  campaignId,
  currentCount,
  onSaved,
  readOnly,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  campaignId: number
  currentCount: number
  onSaved: (count: number) => void
  readOnly: boolean
}) {
  const [donors, setDonors] = useState<DonorRow[] | null>(null)
  const [search, setSearch] = useState("")
  const [minTotal, setMinTotal] = useState(0)
  const [sources, setSources] = useState({
    stripe: true,
    benevity: true,
    bank: true,
    manual: true,
    wire: true,
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        // Load the currently-saved recipients AND the donor catalog. The
        // dialog pre-selects exactly the saved set — if nothing is saved yet,
        // it opens with nothing selected so the user makes an explicit choice.
        const [donorRes, saved] = await Promise.all([
          listDonors(),
          getRecipients(campaignId).catch(() => ({ recipients: [] })),
        ])
        setDonors(donorRes.donors)
        setSelected(new Set(saved.recipients.map((r) => r.email)))
      } catch (err) {
        console.error(err)
      }
    })()
  }, [open, campaignId])

  const filtered = useMemo(() => {
    if (!donors) return []
    const q = search.trim().toLowerCase()
    return donors.filter((d) => {
      if (d.total < minTotal) return false
      if (!d.sources.some((s) => sources[s as keyof typeof sources])) return false
      if (!q) return true
      return (
        d.name.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q)
      )
    })
  }, [donors, search, minTotal, sources])

  const visibleSelected = filtered.filter((d) => selected.has(d.email)).length

  async function handleSave() {
    setSaving(true)
    try {
      const recips = filtered
        .filter((d) => selected.has(d.email))
        .map((d) => ({ email: d.email, name: d.name }))
      const res = await setRecipients(campaignId, recips)
      onSaved(res.recipientCount)
      onOpenChange(false)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Recipients</DialogTitle>
          <DialogDescription>
            Currently {currentCount} recipient{currentCount === 1 ? "" : "s"} saved.
            Filter and select below, then save.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-3 items-end py-2 border-b">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-gray-600">Search</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or email"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Min total ($)</label>
            <Input
              type="number"
              value={minTotal || ""}
              onChange={(e) => setMinTotal(Number(e.target.value) || 0)}
              className="w-28"
            />
          </div>
          <div className="flex items-center gap-3 text-sm flex-wrap">
            {(["stripe", "benevity", "bank", "manual", "wire"] as const).map(
              (k) => (
                <label key={k} className="flex items-center gap-1 cursor-pointer capitalize">
                  <Checkbox
                    checked={sources[k]}
                    onCheckedChange={(v) =>
                      setSources((s) => ({ ...s, [k]: !!v }))
                    }
                  />
                  {k}
                </label>
              ),
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm py-2">
          <div className="text-gray-600">
            {visibleSelected} of {filtered.length} selected
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = new Set(selected)
                filtered.forEach((d) => next.add(d.email))
                setSelected(next)
              }}
            >
              Select all visible
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = new Set(selected)
                filtered.forEach((d) => next.delete(d.email))
                setSelected(next)
              }}
            >
              Deselect all visible
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border rounded">
          {!donors ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#A2BD9D]" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-2 text-left w-8"></th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Email</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-right">Gifts</th>
                  <th className="p-2 text-left">Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const isChecked = selected.has(d.email)
                  return (
                    <tr
                      key={d.email}
                      className="border-t hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        const next = new Set(selected)
                        if (isChecked) next.delete(d.email)
                        else next.add(d.email)
                        setSelected(next)
                      }}
                    >
                      <td className="p-2">
                        <Checkbox checked={isChecked} />
                      </td>
                      <td className="p-2">{d.name || "—"}</td>
                      <td className="p-2 text-gray-600">{d.email}</td>
                      <td className="p-2 text-right tabular-nums">
                        ${Math.round(d.total).toLocaleString()}
                      </td>
                      <td className="p-2 text-right tabular-nums">{d.giftCount}</td>
                      <td className="p-2 text-xs text-gray-500">
                        {d.sources.join(", ")}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || readOnly}
            className="bg-[#A2BD9D] hover:bg-[#8FA889]"
          >
            {saving ? "Saving…" : `Save ${visibleSelected} recipients`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── send confirmation ─────────────────────────────────────────────────────

function SendDialog({
  open,
  onOpenChange,
  campaignId,
  recipientCount,
  senderEmail,
  onSent,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  campaignId: number
  recipientCount: number
  senderEmail?: string
  onSent: () => void
}) {
  const [confirm, setConfirm] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function doSend() {
    setSending(true)
    setError(null)
    try {
      await startSend(campaignId, senderEmail)
      onSent()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send campaign?</DialogTitle>
          <DialogDescription>
            This will send the email to <strong>{recipientCount}</strong> donor
            {recipientCount === 1 ? "" : "s"} via info@nourishedusa.org. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          <label className="text-sm text-gray-700">
            Type <code className="bg-gray-100 px-1 rounded">SEND</code> to confirm:
          </label>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="SEND"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={doSend}
            disabled={confirm !== "SEND" || sending}
            className="bg-[#D35400] hover:bg-[#B8470E] text-white"
          >
            {sending ? "Starting…" : "Send to all recipients"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── campaign results (shown after send) ───────────────────────────────────

function CampaignResults({
  campaignId,
  sentCount,
  failedCount,
  recipientCount,
  onRetry,
}: {
  campaignId: number
  sentCount: number
  failedCount: number
  recipientCount: number
  onRetry: () => Promise<void>
}) {
  const [recipients, setRecipients] = useState<Array<{
    email: string
    name: string | null
    status: string
    error: string | null
    sent_at: string | null
  }> | null>(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    getRecipients(campaignId).then((r) => setRecipients(r.recipients))
  }, [campaignId])

  const failed = recipients?.filter((r) => r.status === "failed") ?? []
  const skipped = recipients?.filter((r) => r.status === "skipped") ?? []

  const failuresByError = new Map<string, typeof failed>()
  for (const f of failed) {
    const key = f.error || "Unknown error"
    const arr = failuresByError.get(key) ?? []
    arr.push(f)
    failuresByError.set(key, arr)
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Send Results</h3>
            <p className="text-xs text-gray-500">
              Delivered to {sentCount} / {recipientCount} recipients
              {failedCount > 0 && `, ${failedCount} failed`}
              {skipped.length > 0 && `, ${skipped.length} skipped (unsubscribed)`}
            </p>
          </div>
          {failedCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                setRetrying(true)
                try {
                  await onRetry()
                } finally {
                  setRetrying(false)
                }
              }}
              disabled={retrying}
            >
              <RefreshCw
                size={14}
                className={`mr-1 ${retrying ? "animate-spin" : ""}`}
              />
              Retry failed ({failedCount})
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 bg-green-50 rounded border border-green-200">
            <div className="text-2xl font-bold text-green-700">{sentCount}</div>
            <div className="text-xs text-green-900 uppercase tracking-wide">Sent</div>
          </div>
          <div className="p-3 bg-red-50 rounded border border-red-200">
            <div className="text-2xl font-bold text-red-700">{failedCount}</div>
            <div className="text-xs text-red-900 uppercase tracking-wide">Failed</div>
          </div>
          <div className="p-3 bg-gray-50 rounded border border-gray-200">
            <div className="text-2xl font-bold text-gray-700">{skipped.length}</div>
            <div className="text-xs text-gray-800 uppercase tracking-wide">Skipped</div>
          </div>
        </div>

        {failuresByError.size > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-800">Failures by reason</h4>
            {Array.from(failuresByError.entries()).map(([err, rows]) => (
              <details
                key={err}
                className="border rounded bg-red-50/30 border-red-200"
              >
                <summary className="p-2 cursor-pointer text-sm text-red-900 flex items-center justify-between">
                  <span className="truncate flex-1 mr-2">{err}</span>
                  <span className="text-xs font-mono bg-red-100 px-2 py-0.5 rounded">
                    {rows.length}
                  </span>
                </summary>
                <ul className="text-xs px-4 pb-2 space-y-0.5 text-gray-700 max-h-48 overflow-y-auto">
                  {rows.map((r) => (
                    <li key={r.email}>
                      {r.email} {r.name && `(${r.name})`}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

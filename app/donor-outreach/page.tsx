"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  Plus,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  MoreVertical,
  Copy,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  listCampaigns,
  createCampaign,
  duplicateCampaign,
  deleteCampaign,
  CampaignSummary,
} from "./_lib/api"

function StatusBadge({ status }: { status: CampaignSummary["status"] }) {
  const map: Record<
    CampaignSummary["status"],
    { label: string; className: string; icon: any }
  > = {
    draft: {
      label: "Draft",
      className: "bg-gray-100 text-gray-700",
      icon: Clock,
    },
    sending: {
      label: "Sending",
      className: "bg-blue-100 text-blue-700",
      icon: Loader2,
    },
    sent: {
      label: "Sent",
      className: "bg-green-100 text-green-700",
      icon: CheckCircle2,
    },
    failed: {
      label: "Failed",
      className: "bg-red-100 text-red-700",
      icon: XCircle,
    },
  }
  const { label, className, icon: Icon } = map[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon size={12} className={status === "sending" ? "animate-spin" : ""} />
      {label}
    </span>
  )
}

export default function DonorOutreachPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      setLoading(true)
      const list = await listCampaigns()
      setCampaigns(list)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      setCreating(true)
      setError(null)
      const c = await createCampaign(newName.trim(), session?.user?.email ?? undefined)
      setNewOpen(false)
      setNewName("")
      router.push(`/donor-outreach/${c.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Donor Outreach</h1>
          <p className="text-sm text-gray-600 mt-1">
            Compose impact updates and campaigns, then send to your donor list.
          </p>
        </div>
        <Button
          className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white"
          onClick={() => setNewOpen(true)}
        >
          <Plus size={16} className="mr-1" />
          New Campaign
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-700 text-sm p-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center text-gray-500">
            <Mail size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-700">No campaigns yet</p>
            <p className="text-sm mt-1">
              Click <strong>New Campaign</strong> to compose your first donor update.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Card
              key={c.id}
              className="hover:border-[#A2BD9D] transition-colors"
            >
              <CardContent className="p-0 flex flex-col sm:flex-row sm:items-center">
                <Link
                  href={`/donor-outreach/${c.id}`}
                  className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-gray-900 truncate">
                        {c.name}
                      </span>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {c.subject || "No subject set"}
                    </p>
                  </div>
                  <div className="text-xs text-gray-600 flex gap-4 sm:gap-6 flex-shrink-0">
                    <div>
                      <div className="text-[10px] uppercase text-gray-400">Recipients</div>
                      <div className="font-medium">{c.recipient_count}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-gray-400">Sent</div>
                      <div className="font-medium">{c.sent_count}</div>
                    </div>
                    {c.failed_count > 0 && (
                      <div>
                        <div className="text-[10px] uppercase text-red-400">Failed</div>
                        <div className="font-medium text-red-600">{c.failed_count}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-[10px] uppercase text-gray-400">Created</div>
                      <div className="font-medium">
                        {new Date(c.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </Link>
                <div className="pr-3 pb-3 sm:pb-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            const copy = await duplicateCampaign(
                              c.id,
                              session?.user?.email ?? undefined,
                            )
                            router.push(`/donor-outreach/${copy.id}`)
                          } catch (err: any) {
                            setError(err.message)
                          }
                        }}
                      >
                        <Copy size={14} className="mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      {c.status === "draft" && (
                        <DropdownMenuItem
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!confirm(`Delete "${c.name}"?`)) return
                            try {
                              await deleteCampaign(c.id)
                              refresh()
                            } catch (err: any) {
                              setError(err.message)
                            }
                          }}
                          className="text-red-600"
                        >
                          <Trash2 size={14} className="mr-2" />
                          Delete draft
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <label className="text-sm font-medium text-gray-700">
              Campaign name (internal — donors won't see this)
            </label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Ramadan 2026 Impact Update"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white"
            >
              {creating ? "Creating…" : "Create & Edit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

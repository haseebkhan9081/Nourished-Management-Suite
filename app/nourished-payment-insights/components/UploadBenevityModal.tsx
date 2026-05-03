"use client"

import { useCallback, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  UploadCloud,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  Upload,
} from "lucide-react"
import { parseBenevityCsv, type BenevityParsedFile } from "@/lib/benevity-parser"
import { parseCyberGrantsCsv, isCyberGrantsCsv, type CyberGrantsParsedFile } from "@/lib/cybergrants-parser"
import { DataFreshnessBanner } from "./DataFreshnessBanner"

// Common upload shape so both sources flow through the same backend payload.
type NormalizedSource = "benevity" | "cybergrants"
interface NormalizedParsed {
  source: NormalizedSource
  disbursementIds: string[]   // may be 1 (Benevity) or many (CyberGrants)
  donations: BenevityParsedFile["donations"]
  grossTotal: number
  netTotal: number
  errors: string[]
}

function normalizeBenevity(p: BenevityParsedFile): NormalizedParsed {
  return {
    source: "benevity",
    disbursementIds: p.disbursementId ? [p.disbursementId] : [],
    donations: p.donations,
    grossTotal: p.grossTotal,
    netTotal: p.netTotal,
    errors: p.errors,
  }
}
function normalizeCyberGrants(p: CyberGrantsParsedFile): NormalizedParsed {
  return {
    source: "cybergrants",
    disbursementIds: p.disbursementIds,
    donations: p.donations as BenevityParsedFile["donations"],
    grossTotal: p.grossTotal,
    netTotal: p.netTotal,
    errors: p.errors,
  }
}

type UploadStatus = "idle" | "parsing" | "preview" | "uploading" | "success" | "error"

interface ParsedResult {
  fileName: string
  parsed: NormalizedParsed
}

interface Props {
  open: boolean
  onClose: () => void
}

export function UploadBenevityModal({ open, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<UploadStatus>("idle")
  const [files, setFiles] = useState<ParsedResult[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [serverResult, setServerResult] = useState<{
    totalInserted: number
    totalSkipped: number
    perFile: Array<{ fileName: string; source: NormalizedSource; disbursementSummary: string; inserted: number; skipped: number }>
  } | null>(null)

  const reset = () => {
    setStatus("idle")
    setFiles([])
    setErrorMsg(null)
    setServerResult(null)
    setIsDragging(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // ── Parse one file client-side ─────────────────────────────────────────────
  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target?.result as string)
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
      reader.readAsText(file)
    })

  const processFiles = async (selected: FileList | File[]) => {
    const fileArr = Array.from(selected).filter(
      f => f.name.toLowerCase().endsWith(".csv") || f.name.toLowerCase().endsWith(".txt")
    )
    if (fileArr.length === 0) {
      setErrorMsg("Only .csv / .txt files are accepted")
      setStatus("error")
      return
    }

    setStatus("parsing")
    setErrorMsg(null)

    try {
      const parsed: ParsedResult[] = []
      for (const file of fileArr) {
        const text = await readFile(file)
        // Auto-detect: CyberGrants has a flat header with "CyberGrants Donation ID"
        // / "Pass-through Agent" on line 1. Benevity has a metadata preamble.
        const normalized: NormalizedParsed = isCyberGrantsCsv(text)
          ? normalizeCyberGrants(parseCyberGrantsCsv(text))
          : normalizeBenevity(parseBenevityCsv(text))
        parsed.push({ fileName: file.name, parsed: normalized })
      }

      const allEmpty = parsed.every(r => r.parsed.donations.length === 0)
      if (allEmpty) {
        throw new Error(
          "No donations found in any of the selected files. Make sure you're uploading a Benevity 'Detailed Donation Report' or a CyberGrants payment-detail export."
        )
      }

      setFiles(parsed)
      setStatus("preview")
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to parse file(s)")
      setStatus("error")
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files)
    e.target.value = ""
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files)
  }, [])

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleDragLeave = () => setIsDragging(false)

  // ── Upload to backend ──────────────────────────────────────────────────────
  const handleUpload = async () => {
    setStatus("uploading")
    setErrorMsg(null)
    try {
      const perFile: Array<{ fileName: string; source: NormalizedSource; disbursementSummary: string; inserted: number; skipped: number }> = []
      let totalInserted = 0
      let totalSkipped = 0

      for (const file of files) {
        const body = {
          donations: file.parsed.donations,
        }
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/benevity/upload`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(`${file.fileName}: ${data.error || data.message || "Upload failed"}`)
        }
        const inserted = data.inserted ?? 0
        const skipped = data.skipped ?? 0
        totalInserted += inserted
        totalSkipped += skipped
        const ids = file.parsed.disbursementIds
        const disbursementSummary = ids.length === 0
          ? "(none)"
          : ids.length === 1 ? ids[0]
          : `${ids.length} disbursements`
        perFile.push({
          fileName: file.fileName,
          source: file.parsed.source,
          disbursementSummary,
          inserted,
          skipped,
        })
      }

      setServerResult({ totalInserted, totalSkipped, perFile })
      setStatus("success")
    } catch (err: any) {
      setErrorMsg(err.message || "Upload failed")
      setStatus("error")
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderDropzone = () => (
    <div
      className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl px-6 py-14 cursor-pointer transition-all ${
        isDragging
          ? "border-[#A2BD9D] bg-[#A2BD9D]/10"
          : "border-gray-300 bg-white hover:border-[#A2BD9D] hover:bg-[#A2BD9D]/5"
      }`}
      onClick={() => fileInputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <UploadCloud size={44} className={`mb-4 ${isDragging ? "text-[#A2BD9D]" : "text-gray-400"}`} />
      <p className="text-sm font-medium text-gray-700">
        Drag &amp; drop Benevity or CyberGrants CSV files
      </p>
      <p className="text-xs text-gray-400 mt-1">or click to browse · format is auto-detected</p>
      <span className="mt-4 text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
        Benevity "Detailed Donation Report" or CyberGrants payment-detail export
      </span>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )

  const renderParsing = () => (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
      <p className="text-sm text-gray-500">Parsing Benevity CSVs…</p>
    </div>
  )

  const renderPreview = () => {
    const totalDonations = files.reduce((n, f) => n + f.parsed.donations.length, 0)
    const totalGross = files.reduce((n, f) => n + f.parsed.grossTotal, 0)
    const totalNet = files.reduce((n, f) => n + f.parsed.netTotal, 0)
    const fileErrors = files.filter(f => f.parsed.errors.length > 0)

    return (
      <div className="space-y-4">
        <div className="bg-white border rounded-lg p-3 sm:p-4 shadow-sm">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Files</p>
              <p className="text-lg font-semibold text-gray-900">{files.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Donations</p>
              <p className="text-lg font-semibold text-[#A2BD9D]">{totalDonations}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Gross / Net</p>
              <p className="text-lg font-semibold text-gray-900 truncate">
                ${Math.round(totalGross).toLocaleString()} / ${Math.round(totalNet).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {fileErrors.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <h4 className="font-semibold text-yellow-800 text-xs sm:text-sm mb-2">
              Warnings on {fileErrors.length} file{fileErrors.length !== 1 ? "s" : ""}
            </h4>
            <ul className="text-xs text-yellow-700 list-disc pl-5 space-y-1 max-h-32 overflow-y-auto">
              {fileErrors.map(f =>
                f.parsed.errors.map((err, i) => (
                  <li key={`${f.fileName}-${i}`} className="break-words">
                    <strong>{f.fileName}:</strong> {err}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {files.map(f => {
            const ids = f.parsed.disbursementIds
            const disbLabel = ids.length === 0
              ? "(no disbursement)"
              : ids.length === 1 ? `Disbursement ${ids[0]}`
              : `${ids.length} disbursements (${ids.slice(0, 2).join(", ")}${ids.length > 2 ? "…" : ""})`
            const sourceBadge = f.parsed.source === "cybergrants"
              ? { label: "CyberGrants", className: "bg-blue-100 text-blue-700" }
              : { label: "Benevity",    className: "bg-[#A2BD9D]/20 text-[#4F8A70]" }
            return (
              <div
                key={f.fileName}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 bg-white border rounded-lg px-3 sm:px-4 py-2.5 shadow-sm"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileSpreadsheet size={18} className="text-[#A2BD9D] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs sm:text-sm font-medium text-gray-700 truncate">{f.fileName}</p>
                      <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${sourceBadge.className} shrink-0`}>
                        {sourceBadge.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      {disbLabel} · {f.parsed.donations.length} donors · ${Math.round(f.parsed.netTotal).toLocaleString()} net
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setFiles(prev => prev.filter(x => x.fileName !== f.fileName))}
                  className="text-gray-400 hover:text-red-500 self-end sm:self-auto shrink-0"
                  title="Remove"
                >
                  <X size={16} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderUploading = () => (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
      <p className="text-sm text-gray-500">Uploading {files.length} file{files.length !== 1 ? "s" : ""}…</p>
    </div>
  )

  const renderSuccess = () => {
    if (!serverResult) return null
    const allSkipped = serverResult.totalInserted === 0 && serverResult.totalSkipped > 0
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <CheckCircle2 size={46} className={allSkipped ? "text-yellow-500" : "text-[#A2BD9D]"} />
          <p className="text-base font-semibold text-gray-800">
            {allSkipped ? "Nothing New to Import" : "Upload Successful"}
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-gray-600 text-center sm:text-left">
            <span>
              <span className="font-semibold text-[#A2BD9D]">{serverResult.totalInserted}</span> new
            </span>
            <span className="hidden sm:inline text-gray-300">|</span>
            <span>
              <span className="font-semibold text-yellow-600">{serverResult.totalSkipped}</span> duplicate{serverResult.totalSkipped !== 1 ? "s" : ""} skipped
            </span>
          </div>
        </div>
        <div className="border rounded-lg divide-y divide-gray-100 bg-white text-sm max-h-60 overflow-y-auto">
          {serverResult.perFile.map(r => (
            <div key={r.fileName} className="px-3 sm:px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-gray-800 truncate text-xs sm:text-sm">{r.fileName}</p>
                  <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                    r.source === "cybergrants" ? "bg-blue-100 text-blue-700" : "bg-[#A2BD9D]/20 text-[#4F8A70]"
                  }`}>
                    {r.source === "cybergrants" ? "CyberGrants" : "Benevity"}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate">{r.disbursementSummary}</p>
              </div>
              <div className="text-xs text-gray-600 text-right shrink-0">
                <span className="text-[#A2BD9D] font-semibold">{r.inserted} new</span>
                {" · "}
                <span className="text-yellow-600">{r.skipped} dup</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderError = () => (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <AlertCircle size={46} className="text-red-400" />
        <p className="text-base font-semibold text-gray-800">Something went wrong</p>
        <p className="text-sm text-red-500 text-center max-w-sm">{errorMsg}</p>
      </div>
      <Button variant="outline" className="w-full" onClick={reset}>
        Try again
      </Button>
    </div>
  )

  const renderFooter = () => {
    if (status === "preview") {
      return (
        <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-3 border-t mt-1">
          <Button variant="ghost" onClick={reset} className="w-full sm:w-auto order-2 sm:order-none">Change files</Button>
          <Button
            onClick={handleUpload}
            disabled={files.length === 0}
            className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white flex items-center gap-2 w-full sm:w-auto order-1 sm:order-none justify-center"
          >
            <Upload size={16} />
            Upload {files.length} file{files.length !== 1 ? "s" : ""}
          </Button>
        </div>
      )
    }
    if (status === "success") {
      return (
        <div className="flex justify-center sm:justify-end pt-3 border-t mt-1">
          <Button onClick={handleClose} className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white w-full sm:w-auto">
            Done
          </Button>
        </div>
      )
    }
    return null
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-full sm:max-w-3xl bg-gray-50 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-lg font-semibold text-gray-900">
            Upload Corporate Donor Reports
          </DialogTitle>
          <p className="text-sm text-gray-600">
            Drop Benevity "Detailed Donation Report" CSVs or CyberGrants payment-detail exports.
            Format is detected automatically. Dedup is safe — re-uploading the same file does nothing.
          </p>
        </DialogHeader>

        <div className="mt-2 pr-4">
          {(status === "idle" || status === "error") && (
            <DataFreshnessBanner source="benevity" open={open} />
          )}
          {status === "idle"      && renderDropzone()}
          {status === "parsing"   && renderParsing()}
          {status === "preview"   && renderPreview()}
          {status === "uploading" && renderUploading()}
          {status === "success"   && renderSuccess()}
          {status === "error"     && renderError()}
        </div>

        {renderFooter()}
      </DialogContent>
    </Dialog>
  )
}

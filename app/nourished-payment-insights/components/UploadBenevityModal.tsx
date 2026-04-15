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

type UploadStatus = "idle" | "parsing" | "preview" | "uploading" | "success" | "error"

interface ParsedResult {
  fileName: string
  parsed: BenevityParsedFile
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
    perFile: Array<{ fileName: string; disbursementId: string; inserted: number; skipped: number }>
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
        const p = parseBenevityCsv(text)
        parsed.push({ fileName: file.name, parsed: p })
      }

      // If every parsed file has zero donations and zero disbursement id, bail
      const allEmpty = parsed.every(r => r.parsed.donations.length === 0)
      if (allEmpty) {
        throw new Error(
          "No donations found in any of the selected files. Make sure you're uploading the 'Detailed Donation Report' export from Benevity, not the summary."
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
      const perFile: Array<{ fileName: string; disbursementId: string; inserted: number; skipped: number }> = []
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
        perFile.push({
          fileName: file.fileName,
          disbursementId: file.parsed.disbursementId,
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
        Drag &amp; drop one or more Benevity CSV files
      </p>
      <p className="text-xs text-gray-400 mt-1">or click to browse</p>
      <span className="mt-4 text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
        Detailed Donation Reports from Benevity Causes Portal
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
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Files</p>
              <p className="text-lg font-semibold text-gray-900">{files.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Donations</p>
              <p className="text-lg font-semibold text-[#A2BD9D]">{totalDonations}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Gross / Net</p>
              <p className="text-lg font-semibold text-gray-900">
                ${Math.round(totalGross).toLocaleString()} / ${Math.round(totalNet).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {fileErrors.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <h4 className="font-semibold text-yellow-800 text-sm mb-2">
              Warnings on {fileErrors.length} file{fileErrors.length !== 1 ? "s" : ""}
            </h4>
            <ul className="text-xs text-yellow-700 list-disc pl-5 space-y-1">
              {fileErrors.map(f =>
                f.parsed.errors.map((err, i) => (
                  <li key={`${f.fileName}-${i}`}>
                    <strong>{f.fileName}:</strong> {err}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          {files.map(f => (
            <div
              key={f.fileName}
              className="flex items-center justify-between bg-white border rounded-lg px-4 py-2.5 shadow-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet size={18} className="text-[#A2BD9D] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{f.fileName}</p>
                  <p className="text-xs text-gray-400">
                    Disbursement {f.parsed.disbursementId || "?"} · {f.parsed.donations.length} donors · ${Math.round(f.parsed.netTotal).toLocaleString()} net
                  </p>
                </div>
              </div>
              <button
                onClick={() => setFiles(prev => prev.filter(x => x.fileName !== f.fileName))}
                className="text-gray-400 hover:text-red-500 ml-3 shrink-0"
                title="Remove"
              >
                <X size={16} />
              </button>
            </div>
          ))}
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
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>
              <span className="font-semibold text-[#A2BD9D]">{serverResult.totalInserted}</span> new
            </span>
            <span className="text-gray-300">|</span>
            <span>
              <span className="font-semibold text-yellow-600">{serverResult.totalSkipped}</span> duplicate{serverResult.totalSkipped !== 1 ? "s" : ""} skipped
            </span>
          </div>
        </div>
        <div className="border rounded-lg divide-y divide-gray-100 bg-white text-sm max-h-60 overflow-y-auto">
          {serverResult.perFile.map(r => (
            <div key={r.fileName} className="px-4 py-2 flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium text-gray-800 truncate">{r.fileName}</p>
                <p className="text-xs text-gray-400">Disbursement {r.disbursementId}</p>
              </div>
              <div className="text-xs text-gray-600 text-right shrink-0 ml-4">
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
        <div className="flex justify-end gap-2 pt-3 border-t mt-1">
          <Button variant="ghost" onClick={reset}>Change files</Button>
          <Button
            onClick={handleUpload}
            disabled={files.length === 0}
            className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white flex items-center gap-2"
          >
            <Upload size={16} />
            Upload {files.length} file{files.length !== 1 ? "s" : ""}
          </Button>
        </div>
      )
    }
    if (status === "success") {
      return (
        <div className="flex justify-end pt-3 border-t mt-1">
          <Button onClick={handleClose} className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white">
            Done
          </Button>
        </div>
      )
    }
    return null
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl bg-gray-50">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-gray-900">
            Upload Benevity Reports
          </DialogTitle>
          <p className="text-sm text-gray-600">
            Drop one or more "Detailed Donation Report" CSVs from the Benevity Causes Portal.
            Dedup is automatic via Benevity's Transaction ID, so re-uploading the same file is safe.
          </p>
        </DialogHeader>

        <div className="mt-2">
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

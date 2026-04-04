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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type UploadStatus = "idle" | "parsing" | "preview" | "uploading" | "success" | "error"

interface TransactionRow {
  date: string
  amount: string
  flag: string
  check_number: string
  details: string
}

interface Props {
  open: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Payment file parser — tab-separated, NO header row
// Columns: date | amount | flag | details
// ---------------------------------------------------------------------------
function parsePaymentFile(text: string): TransactionRow[] {
  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0)

  return lines.map(line => {
    // Split on comma, but respect quoted fields (details may contain commas)
    const cols: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === "," && !inQuotes) {
        cols.push(current.trim())
        current = ""
      } else {
        current += ch
      }
    }
    cols.push(current.trim()) // last field

    return {
      date:         cols[0] ?? "",
      amount:       cols[1] ?? "",
      flag:         cols[2] ?? "",
      check_number: cols[3] ?? "",
      details:      cols[4] ?? "",
    }
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function UploadTransactionModal({ open, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus]       = useState<UploadStatus>("idle")
  const [fileName, setFileName]   = useState<string | null>(null)
  const [rows, setRows]           = useState<TransactionRow[]>([])
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleClose = () => {
    setStatus("idle"); setFileName(null); setRows([])
    setErrorMsg(null); setIsDragging(false); onClose()
  }

  const handleReset = () => {
    setStatus("idle"); setFileName(null); setRows([]); setErrorMsg(null)
  }

  // ── File processing ─────────────────────────────────────────────────────────
  const processFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv") &&
        !file.name.toLowerCase().endsWith(".txt")) {
      setErrorMsg("Only .csv or .txt payment export files are accepted.")
      setStatus("error")
      return
    }

    setFileName(file.name)
    setStatus("parsing")
    setErrorMsg(null)

    const reader = new FileReader()
    reader.onload = e => {
      try {
        const text = e.target?.result as string
        const parsed = parsePaymentFile(text)
        if (parsed.length === 0)
          throw new Error("The file appears to be empty or has no data rows.")
        setRows(parsed)
        setStatus("preview")
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to parse the file.")
        setStatus("error")
      }
    }
    reader.onerror = () => {
      setErrorMsg("Failed to read the file.")
      setStatus("error")
    }
    reader.readAsText(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ""
  }

  // ── Drag-and-drop ────────────────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }, [])

  const handleDragOver  = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)

  // ── Upload ───────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    setStatus("uploading"); setErrorMsg(null)
    try {
        
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/transactions/payment/upload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactions: rows }),
        }
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.message || "Upload failed. Please try again.")
      }
      setStatus("success")
      setWarnings(data.warnings || [])
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred.")
      setStatus("error")
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
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
      <UploadCloud
        size={44}
        className={`mb-4 transition-colors ${isDragging ? "text-[#A2BD9D]" : "text-gray-400"}`}
      />
      <p className="text-sm font-medium text-gray-700">
        Drag &amp; drop your payment export file here
      </p>
      <p className="text-xs text-gray-400 mt-1">or click to browse</p>
      <span className="mt-4 text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
        .csv / .txt — tab-separated, no header row
      </span>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )

  const renderParsing = () => (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
      <p className="text-sm text-gray-500">Parsing {fileName}…</p>
    </div>
  )

  const renderPreview = () => (
    <div className="space-y-4">
      {/* File pill */}
      <div className="flex items-center justify-between bg-white border rounded-lg px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <FileSpreadsheet size={18} className="text-[#A2BD9D] shrink-0" />
          <span className="text-sm font-medium text-gray-700 truncate">{fileName}</span>
          <span className="text-xs text-gray-400 shrink-0">
            — {rows.length} row{rows.length !== 1 ? "s" : ""} parsed
          </span>
        </div>
        <button
          onClick={handleReset}
          className="text-gray-400 hover:text-red-500 transition-colors ml-3 shrink-0"
          title="Remove file"
        >
          <X size={16} />
        </button>
      </div>

      {/* JSON preview */}
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Parsed JSON Preview
          </span>
          <span className="text-xs text-gray-400">
            {rows.length > 10 ? `Showing first 10 of ${rows.length}` : `${rows.length} rows`}
          </span>
        </div>
        <div className="overflow-y-auto max-h-72 p-4">
          <pre className="text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap break-words">
            {JSON.stringify(rows.slice(0, 10), null, 2)}
            
          </pre>
        </div>
        {rows.length > 10 && (
          <div className="text-center py-2 border-t bg-gray-50">
            <p className="text-xs text-gray-400">
              + {rows.length - 10} more rows not shown
            </p>
          </div>
        )}
      </div>
    </div>
  )

  const renderUploading = () => (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
      <p className="text-sm text-gray-500">Uploading {rows.length} transactions…</p>
    </div>
  )
// here we will show the success message and the warnings and a close button
  const renderSuccess = (warnings: string[]) => (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <CheckCircle2 size={46} className="text-[#A2BD9D]" />
        <p className="text-base font-semibold text-gray-800">Upload Successful</p>
        <div className="text-sm text-gray-500 text-center max-w-sm mx-auto">
          {rows.length} transaction{rows.length !== 1 ? "s" : ""} have been saved to the database.
          {warnings.length > 0 && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <h4 className="font-semibold text-yellow-800 text-sm mb-2">Warnings ({warnings.length})</h4>
              <div className="max-h-32 overflow-y-auto">
                <ul className="text-xs text-yellow-700 list-disc pl-5 space-y-1">
                  {warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderError = () => (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <AlertCircle size={46} className="text-red-400" />
        <p className="text-base font-semibold text-gray-800">Something went wrong</p>
        <p className="text-sm text-red-500 text-center max-w-sm">{errorMsg}</p>
      </div>
      <Button variant="outline" className="w-full" onClick={handleReset}>
        Try again
      </Button>
    </div>
  )

  const renderFooter = () => {
    if (status === "preview") return (
      <div className="flex justify-end gap-2 pt-3 border-t mt-1">
        <Button variant="ghost" onClick={handleReset}>Change file</Button>
        <Button
          onClick={handleUpload}
          className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white flex items-center gap-2"
        >
          <Upload size={16} />
          Upload to Database
        </Button>
      </div>
    )
    if (status === "success") return (
      <div className="flex justify-end pt-3 border-t mt-1">
        <Button onClick={handleClose} className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white">
          Done
        </Button>
      </div>
    )
    return null
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl bg-gray-50">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-gray-900">
            Add Transaction Data
          </DialogTitle>
          <p className="text-sm text-gray-600">
            Upload a payment export file to import transactions
          </p>
        </DialogHeader>

        <div className="mt-2">
          {status === "idle"      && renderDropzone()}
          {status === "parsing"   && renderParsing()}
          {status === "preview"   && renderPreview()}
          {status === "uploading" && renderUploading()}
          {status === "success"   && renderSuccess(warnings)}
          {status === "error"     && renderError()}
        </div>

        {renderFooter()}
      </DialogContent>
    </Dialog>
  )
}
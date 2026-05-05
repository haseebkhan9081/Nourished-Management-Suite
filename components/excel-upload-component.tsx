"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Upload,
  FileSpreadsheet,
  X,
  Check,
  AlertCircle,
  Loader2,
  Clock,
  Ban,
} from "lucide-react"

interface ExcelUploadComponentProps {
  selectedSchoolId?: number | null
  onDataCommitted?: () => void
}

interface JobSummary {
  newStudentsRegistered: number
  attendanceRecordsProcessed: number
  skippedRecords: number
}

type JobStatusValue =
  | "queued"
  | "parsing"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"

interface JobStatus {
  status: JobStatusValue
  progress: number
  processedRecords: number
  totalRecords: number
  summary?: JobSummary
  errors?: string[]
  startedAt?: string
  finishedAt?: string
  error?: string
  fileName?: string
}

const POLL_INTERVAL_MS = 750
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const TERMINAL_STATUSES: JobStatusValue[] = ["completed", "failed", "cancelled"]

export function ExcelUploadComponent({
  selectedSchoolId,
  onDataCommitted,
}: ExcelUploadComponentProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  const calculateEstimatedTime = (
    progress: number,
    started: number,
  ): string => {
    if (progress < 5) return "Calculating..."
    const elapsed = Date.now() - started
    const estimatedTotal = elapsed / (progress / 100)
    const remaining = estimatedTotal - elapsed
    if (remaining < 60000) {
      return `${Math.ceil(remaining / 1000)}s remaining`
    }
    return `${Math.ceil(remaining / 60000)}m remaining`
  }

  const validateFile = (file: File): string | null => {
    const isValidType =
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel" ||
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.name.toLowerCase().endsWith(".xls")
    if (!isValidType) return "Please upload a valid Excel file (.xlsx or .xls)"
    if (file.size > MAX_FILE_SIZE) return "File size must be less than 10MB"
    return null
  }

  const pollStatus = async (id: string) => {
    if (!isMountedRef.current) return
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/import-excel/status/${id}`,
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Failed to fetch import status")
      }
      const data: JobStatus = await res.json()
      if (!isMountedRef.current) return

      setJobStatus(data)

      if (TERMINAL_STATUSES.includes(data.status)) {
        if (data.status === "completed" && onDataCommitted) {
          onDataCommitted()
        }
        return
      }

      pollTimerRef.current = setTimeout(() => pollStatus(id), POLL_INTERVAL_MS)
    } catch (err) {
      if (!isMountedRef.current) return
      setError(err instanceof Error ? err.message : "Failed to fetch import status")
    }
  }

  const startUpload = async (file: File) => {
    if (!selectedSchoolId) {
      setError("Please select a school before uploading")
      return
    }
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setFileName(file.name)
    setIsUploading(true)
    setStartTime(Date.now())
    setJobStatus(null)
    setJobId(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("schoolId", String(selectedSchoolId))

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/import-excel/upload`,
        {
          method: "POST",
          body: formData,
        },
      )

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload file")
      }
      if (!data.jobId) {
        throw new Error("Server did not return a job ID")
      }
      if (!isMountedRef.current) return

      setJobId(data.jobId)
      setJobStatus({
        status: data.status || "queued",
        progress: 0,
        processedRecords: 0,
        totalRecords: data.totalRecords || 0,
        fileName: data.fileName,
      })
      setIsUploading(false)

      pollStatus(data.jobId)
    } catch (err) {
      if (!isMountedRef.current) return
      setError(err instanceof Error ? err.message : "Failed to upload file")
      setIsUploading(false)
      setFileName(null)
    }
  }

  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (file) startUpload(file)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
    const file = event.dataTransfer.files[0]
    if (file) startUpload(file)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
  }

  const handleCancelJob = async () => {
    if (!jobId || isCancelling) return
    setIsCancelling(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/import-excel/cancel/${jobId}`,
        { method: "POST" },
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Failed to cancel import")
      }
      // The poll loop will pick up the new "cancelled" status.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel import")
    } finally {
      setIsCancelling(false)
    }
  }

  const handleReset = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    setJobId(null)
    setJobStatus(null)
    setError(null)
    setIsUploading(false)
    setIsCancelling(false)
    setStartTime(null)
    setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const isCompleted = jobStatus?.status === "completed"
  const isCancelled = jobStatus?.status === "cancelled"
  const isFailed = jobStatus?.status === "failed"
  const isActive =
    isUploading ||
    (jobStatus !== null && !TERMINAL_STATUSES.includes(jobStatus.status))

  // ── Result view: completed / cancelled / failed ────────────────────────────
  if (isCompleted || isCancelled || isFailed) {
    const summary = jobStatus?.summary
    const errors = jobStatus?.errors ?? []

    const heading = isCompleted
      ? "Import Successful"
      : isCancelled
        ? "Import Cancelled"
        : "Import Failed"

    const titleClass = isCompleted
      ? "text-[#A2BD9D]"
      : isCancelled
        ? "text-orange-600"
        : "text-red-600"

    const Icon = isCompleted ? Check : isCancelled ? Ban : AlertCircle

    const bannerColor = isCompleted
      ? "bg-green-50 border-green-200"
      : isCancelled
        ? "bg-orange-50 border-orange-200"
        : "bg-red-50 border-red-200"

    const bannerTextColor = isCompleted
      ? "text-green-800"
      : isCancelled
        ? "text-orange-800"
        : "text-red-800"

    const subtleTextColor = isCompleted
      ? "text-green-700"
      : isCancelled
        ? "text-orange-700"
        : "text-red-700"

    const message = isCompleted
      ? "Your attendance data has been processed and saved."
      : isCancelled
        ? "Import was stopped. Records already written remain saved."
        : jobStatus?.error || "Something went wrong while processing the file."

    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${titleClass}`}>
            <Icon className="h-5 w-5" />
            {heading}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className={`${bannerColor} border rounded-lg p-6 text-center`}>
            <div className={`mb-4 ${titleClass}`}>
              <Icon className="h-12 w-12 mx-auto" />
            </div>
            <h3 className={`text-xl font-semibold mb-2 ${bannerTextColor}`}>
              {heading}
            </h3>
            <p className={`mb-6 ${subtleTextColor}`}>{message}</p>

            {summary && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                  <p className="text-sm text-gray-500">New Students</p>
                  <p className="text-2xl font-bold text-[#A2BD9D]">
                    {summary.newStudentsRegistered}
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                  <p className="text-sm text-gray-500">Attendance Records</p>
                  <p className="text-2xl font-bold text-[#A2BD9D]">
                    {summary.attendanceRecordsProcessed}
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                  <p className="text-sm text-gray-500">Skipped</p>
                  <p className="text-2xl font-bold text-[#A2BD9D]">
                    {summary.skippedRecords}
                  </p>
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div className="mt-6 text-left bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-800 mb-2">
                  Warnings ({errors.length})
                </h4>
                <div className="max-h-40 overflow-y-auto">
                  <ul className="text-xs text-yellow-700 list-disc pl-5 space-y-1">
                    {errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <Button
              onClick={handleReset}
              className="mt-6 bg-[#A2BD9D] hover:bg-[#8FA889]"
            >
              Import Another File
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Default view: idle / uploading / processing ────────────────────────────
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-[#A2BD9D] flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Excel File Import
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Idle dropzone — only when nothing is in flight and no error */}
        {!isActive && !error && (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver
                ? "border-[#A2BD9D] bg-[#A2BD9D]/5"
                : "border-gray-300 hover:border-[#A2BD9D]/50"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 bg-[#A2BD9D]/10 rounded-full">
                <Upload className="h-8 w-8 text-[#A2BD9D]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Upload Excel File
                </h3>
                <p className="text-gray-600 mb-4">
                  Drag and drop your Excel file here, or click to browse
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Supported formats: .xlsx, .xls (Max size: 10MB)
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> Files are processed on the server with
                    real-time progress tracking. Existing records will be
                    overwritten.
                  </p>
                </div>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-[#A2BD9D] hover:bg-[#8FA889]"
                  disabled={!selectedSchoolId}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Choose File
                </Button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {!selectedSchoolId && (
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-left">
                <p className="text-yellow-800 text-sm">
                  <strong>Note:</strong> Please select a school before uploading.
                </p>
              </div>
            )}
          </div>
        )}

        {/* In-progress: uploading or polling */}
        {isActive && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 text-blue-500 animate-spin flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-semibold text-blue-800 text-lg">
                  {isUploading
                    ? "Uploading file..."
                    : jobStatus?.status === "queued"
                      ? "Queued"
                      : jobStatus?.status === "parsing"
                        ? "Parsing file..."
                        : "Processing import..."}
                </h4>
                <p className="text-blue-700 text-sm">
                  {fileName && <span className="font-mono">{fileName}</span>}
                  {jobStatus &&
                    jobStatus.totalRecords > 0 &&
                    !isUploading && (
                      <>
                        {" — "}
                        {jobStatus.processedRecords.toLocaleString()} of{" "}
                        {jobStatus.totalRecords.toLocaleString()} records
                      </>
                    )}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-800">
                  {jobStatus?.progress ?? 0}%
                </div>
                {startTime &&
                  jobStatus &&
                  jobStatus.progress > 0 &&
                  jobStatus.progress < 100 && (
                    <div className="text-xs text-blue-600 flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      {calculateEstimatedTime(jobStatus.progress, startTime)}
                    </div>
                  )}
              </div>
            </div>

            <div className="space-y-2">
              <Progress value={jobStatus?.progress ?? 0} className="h-3" />
              <div className="flex justify-between text-xs text-blue-700">
                <span>
                  {jobStatus?.totalRecords
                    ? `${jobStatus.processedRecords.toLocaleString()} / ${jobStatus.totalRecords.toLocaleString()} records`
                    : "Preparing..."}
                </span>
                <span>{jobStatus?.progress ?? 0}% complete</span>
              </div>
            </div>

            {jobStatus?.summary && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                <div className="bg-white/50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-blue-800">
                    {jobStatus.summary.newStudentsRegistered}
                  </div>
                  <div className="text-xs text-blue-600">New Students</div>
                </div>
                <div className="bg-white/50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-blue-800">
                    {jobStatus.summary.attendanceRecordsProcessed}
                  </div>
                  <div className="text-xs text-blue-600">
                    Attendance Records
                  </div>
                </div>
                <div className="bg-white/50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-blue-800">
                    {jobStatus.summary.skippedRecords}
                  </div>
                  <div className="text-xs text-blue-600">Skipped</div>
                </div>
              </div>
            )}

            {jobId && !isUploading && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={handleCancelJob}
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4 mr-2" />
                      Cancel Import
                    </>
                  )}
                </Button>
              </div>
            )}

            {jobStatus?.errors && jobStatus.errors.length > 0 && (
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <h4 className="font-semibold text-yellow-800 text-sm mb-2">
                  Warnings ({jobStatus.errors.length})
                </h4>
                <div className="max-h-32 overflow-y-auto">
                  <ul className="text-xs text-yellow-700 list-disc pl-5 space-y-1">
                    {jobStatus.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                    {jobStatus.errors.length > 5 && (
                      <li className="font-semibold">
                        ...and {jobStatus.errors.length - 5} more warnings
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {error && !isActive && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-red-800">Upload Error</h4>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="border-red-300 text-red-600 hover:bg-red-100"
            >
              <X className="h-4 w-4 mr-1" />
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

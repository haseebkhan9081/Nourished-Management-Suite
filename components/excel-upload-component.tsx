"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Upload, FileSpreadsheet, X, Check, AlertCircle, Loader2, Info, Clock, Ban } from "lucide-react"

interface ParsedExcelData {
  "AC-No": string
  Name: string
  Class: string // Department renamed to Class
  Date: string
  Time: string
}

interface ExcelUploadComponentProps {
  selectedSchoolId?: number | null
  onDataCommitted?: (data: ParsedExcelData[]) => void
}

interface ImportSummary {
  newStudentsRegistered: number
  attendanceRecordsProcessed: number
  totalRecordsProcessed: number
  errors?: string[]
}

export function ExcelUploadComponent({ selectedSchoolId, onDataCommitted }: ExcelUploadComponentProps) {
  const [parsedData, setParsedData] = useState<ParsedExcelData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [progress, setProgress] = useState(0)
  const [currentBatch, setCurrentBatch] = useState(0)
  const [totalBatches, setTotalBatches] = useState(0)
  const [importSummary, setImportSummary] = useState<ImportSummary>({
    newStudentsRegistered: 0,
    attendanceRecordsProcessed: 0,
    totalRecordsProcessed: 0,
  })
  const [startTime, setStartTime] = useState<number | null>(null)
  const [isCancelled, setIsCancelled] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef<boolean>(false)

  const BATCH_SIZE = 20 // Smaller batch size for faster processing

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cancelRef.current = true
    }
  }, [])

  const calculateEstimatedTime = (progress: number, startTime: number): string => {
    if (progress < 5) return "Calculating..."

    const elapsed = Date.now() - startTime
    const estimatedTotal = elapsed / (progress / 100)
    const estimatedRemaining = estimatedTotal - elapsed

    if (estimatedRemaining < 60000) {
      return `${Math.ceil(estimatedRemaining / 1000)}s remaining`
    } else {
      return `${Math.ceil(estimatedRemaining / 60000)}m remaining`
    }
  }

  const validateFile = (file: File): boolean => {
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
    ]
    return validTypes.includes(file.type) || file.name.endsWith(".xlsx") || file.name.endsWith(".xls")
  }

  const parseExcelFile = async (file: File) => {
    setIsLoading(true)
    setError(null)
    setImportResult(null)

    try {
      // Check if xlsx is available, if not provide helpful error
      let XLSX: any
      try {
        XLSX = await import("xlsx")
      } catch (importError) {
        throw new Error("Excel parsing library not available. Please install the xlsx package: npm install xlsx")
      }

      const arrayBuffer = await file.arrayBuffer()
      // Parse without cellDates to avoid timezone issues
      const workbook = XLSX.read(arrayBuffer, {
        type: "array",
        cellDates: false, // Disable automatic date parsing to avoid timezone issues
        raw: false,
      })

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error("No worksheets found in the Excel file")
      }

      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]

      if (!worksheet) {
        throw new Error("Unable to read the first worksheet")
      }

      // Get the raw data without automatic date conversion
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false, // Get formatted values as they appear in Excel
        defval: "", // Default value for empty cells
      })

      if (jsonData.length < 2) {
        throw new Error("Excel file must contain at least a header row and one data row")
      }

      const headers = jsonData[0] as string[]
      const dataRows = jsonData.slice(1) as any[][]

      // Map headers to expected column names
      const headerMapping: { [key: string]: number } = {}
      headers.forEach((header, index) => {
        const normalizedHeader = header.toString().toLowerCase().trim()
        if (
          normalizedHeader.includes("ac-no") ||
          normalizedHeader.includes("ac no") ||
          normalizedHeader.includes("acno") ||
          normalizedHeader.includes("account")
        ) {
          headerMapping["AC-No"] = index
        } else if (normalizedHeader.includes("name")) {
          headerMapping["Name"] = index
        } else if (normalizedHeader.includes("department") || normalizedHeader.includes("class")) {
          headerMapping["Class"] = index
        } else if (normalizedHeader.includes("date")) {
          headerMapping["Date"] = index
        } else if (normalizedHeader.includes("time")) {
          headerMapping["Time"] = index
        }
      })

      // Validate required columns
      const requiredColumns = ["AC-No", "Name", "Date", "Time"]
      const missingColumns = requiredColumns.filter((col) => !(col in headerMapping))

      if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(", ")}. Found columns: ${headers.join(", ")}`)
      }

      // Helper function to parse Excel time values
      const parseExcelTime = (value: any): string => {
        if (value === null || value === undefined || value === "") {
          return ""
        }

        // If it's already a string, check if it contains multiple times
        if (typeof value === "string") {
          const trimmed = value.trim()
          // If it contains spaces, it might be multiple times
          if (trimmed.includes(" ")) {
            return trimmed
          }
          // If it looks like a time already, return it
          if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
            return trimmed
          }
          return trimmed
        }

        // If it's a number (Excel time format), convert it
        if (typeof value === "number") {
          // Excel stores time as fraction of a day (0.5 = 12:00)
          const totalMinutes = Math.round(value * 24 * 60)
          const hours = Math.floor(totalMinutes / 60) % 24
          const minutes = totalMinutes % 60
          return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
        }

        return value.toString()
      }

      // Helper function to parse Excel date values without timezone shifts
      const parseExcelDate = (value: any, worksheet: any, rowIndex: number, colIndex: number): string => {
        if (value === null || value === undefined || value === "") {
          return ""
        }

        // Get the raw cell to check if it's a date
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex }) // +1 because we skip header
        const cell = worksheet[cellAddress]

        // If it's already a properly formatted date string
        if (typeof value === "string") {
          const trimmed = value.trim()

          // Check if it's already in YYYY-MM-DD format
          if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed
          }

          // Handle MM/DD/YYYY format (common Excel format)
          const mmddyyyyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
          if (mmddyyyyMatch) {
            const [, month, day, year] = mmddyyyyMatch
            return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
          }

          // Handle M/D/YYYY format
          const mdyyyyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
          if (mdyyyyMatch) {
            const [, month, day, year] = mdyyyyMatch
            return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
          }

          // Try to parse other date formats
          try {
            const date = new Date(trimmed)
            if (!isNaN(date.getTime())) {
              // Use local date without timezone conversion
              const year = date.getFullYear()
              const month = (date.getMonth() + 1).toString().padStart(2, "0")
              const day = date.getDate().toString().padStart(2, "0")
              return `${year}-${month}-${day}`
            }
          } catch (e) {
            // If parsing fails, return as is
            return trimmed
          }
        }

        // If it's a number and the cell is formatted as a date
        if (typeof value === "number" && cell && cell.t === "d") {
          // Handle Excel date serial number with local time
          try {
            // Excel epoch starts at 1900-01-01, but Excel incorrectly treats 1900 as a leap year
            // So we need to account for this
            const excelEpoch = new Date(1899, 11, 30) // December 30, 1899
            const jsDate = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000)

            // Extract date components in local time to avoid timezone shifts
            const year = jsDate.getFullYear()
            const month = (jsDate.getMonth() + 1).toString().padStart(2, "0")
            const day = jsDate.getDate().toString().padStart(2, "0")

            return `${year}-${month}-${day}`
          } catch (e) {
            console.warn("Error parsing Excel date serial number:", e)
            return value.toString()
          }
        }

        // If it's a number but not a date, try to parse as Excel serial number anyway
        if (typeof value === "number") {
          try {
            // Check if it looks like an Excel date serial number (reasonable range)
            if (value > 1 && value < 100000) {
              const excelEpoch = new Date(1899, 11, 30)
              const jsDate = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000)

              const year = jsDate.getFullYear()
              const month = (jsDate.getMonth() + 1).toString().padStart(2, "0")
              const day = jsDate.getDate().toString().padStart(2, "0")

              return `${year}-${month}-${day}`
            }
          } catch (e) {
            // Fall through to string conversion
          }
        }

        return value.toString()
      }

      // Parse data rows
      const parsed: ParsedExcelData[] = dataRows
        .filter(
          (row) => row && row.length > 0 && row.some((cell) => cell !== null && cell !== undefined && cell !== ""),
        )
        .map((row, index) => {
          try {
            const acNo = (row[headerMapping["AC-No"]] || "").toString().trim()
            const name = (row[headerMapping["Name"]] || "").toString().trim()
            const className =
              headerMapping["Class"] !== undefined ? (row[headerMapping["Class"]] || "").toString().trim() : ""
            const rawDate = row[headerMapping["Date"]]
            const rawTime = row[headerMapping["Time"]]

            // Parse date and time with proper formatting
            const date = parseExcelDate(rawDate, worksheet, index, headerMapping["Date"])
            const time = parseExcelTime(rawTime)

            // Basic validation for required fields
            if (!acNo || !name || !date) {
              console.warn(
                `Skipping row ${index + 2}: Missing required data (AC-No: ${acNo}, Name: ${name}, Date: ${date})`,
              )
              return null
            }

            return {
              "AC-No": acNo,
              Name: name,
              Class: className,
              Date: date,
              Time: time,
            }
          } catch (err) {
            console.warn(`Error parsing row ${index + 2}:`, err)
            return null
          }
        })
        .filter((item): item is ParsedExcelData => item !== null)

      if (parsed.length === 0) {
        throw new Error(
          "No valid data rows found in the Excel file. Please check that your data contains AC-No, Name, and Date columns with valid values.",
        )
      }

      setParsedData(parsed)
    } catch (err) {
      console.error("Error parsing Excel file:", err)
      setError(err instanceof Error ? err.message : "Failed to parse Excel file")
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileSelect = (file: File) => {
    if (!validateFile(file)) {
      setError("Please upload a valid Excel file (.xlsx or .xls)")
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      // 10MB limit
      setError("File size must be less than 10MB")
      return
    }

    parseExcelFile(file)
  }

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)

    const file = event.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
  }

  const processBatch = async (batch: any[], batchIndex: number, totalBatches: number) => {
    if (!selectedSchoolId) return null

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/import-excel/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batch,
          batchIndex,
          totalBatches,
          schoolId: selectedSchoolId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to process batch")
      }

      return await response.json()
    } catch (error) {
      console.error(`Error processing batch ${batchIndex}:`, error)
      throw error
    }
  }

  const handleCommit = async () => {
    if (parsedData.length === 0 || !selectedSchoolId) return

    setIsCommitting(true)
    setError(null)
    setImportResult(null)
    setStartTime(Date.now())
    setProgress(0)
    setCurrentBatch(0)
    setIsCancelled(false)
    cancelRef.current = false

    // Reset summary
    setImportSummary({
      newStudentsRegistered: 0,
      attendanceRecordsProcessed: 0,
      totalRecordsProcessed: 0,
    })

    try {
      // Transform the parsed Excel data to match the API format
      const formattedData = parsedData.map((row) => {
        // Parse punch times from the time string
        const punchTimes = row.Time ? row.Time.split(/\s+/).filter((time) => time.trim()) : []

        return {
          student_id: row["AC-No"],
          name: row.Name,
          class_department: row.Class || "",
          punch_times: punchTimes,
          date: row.Date, // Already in YYYY-MM-DD format from our parsing
          school_id: selectedSchoolId,
        }
      })

      // Split data into batches
      const batches = []
      for (let i = 0; i < formattedData.length; i += BATCH_SIZE) {
        batches.push(formattedData.slice(i, i + BATCH_SIZE))
      }

      setTotalBatches(batches.length)

      // Process batches sequentially
      const errors: string[] = []
      let totalNewStudents = 0
      let totalAttendanceRecords = 0
      let totalProcessedRecords = 0

      for (let i = 0; i < batches.length; i++) {
        // Check if cancelled
        if (cancelRef.current) {
          setIsCancelled(true)
          break
        }

        setCurrentBatch(i)
        const progressPercent = Math.round(((i + 0.5) / batches.length) * 100)
        setProgress(progressPercent)

        try {
          const result = await processBatch(batches[i], i, batches.length)

          if (result) {
            totalNewStudents += result.summary.newStudentsRegistered || 0
            totalAttendanceRecords += result.summary.attendanceRecordsProcessed || 0
            totalProcessedRecords += result.summary.recordsProcessed || 0

            if (result.summary.errors && result.summary.errors.length > 0) {
              errors.push(...result.summary.errors)
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error"
          errors.push(`Batch ${i + 1} failed: ${errorMessage}`)
          // Continue with next batch
        }

        // Update progress after batch completes
        const newProgress = Math.round(((i + 1) / batches.length) * 100)
        setProgress(newProgress)

        // Update summary after each batch
        setImportSummary({
          newStudentsRegistered: totalNewStudents,
          attendanceRecordsProcessed: totalAttendanceRecords,
          totalRecordsProcessed: totalProcessedRecords,
          errors: errors.length > 0 ? errors : undefined,
        })
      }

      // If not cancelled, show final result
      if (!cancelRef.current) {
        setImportResult({
          success: true,
          summary: {
            newStudentsRegistered: totalNewStudents,
            attendanceRecordsProcessed: totalAttendanceRecords,
            totalRecordsProcessed: totalProcessedRecords,
            batchesProcessed: batches.length,
            errors: errors.length > 0 ? errors : undefined,
          },
        })

        // Notify parent component
        if (onDataCommitted) {
          onDataCommitted(parsedData)
        }
      }
    } catch (err) {
      console.error("Error during import:", err)
      setError(err instanceof Error ? err.message : "Failed to import data")
    } finally {
      setIsCommitting(false)
    }
  }

  const handleCancel = () => {
    setParsedData([])
    setError(null)
    setImportResult(null)
    setProgress(0)
    setCurrentBatch(0)
    setTotalBatches(0)
    setImportSummary({
      newStudentsRegistered: 0,
      attendanceRecordsProcessed: 0,
      totalRecordsProcessed: 0,
    })
    setStartTime(null)
    setIsCommitting(false)
    setIsCancelled(false)
    cancelRef.current = false
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleCancelImport = () => {
    cancelRef.current = true
    setIsCancelled(true)
  }

  const formatTimeDisplay = (timeString: string) => {
    if (!timeString) return <span className="text-gray-400 text-sm">No time</span>

    // Handle multiple time punches separated by spaces
    const times = timeString.split(/\s+/).filter((t) => t.trim())

    if (times.length === 0) {
      return <span className="text-gray-400 text-sm">No time</span>
    }

    return (
      <div className="flex flex-wrap gap-1">
        {times.map((time, index) => (
          <Badge key={index} variant="outline" className="text-xs font-mono">
            {time.trim()}
          </Badge>
        ))}
      </div>
    )
  }

  // If import was successful, show the success message
  if (importResult) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-[#A2BD9D] flex items-center gap-2">
            <Check className="h-5 w-5" />
            Import Successful
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <div className="text-green-600 mb-4">
              <Check className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-xl font-semibold text-green-800 mb-2">Data Imported Successfully!</h3>
            <p className="text-green-700 mb-6">Your attendance data has been processed and saved.</p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
              <div className="bg-white p-4 rounded-lg border border-green-100 shadow-sm">
                <p className="text-sm text-gray-500">New Students</p>
                <p className="text-2xl font-bold text-[#A2BD9D]">{importResult.summary.newStudentsRegistered}</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-green-100 shadow-sm">
                <p className="text-sm text-gray-500">Attendance Records</p>
                <p className="text-2xl font-bold text-[#A2BD9D]">{importResult.summary.attendanceRecordsProcessed}</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-green-100 shadow-sm">
                <p className="text-sm text-gray-500">Total Processed</p>
                <p className="text-2xl font-bold text-[#A2BD9D]">{importResult.summary.totalRecordsProcessed}</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-green-100 shadow-sm">
                <p className="text-sm text-gray-500">Batches</p>
                <p className="text-2xl font-bold text-[#A2BD9D]">{importResult.summary.batchesProcessed}</p>
              </div>
            </div>

            {importResult.summary.errors && importResult.summary.errors.length > 0 && (
              <div className="mt-6 text-left bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-800 mb-2">Warnings ({importResult.summary.errors.length})</h4>
                <div className="max-h-40 overflow-y-auto">
                  <ul className="text-xs text-yellow-700 list-disc pl-5 space-y-1">
                    {importResult.summary.errors.map((error: string, index: number) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <Button onClick={handleCancel} className="mt-6 bg-[#A2BD9D] hover:bg-[#8FA889]">
              Import Another File
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-[#A2BD9D] flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Excel File Import
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Area */}
        {parsedData.length === 0 && (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver ? "border-[#A2BD9D] bg-[#A2BD9D]/5" : "border-gray-300 hover:border-[#A2BD9D]/50"
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
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Excel File</h3>
                <p className="text-gray-600 mb-4">Drag and drop your Excel file here, or click to browse</p>
                <p className="text-sm text-gray-500 mb-4">Supported formats: .xlsx, .xls (Max size: 10MB)</p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> Files are processed in small batches with real-time progress tracking.
                  </p>
                </div>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-[#A2BD9D] hover:bg-[#8FA889]"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Choose File
                    </>
                  )}
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
          </div>
        )}

        {/* Real-time Import Progress */}
        {isCommitting && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              {isCancelled ? (
                <Ban className="h-6 w-6 text-orange-500 flex-shrink-0" />
              ) : (
                <Loader2 className="h-6 w-6 text-blue-500 animate-spin flex-shrink-0" />
              )}
              <div className="flex-1">
                <h4 className="font-semibold text-blue-800 text-lg">
                  {isCancelled ? "Import Cancelled" : "Processing Import"}
                </h4>
                <p className="text-blue-700 text-sm">
                  {isCancelled
                    ? "Import was cancelled. Partial data may have been imported."
                    : `Processing batch ${currentBatch + 1} of ${totalBatches}...`}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-800">{progress}%</div>
                {startTime && progress > 0 && progress < 100 && !isCancelled && (
                  <div className="text-xs text-blue-600 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {calculateEstimatedTime(progress, startTime)}
                  </div>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <Progress value={progress} className="h-3" />
              <div className="flex justify-between text-xs text-blue-700">
                <span>
                  Batch {currentBatch + 1} of {totalBatches}
                </span>
                <span>{progress}% complete</span>
              </div>
            </div>

            {/* Live Import Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-white/50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-blue-800">{importSummary.newStudentsRegistered}</div>
                <div className="text-xs text-blue-600">New Students</div>
              </div>
              <div className="bg-white/50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-blue-800">{importSummary.attendanceRecordsProcessed}</div>
                <div className="text-xs text-blue-600">Attendance Records</div>
              </div>
              <div className="bg-white/50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-blue-800">{importSummary.totalRecordsProcessed}</div>
                <div className="text-xs text-blue-600">Records Processed</div>
              </div>
            </div>

            {/* Cancel Button */}
            {!isCancelled && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={handleCancelImport}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Cancel Import
                </Button>
              </div>
            )}

            {/* Errors (if any) */}
            {importSummary.errors && importSummary.errors.length > 0 && (
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <h4 className="font-semibold text-yellow-800 text-sm mb-2">Warnings ({importSummary.errors.length})</h4>
                <div className="max-h-32 overflow-y-auto">
                  <ul className="text-xs text-yellow-700 list-disc pl-5 space-y-1">
                    {importSummary.errors.slice(0, 5).map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                    {importSummary.errors.length > 5 && (
                      <li className="font-semibold">...and {importSummary.errors.length - 5} more warnings</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && !isCommitting && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-800">Upload Error</h4>
              <p className="text-red-700 text-sm mt-1">{error}</p>
              {error.includes("timeout") && (
                <div className="mt-2 text-xs text-red-600">
                  <strong>Tip:</strong> Try splitting your Excel file into smaller files (500-1000 records each) for
                  better performance.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Data Preview */}
        {parsedData.length > 0 && !isCommitting && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Data Preview ({parsedData.length} records)</h3>
              <div className="flex gap-2">
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  className="border-gray-300 hover:border-gray-400"
                  disabled={isCommitting}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={handleCommit}
                  className="bg-[#A2BD9D] hover:bg-[#8FA889]"
                  disabled={isCommitting || !selectedSchoolId}
                >
                  {isCommitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Commit Data
                    </>
                  )}
                </Button>
              </div>
            </div>

            {!selectedSchoolId && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-yellow-800 text-sm">
                  <strong>Note:</strong> Please select a school before committing data.
                </p>
              </div>
            )}

            {parsedData.length > 500 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-800">Large File Detected</h4>
                  <p className="text-blue-700 text-sm">
                    This file contains {parsedData.length} records. It will be processed in{" "}
                    {Math.ceil(parsedData.length / BATCH_SIZE)} batches with real-time progress tracking.
                  </p>
                </div>
              </div>
            )}

            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-white">
                    <TableRow className="bg-[#A2BD9D]/5">
                      <TableHead className="text-[#A2BD9D] font-semibold">AC-No</TableHead>
                      <TableHead className="text-[#A2BD9D] font-semibold">Name</TableHead>
                      <TableHead className="text-[#A2BD9D] font-semibold">Class</TableHead>
                      <TableHead className="text-[#A2BD9D] font-semibold">Date</TableHead>
                      <TableHead className="text-[#A2BD9D] font-semibold">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.slice(0, 100).map((row, index) => (
                      <TableRow key={index} className="hover:bg-[#A2BD9D]/5">
                        <TableCell className="font-medium">{row["AC-No"]}</TableCell>
                        <TableCell>{row.Name}</TableCell>
                        <TableCell>{row.Class}</TableCell>
                        <TableCell className="font-mono">{row.Date}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap">{formatTimeDisplay(row.Time)}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {parsedData.length > 100 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-500 py-4">
                          ... and {parsedData.length - 100} more records
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="bg-[#A2BD9D]/5 border border-[#A2BD9D]/20 rounded-lg p-4">
              <h4 className="font-semibold text-[#A2BD9D] mb-2">Expected Excel Format:</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>
                  • <strong>AC-No:</strong> Account/Employee number
                </li>
                <li>
                  • <strong>Name:</strong> Full name of the person
                </li>
                <li>
                  • <strong>Department/Class:</strong> Department or class designation
                </li>
                <li>
                  • <strong>Date:</strong> Date of attendance (MM/DD/YYYY format supported)
                </li>
                <li>
                  • <strong>Time:</strong> Time punches (can be multiple times separated by spaces)
                </li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

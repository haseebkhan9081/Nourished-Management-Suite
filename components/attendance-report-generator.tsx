"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, Download, Loader2 } from "lucide-react"

export interface Student {
  id: number
  school_id: number
  student_id: string
  system_id: string
  name: string
  class_department: string
  created_at: string
  updated_at: string
}

interface AttendanceReportGeneratorProps {
  selectedSchoolId: number | null
  selectedMonth: string
  students: Student[]
}

interface AttendanceWithStudent {
  id: number
  student_id: string
  date: string
  school_id: number
  punch_times: string[]
  students: Student
}

export function AttendanceReportGenerator({
  selectedSchoolId,
  selectedMonth,
  students,
}: AttendanceReportGeneratorProps) {
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [selectedStudentsForReport, setSelectedStudentsForReport] = useState<string[]>([])
  const [generatingReport, setGeneratingReport] = useState(false)
  const [studentSearchQuery, setStudentSearchQuery] = useState("")

  const filteredStudentsForReport = students.filter(
    (student) =>
      student.name.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
      student.student_id.toLowerCase().includes(studentSearchQuery.toLowerCase()),
  )

  const handleStudentToggle = (studentId: string) => {
    setSelectedStudentsForReport((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    )
  }

  const handleSelectAllStudents = () => {
    if (selectedStudentsForReport.length === filteredStudentsForReport.length) {
      setSelectedStudentsForReport([])
    } else {
      setSelectedStudentsForReport(filteredStudentsForReport.map((s) => s.student_id))
    }
  }

  const generateAttendanceReport = async () => {
    if (selectedStudentsForReport.length === 0) {
      alert("Please select at least one student")
      return
    }

    setGeneratingReport(true)

    try {
      // Fetch attendance data for selected students
      const response = await fetch("/api/attendance-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentIds: selectedStudentsForReport,
          month: selectedMonth,
          schoolId: selectedSchoolId,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to fetch attendance data")
      }

      const attendanceData: AttendanceWithStudent[] = await response.json()

      // Generate PDF using jsPDF with autoTable
      const jsPDF = (await import("jspdf")).default
      const autoTable = (await import("jspdf-autotable")).default

      const doc = new jsPDF()

      // PDF styling constants
      const pageWidth = doc.internal.pageSize.width
      const pageHeight = doc.internal.pageSize.height
      const margin = 20
      let yPosition = margin

      // Helper function to check if date is Sunday
      const isSunday = (dateString: string) => {
        const date = new Date(dateString)
        return date.getDay() === 0
      }

      // Header
      doc.setFillColor(255, 255, 255)
      doc.rect(0, 0, pageWidth, 50, "F")
      doc.setDrawColor(162, 189, 157)
      doc.setLineWidth(2)
      doc.line(0, 50, pageWidth, 50)

      doc.setFontSize(24)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(162, 189, 157)
      doc.text("ATTENDANCE REPORT", pageWidth / 2, 25, { align: "center" })

      doc.setFontSize(12)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100, 100, 100)
      const monthName = new Date(selectedMonth + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })
      doc.text(`Month: ${monthName}`, pageWidth / 2, 38, { align: "center" })

      yPosition = 65

      // Group attendance data by student
      const studentAttendanceMap = new Map<string, AttendanceWithStudent[]>()

      attendanceData.forEach((record) => {
        const studentId = record.students.student_id
        if (!studentAttendanceMap.has(studentId)) {
          studentAttendanceMap.set(studentId, [])
        }
        studentAttendanceMap.get(studentId)?.push(record)
      })

      // Prepare summary data (excluding Sundays from absence count)
      const summaryData: any[] = []

      for (const [studentId, studentRecords] of studentAttendanceMap.entries()) {
        if (studentRecords.length === 0) continue

        const student = studentRecords[0].students
        // Count absences excluding Sundays
        const totalAbsences = studentRecords.filter(
          (record) => record.punch_times.length === 0 && !isSunday(record.date),
        ).length

        summaryData.push([student.name, totalAbsences.toString()])
      }

      // Sort summary data by student name
      summaryData.sort((a, b) => a[0].localeCompare(b[0]))

      // 1. SUMMARY TABLE
      doc.setFontSize(16)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(162, 189, 157)
      doc.text("ATTENDANCE SUMMARY", margin, yPosition)
      yPosition += 15

      // Create summary table using autoTable
      autoTable(doc, {
        startY: yPosition,
        head: [["Student Name", "Total Absences"]],
        body: summaryData,
        theme: "grid",
        headStyles: {
          fillColor: [162, 189, 157],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 12,
          halign: "center",
          cellPadding: 6,
        },
        bodyStyles: {
          fontSize: 11,
          cellPadding: 6,
          halign: "center",
        },
        columnStyles: {
          0: { halign: "left", cellWidth: 120 },
          1: { halign: "center", cellWidth: 50 },
        },
        margin: { left: margin, right: margin },
        tableWidth: "wrap",
      })

      // Get the final Y position after the summary table
      yPosition = (doc as any).lastAutoTable.finalY + 30

      // Check if we need a new page for the detailed table
      if (yPosition > pageHeight - 100) {
        doc.addPage()
        yPosition = margin
      }

      // 2. DETAILED ATTENDANCE TABLE
      doc.setFontSize(16)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(162, 189, 157)
      doc.text("DETAILED ATTENDANCE RECORDS", margin, yPosition)
      yPosition += 15

      // Prepare detailed attendance data - only include dates with records
      const detailedData: any[] = []

      // Sort all attendance records by name
     const sortedAttendanceData = [...attendanceData].sort(
  (a, b) => a.students.name.localeCompare(b.students.name),
)

      // Process each attendance record
      sortedAttendanceData.forEach((record) => {
        if (isSunday(record.date)) return; // Skip Sunday records
        const date = new Date(record.date)
        const formattedDate = date.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })

        const studentName = record.students.name
        const status = record.punch_times.length > 0 ? "Present" : "Absent"
        const punchTime = record.punch_times.length > 0 ? record.punch_times.join(", ") : "-"

        detailedData.push([formattedDate, studentName, punchTime, status])
      })

      // Create detailed attendance table using autoTable
      autoTable(doc, {
        startY: yPosition,
        head: [["Date", "Student Name", "Punch Times", "Status"]],
        body: detailedData,
        theme: "grid",
        headStyles: {
          fillColor: [162, 189, 157],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 11,
          halign: "center",
          cellPadding: 5,
        },
        bodyStyles: {
          fontSize: 10,
          cellPadding: 4,
        },
        columnStyles: {
          0: { halign: "center", cellWidth: 35 }, // Date
          1: { halign: "left", cellWidth: 60 }, // Student Name
          2: { halign: "center", cellWidth: 50 }, // Punch Times
          3: { halign: "center", cellWidth: 25 }, // Status
        },
        margin: { left: margin, right: margin },
        tableWidth: "wrap",
        didParseCell: (data: any) => {
          // Style based on status
          if (data.column.index === 3) {
            // Status column
            if (data.cell.text[0] === "Present") {
              data.cell.styles.fillColor = [235, 255, 235]
              data.cell.styles.textColor = [50, 150, 50]
              data.cell.styles.fontStyle = "bold"
            } else if (data.cell.text[0] === "Absent") {
              data.cell.styles.fillColor = [255, 235, 235]
              data.cell.styles.textColor = [200, 50, 50]
              data.cell.styles.fontStyle = "bold"
            }
          }
          // Style punch times column
          else if (data.column.index === 2 && data.cell.text[0] !== "-") {
            data.cell.styles.fillColor = [240, 248, 255]
            data.cell.styles.textColor = [50, 100, 150]
          }
        },
      })

      // Footer
      const finalY = Math.max((doc as any).lastAutoTable.finalY + 20, pageHeight - 25)
      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100, 100, 100)
      doc.text("Generated by Attendance Management System", pageWidth / 2, finalY, { align: "center" })

      // Legend
      doc.setFontSize(8)
      doc.setTextColor(80, 80, 80)
      const legendY = finalY - 10
      doc.text(
        "Note: Sundays are excluded from absence count. Only dates with attendance records are shown.",
        margin,
        legendY,
      )

      // Save PDF
      const fileName = `attendance-report-${monthName.replace(" ", "-")}-${new Date().toISOString().split("T")[0]}.pdf`
      doc.save(fileName)

      // Close dialog and reset
      setShowReportDialog(false)
      setSelectedStudentsForReport([])
      setStudentSearchQuery("")
    } catch (error) {
      console.error("Error generating attendance report:", error)
      alert("Failed to generate attendance report. Please try again.")
    } finally {
      setGeneratingReport(false)
    }
  }

  return (
    <>
      <Button
        onClick={() => setShowReportDialog(true)}
        variant="outline"
        className="w-full sm:w-auto border-[#A2BD9D] text-[#A2BD9D] hover:bg-[#A2BD9D] hover:text-white"
      >
        <FileText className="h-4 w-4 mr-2" />
        Export Report
      </Button>

      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#A2BD9D]">Generate Attendance Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select Students</Label>
              <Input
                placeholder="Search students..."
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                className="w-full border-[#A2BD9D]/30 focus:border-[#A2BD9D]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  {selectedStudentsForReport.length} of {filteredStudentsForReport.length} selected
                </span>
                <Button variant="outline" size="sm" onClick={handleSelectAllStudents} className="text-xs">
                  {selectedStudentsForReport.length === filteredStudentsForReport.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>

              <ScrollArea className="h-48 border rounded-md p-2">
                <div className="space-y-2">
                  {filteredStudentsForReport.map((student) => (
                    <div key={student.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`student-${student.id}`}
                        checked={selectedStudentsForReport.includes(student.student_id)}
                        onCheckedChange={() => handleStudentToggle(student.student_id)}
                      />
                      <Label htmlFor={`student-${student.id}`} className="text-sm cursor-pointer flex-1">
                        {student.name} ({student.student_id})
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-xs text-blue-800">
                <strong>Report will include:</strong>
                <br />• Summary with total absences (excluding Sundays)
                <br />• Detailed records for dates with attendance data
                <br />• Month:{" "}
                {selectedMonth &&
                  new Date(selectedMonth + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowReportDialog(false)
                setSelectedStudentsForReport([])
                setStudentSearchQuery("")
              }}
              disabled={generatingReport}
            >
              Cancel
            </Button>
            <Button
              onClick={generateAttendanceReport}
              disabled={selectedStudentsForReport.length === 0 || generatingReport}
              className="bg-[#A2BD9D] hover:bg-[#8FA889]"
            >
              {generatingReport ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generate PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

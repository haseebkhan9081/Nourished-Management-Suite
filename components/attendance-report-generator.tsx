"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileText, Download, Loader2, User, Users, Building2, Globe } from "lucide-react"

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

type Scope = "single" | "multi" | "class" | "all"

interface GenerateResponse {
  downloadUrl: string
  fileName: string
  expiresAt: string
  studentsIncluded: number
}

export function AttendanceReportGenerator({
  selectedSchoolId,
  selectedMonth,
  students,
}: AttendanceReportGeneratorProps) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<Scope>("class")
  const [monthInput, setMonthInput] = useState(selectedMonth || "")
  const [singleStudentId, setSingleStudentId] = useState<string>("")
  const [multiStudentIds, setMultiStudentIds] = useState<string[]>([])
  const [studentSearch, setStudentSearch] = useState("")
  const [selectedClass, setSelectedClass] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (open && selectedMonth && !monthInput) {
      setMonthInput(selectedMonth)
    }
  }, [open, selectedMonth, monthInput])

  const classes = useMemo(() => {
    const set = new Set<string>()
    for (const s of students) {
      if (s.class_department && s.class_department.trim().length > 0) {
        set.add(s.class_department)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [students])

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase()
    if (!q) return students
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.student_id.toLowerCase().includes(q),
    )
  }, [students, studentSearch])

  const resetState = () => {
    setScope("class")
    setSingleStudentId("")
    setMultiStudentIds([])
    setStudentSearch("")
    setSelectedClass("")
    setErrorMsg(null)
  }

  const handleClose = () => {
    if (submitting) return
    setOpen(false)
    setTimeout(resetState, 200)
  }

  const toggleMulti = (studentId: string) => {
    setMultiStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId],
    )
  }

  const toggleSelectAll = () => {
    if (multiStudentIds.length === filteredStudents.length) {
      setMultiStudentIds([])
    } else {
      setMultiStudentIds(filteredStudents.map((s) => s.student_id))
    }
  }

  const validate = (): string | null => {
    if (!selectedSchoolId) return "Please select a school first."
    if (!monthInput || !/^\d{4}-\d{2}$/.test(monthInput)) {
      return "Please pick a month."
    }
    if (scope === "single" && !singleStudentId) {
      return "Please pick a student."
    }
    if (scope === "multi" && multiStudentIds.length === 0) {
      return "Please pick at least one student."
    }
    if (scope === "class" && !selectedClass) {
      return "Please pick a class or department."
    }
    return null
  }

  const buildBody = () => {
    const base: Record<string, unknown> = {
      schoolId: selectedSchoolId,
      month: monthInput,
    }
    if (scope === "single") {
      return { ...base, scope: "students", studentIds: [singleStudentId] }
    }
    if (scope === "multi") {
      return { ...base, scope: "students", studentIds: multiStudentIds }
    }
    if (scope === "class") {
      return { ...base, scope: "class", classDepartment: selectedClass }
    }
    return { ...base, scope: "all" }
  }

  const submit = async () => {
    const validationError = validate()
    if (validationError) {
      setErrorMsg(validationError)
      return
    }

    setSubmitting(true)
    setErrorMsg(null)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/attendance/report/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody()),
        },
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          (data && (data.error as string)) || "Failed to generate report.",
        )
      }

      const { downloadUrl } = data as GenerateResponse
      if (!downloadUrl) {
        throw new Error("Backend did not return a download URL.")
      }

      window.location.href = downloadUrl

      setOpen(false)
      setTimeout(resetState, 200)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate report.")
    } finally {
      setSubmitting(false)
    }
  }

  const monthLabel = monthInput
    ? new Date(monthInput + "-01").toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "—"

  const scopeOptions: Array<{
    value: Scope
    label: string
    description: string
    icon: typeof User
  }> = [
    {
      value: "class",
      label: "By class or department",
      description: "Pick a class or staff department — includes everyone in that group.",
      icon: Building2,
    },
    {
      value: "single",
      label: "One student",
      description: "Generate a report for a specific student.",
      icon: User,
    },
    {
      value: "multi",
      label: "Multiple students",
      description: "Pick a custom set of students.",
      icon: Users,
    },
    {
      value: "all",
      label: "Whole school",
      description: "Every student at this school.",
      icon: Globe,
    },
  ]

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        className="w-full sm:w-auto border-[#A2BD9D] text-[#A2BD9D] hover:bg-[#A2BD9D] hover:text-white"
      >
        <FileText className="h-4 w-4 mr-2" />
        Export Report
      </Button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#A2BD9D]">
              Generate Attendance Report
            </DialogTitle>
            <p className="text-xs text-gray-500">
              Generates a PDF report. Sundays and holidays are excluded from absences.
            </p>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Month</Label>
              <Input
                type="month"
                value={monthInput}
                onChange={(e) => setMonthInput(e.target.value)}
                className="border-[#A2BD9D]/30 focus:border-[#A2BD9D]"
              />
              {monthInput && (
                <p className="text-xs text-gray-500">Report for {monthLabel}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Generate report for</Label>
              <RadioGroup
                value={scope}
                onValueChange={(v) => {
                  setScope(v as Scope)
                  setErrorMsg(null)
                }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              >
                {scopeOptions.map((opt) => {
                  const Icon = opt.icon
                  const checked = scope === opt.value
                  return (
                    <Label
                      key={opt.value}
                      htmlFor={`scope-${opt.value}`}
                      className={`flex items-start gap-2 p-3 rounded-md border cursor-pointer transition-colors ${
                        checked
                          ? "border-[#A2BD9D] bg-[#A2BD9D]/5"
                          : "border-gray-200 hover:border-[#A2BD9D]/50"
                      }`}
                    >
                      <RadioGroupItem
                        id={`scope-${opt.value}`}
                        value={opt.value}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                          <Icon className="h-3.5 w-3.5 text-[#A2BD9D]" />
                          {opt.label}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {opt.description}
                        </p>
                      </div>
                    </Label>
                  )
                })}
              </RadioGroup>
            </div>

            {scope === "single" && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Student</Label>
                <Select
                  value={singleStudentId}
                  onValueChange={setSingleStudentId}
                >
                  <SelectTrigger className="border-[#A2BD9D]/30 focus:border-[#A2BD9D]">
                    <SelectValue placeholder="Pick a student..." />
                  </SelectTrigger>
                  <SelectContent>
                    {students
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((s) => (
                        <SelectItem key={s.id} value={s.student_id}>
                          {s.name} ({s.student_id}) — {s.class_department || "No class"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scope === "multi" && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Students</Label>
                  <Input
                    placeholder="Search students..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="border-[#A2BD9D]/30 focus:border-[#A2BD9D]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">
                    {multiStudentIds.length} of {filteredStudents.length} selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAll}
                    className="text-xs h-7"
                  >
                    {multiStudentIds.length === filteredStudents.length &&
                    filteredStudents.length > 0
                      ? "Deselect all"
                      : "Select all"}
                  </Button>
                </div>
                <ScrollArea className="h-48 border rounded-md p-2">
                  <div className="space-y-1.5">
                    {filteredStudents.length === 0 ? (
                      <p className="text-xs text-gray-400 italic text-center py-4">
                        No students match your search.
                      </p>
                    ) : (
                      filteredStudents.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center space-x-2 px-1"
                        >
                          <Checkbox
                            id={`stu-${s.id}`}
                            checked={multiStudentIds.includes(s.student_id)}
                            onCheckedChange={() => toggleMulti(s.student_id)}
                          />
                          <Label
                            htmlFor={`stu-${s.id}`}
                            className="text-sm cursor-pointer flex-1 font-normal"
                          >
                            <span className="text-gray-800">{s.name}</span>
                            <span className="text-gray-400 text-xs ml-1.5">
                              {s.student_id}
                              {s.class_department && ` · ${s.class_department}`}
                            </span>
                          </Label>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {scope === "class" && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Class or department</Label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="border-[#A2BD9D]/30 focus:border-[#A2BD9D]">
                    <SelectValue placeholder="Pick a class or department..." />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-gray-500 italic">
                        No classes or departments found for this school.
                      </div>
                    ) : (
                      classes.map((c) => {
                        const count = students.filter(
                          (s) => s.class_department === c,
                        ).length
                        return (
                          <SelectItem key={c} value={c}>
                            {c} ({count} {count === 1 ? "person" : "people"})
                          </SelectItem>
                        )
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scope === "all" && (
              <div className="rounded-md bg-[#A2BD9D]/5 border border-[#A2BD9D]/30 p-3 text-xs text-gray-700">
                The report will include <strong>all {students.length} students</strong> at this school for {monthLabel}.
              </div>
            )}

            {errorMsg && (
              <p className="text-sm text-red-500">{errorMsg}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={submitting}
              className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white"
            >
              {submitting ? (
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

"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, X } from "lucide-react"
import { supabase, type Attendance, type Student } from "@/lib/supabase"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface AttendanceDataSectionProps {
  selectedSchoolId: number | null
}

export function AttendanceDataSection({ selectedSchoolId }: AttendanceDataSectionProps) {
  const [attendance, setAttendance] = useState<(Attendance & { students: Student })[]>([])
  const [loading, setLoading] = useState(false)
  const [editingPunchTime, setEditingPunchTime] = useState<{ attendanceId: number } | null>(null)
  const [newPunchTime, setNewPunchTime] = useState("")
  const [showNewAttendanceForm, setShowNewAttendanceForm] = useState(false)
  const [newAttendanceDate, setNewAttendanceDate] = useState("")
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [students, setStudents] = useState<Student[]>([])

  // Filter states
  const [singleDateFilter, setSingleDateFilter] = useState("")
  const [startDateFilter, setStartDateFilter] = useState("")
  const [endDateFilter, setEndDateFilter] = useState("")
  const [monthFilter, setMonthFilter] = useState("")

  useEffect(() => {
    if (selectedSchoolId) {
      fetchAttendance()
      fetchStudents()
    }
  }, [selectedSchoolId])

  const fetchAttendance = async () => {
    if (!selectedSchoolId) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("attendance")
        .select(`
          *,
          students!inner (*)
        `)
        .eq("students.school_id", selectedSchoolId)
        .order("date", { ascending: false })

      if (error) throw error
      setAttendance(data || [])
    } catch (error) {
      console.error("Error fetching attendance:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStudents = async () => {
    if (!selectedSchoolId) return

    try {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("school_id", selectedSchoolId)
        .order("name")

      if (error) throw error
      setStudents(data || [])
    } catch (error) {
      console.error("Error fetching students:", error)
    }
  }

  const addPunchTime = async (attendanceId: number) => {
    if (!newPunchTime) return

    try {
      // Get current punch times
      const currentRecord = attendance.find((a) => a.id === attendanceId)
      if (!currentRecord) return

      const updatedPunchTimes = [...(currentRecord.punch_times || []), newPunchTime]

      const { error } = await supabase
        .from("attendance")
        .update({ punch_times: updatedPunchTimes })
        .eq("id", attendanceId)

      if (error) throw error

      setNewPunchTime("")
      setEditingPunchTime(null)
      fetchAttendance()
    } catch (error) {
      console.error("Error adding punch time:", error)
    }
  }

  const removePunchTime = async (attendanceId: number, timeIndex: number) => {
    try {
      const currentRecord = attendance.find((a) => a.id === attendanceId)
      if (!currentRecord) return

      const updatedPunchTimes = currentRecord.punch_times.filter((_, index) => index !== timeIndex)

      const { error } = await supabase
        .from("attendance")
        .update({ punch_times: updatedPunchTimes })
        .eq("id", attendanceId)

      if (error) throw error
      fetchAttendance()
    } catch (error) {
      console.error("Error removing punch time:", error)
    }
  }

  const createNewAttendance = async () => {
    if (!selectedStudentId || !newAttendanceDate) return

    try {
      // Check if attendance already exists for this student and date
      const { data: existingAttendance, error: checkError } = await supabase
        .from("attendance")
        .select("id")
        .eq("student_id", selectedStudentId)
        .eq("date", newAttendanceDate)

      if (checkError) throw checkError

      if (existingAttendance && existingAttendance.length > 0) {
        alert(
          "An attendance entry already exists for this student on this date. Please choose a different date or student.",
        )
        return
      }

      const { error } = await supabase.from("attendance").insert({
        student_id: selectedStudentId,
        date: newAttendanceDate,
        punch_times: [],
      })

      if (error) throw error

      setNewAttendanceDate("")
      setSelectedStudentId(null)
      setShowNewAttendanceForm(false)
      fetchAttendance()
    } catch (error) {
      console.error("Error creating new attendance:", error)
    }
  }

  const deleteAttendance = async (attendanceId: number) => {
    if (!confirm("Are you sure you want to delete this attendance record?")) {
      return
    }

    try {
      const { error } = await supabase.from("attendance").delete().eq("id", attendanceId)

      if (error) throw error
      fetchAttendance()
    } catch (error) {
      console.error("Error deleting attendance:", error)
    }
  }

  const clearAllFilters = () => {
    setSingleDateFilter("")
    setStartDateFilter("")
    setEndDateFilter("")
    setMonthFilter("")
  }

  const filteredAttendance = attendance.filter((record) => {
    // Single date filter
    if (singleDateFilter) {
      return record.date === singleDateFilter
    }

    // Date range filter
    if (startDateFilter && endDateFilter) {
      return record.date >= startDateFilter && record.date <= endDateFilter
    }

    // Month filter
    if (monthFilter) {
      const recordMonth = new Date(record.date).toISOString().slice(0, 7)
      return recordMonth === monthFilter
    }

    return true
  })

  const hasActiveFilters = singleDateFilter || startDateFilter || endDateFilter || monthFilter

  if (!selectedSchoolId) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">Please select a school to view attendance data</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <CardTitle className="text-[#A2BD9D]">Attendance Data</CardTitle>
          <Button
            onClick={() => setShowNewAttendanceForm(true)}
            className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New Day
          </Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Single Date:</label>
            <Input
              type="date"
              value={singleDateFilter}
              onChange={(e) => {
                setSingleDateFilter(e.target.value)
                setStartDateFilter("")
                setEndDateFilter("")
                setMonthFilter("")
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Start Date:</label>
            <Input
              type="date"
              value={startDateFilter}
              onChange={(e) => {
                setStartDateFilter(e.target.value)
                setSingleDateFilter("")
                setMonthFilter("")
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">End Date:</label>
            <Input
              type="date"
              value={endDateFilter}
              onChange={(e) => {
                setEndDateFilter(e.target.value)
                setSingleDateFilter("")
                setMonthFilter("")
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Month/Year:</label>
            <Input
              type="month"
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value)
                setSingleDateFilter("")
                setStartDateFilter("")
                setEndDateFilter("")
              }}
              className="w-full"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={clearAllFilters} size="sm">
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {showNewAttendanceForm && (
          <Card className="mb-4 border-[#A2BD9D]">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-4">Add New Attendance Day</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Select
                  value={selectedStudentId?.toString() || ""}
                  onValueChange={(value) => setSelectedStudentId(Number.parseInt(value))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select student..." />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id.toString()}>
                        {student.name} ({student.student_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={newAttendanceDate}
                  onChange={(e) => setNewAttendanceDate(e.target.value)}
                  className="w-full"
                />
                <Button
                  onClick={createNewAttendance}
                  className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full"
                  disabled={!selectedStudentId || !newAttendanceDate}
                >
                  Create Attendance
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowNewAttendanceForm(false)
                    setNewAttendanceDate("")
                    setSelectedStudentId(null)
                  }}
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {loading ? (
          <div className="text-center py-8">Loading attendance...</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student ID</TableHead>
                  <TableHead>System ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Class/Department</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Punch Times</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAttendance.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.students.student_id}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{record.students.system_id}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{record.students.name}</TableCell>
                    <TableCell>{record.students.class_department}</TableCell>
                    <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {record.punch_times.map((time, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <Badge variant="outline" className="text-xs">
                              {time}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removePunchTime(record.id, index)}
                              className="h-6 w-6 p-0"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        {editingPunchTime?.attendanceId === record.id && (
                          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 mt-2">
                            <Input
                              type="time"
                              value={newPunchTime}
                              onChange={(e) => setNewPunchTime(e.target.value)}
                              className="w-full sm:w-32"
                            />
                            <Button
                              size="sm"
                              onClick={() => addPunchTime(record.id)}
                              className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                            >
                              Add
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingPunchTime(null)}
                              className="w-full sm:w-auto"
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2">
                        <Button
                          size="sm"
                          onClick={() => setEditingPunchTime({ attendanceId: record.id })}
                          className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteAttendance(record.id)}
                          className="w-full sm:w-auto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

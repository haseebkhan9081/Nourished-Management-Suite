"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2 } from "lucide-react"
import { supabase, type Attendance, type Student } from "@/lib/supabase"

interface AttendanceDataSectionProps {
  selectedSchoolId: number | null
}

export function AttendanceDataSection({ selectedSchoolId }: AttendanceDataSectionProps) {
  const [attendance, setAttendance] = useState<(Attendance & { students: Student })[]>([])
  const [loading, setLoading] = useState(false)
  const [editingPunchTime, setEditingPunchTime] = useState<{ attendanceId: number } | null>(null)
  const [newPunchTime, setNewPunchTime] = useState("")

  useEffect(() => {
    if (selectedSchoolId) {
      fetchAttendance()
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
        <CardTitle className="text-[#A2BD9D]">Attendance Data</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">Loading attendance...</div>
        ) : (
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
              {attendance.map((record) => (
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
                        <div className="flex items-center space-x-2 mt-2">
                          <Input
                            type="time"
                            value={newPunchTime}
                            onChange={(e) => setNewPunchTime(e.target.value)}
                            className="w-32"
                          />
                          <Button
                            size="sm"
                            onClick={() => addPunchTime(record.id)}
                            className="bg-[#A2BD9D] hover:bg-[#8FA889]"
                          >
                            Add
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingPunchTime(null)}>
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => setEditingPunchTime({ attendanceId: record.id })}
                      className="bg-[#A2BD9D] hover:bg-[#8FA889]"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

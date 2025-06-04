"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Trash2, X, FileSpreadsheet, Users, AlertCircle, Calendar, ChevronDown, Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react'
import type { Attendance, Student } from "@/lib/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSchoolPermissions } from "@/hooks/use-school-permissions"
import { ExcelUploadComponent } from "./excel-upload-component"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { AttendanceReportGenerator } from "@/components/attendance-report-generator"

interface AttendanceDataSectionProps {
  selectedSchoolId: number | null
}

interface ParsedExcelData {
  "AC-No": string
  Name: string
  Class: string
  Date: string
  Time: string
}

interface AttendanceResponse {
  data: (Attendance & { students: Student })[]
  pagination?: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
  summary?: {
    total: number
    present: number
    date: string
  }
}

type SortField = "date" | "name" | "class"
type SortOrder = "asc" | "desc"

export function AttendanceDataSection({ selectedSchoolId }: AttendanceDataSectionProps) {
  const { permissions, loading: loadingPermissions } = useSchoolPermissions(selectedSchoolId)
  const [attendance, setAttendance] = useState<(Attendance & { students: Student })[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editingPunchTime, setEditingPunchTime] = useState<{ attendanceId: number } | null>(null)
  const [newPunchTime, setNewPunchTime] = useState("")
  const [showNewAttendanceForm, setShowNewAttendanceForm] = useState(false)
  const [newAttendanceDate, setNewAttendanceDate] = useState("")
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [activeTab, setActiveTab] = useState("manual")
  const [error, setError] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(true)

  // Filter states
  const [selectedMonth, setSelectedMonth] = useState("")
  const [selectedDate, setSelectedDate] = useState("")
  const [viewMode, setViewMode] = useState<"month" | "date">("month")

  // Search and sort states
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortField>("date")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [showSystemId, setShowSystemId] = useState(false)

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [summary, setSummary] = useState<{ total: number; present: number; date: string } | null>(null)

  // Infinite scroll
  const observerRef = useRef<IntersectionObserver | null>(null)
  const lastElementRef = useRef<HTMLTableRowElement | null>(null)

  // Debounced search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (selectedSchoolId) {
      fetchStudents()
    }
  }, [selectedSchoolId])

  // Reset and fetch when filters change
  useEffect(() => {
    if (selectedSchoolId && hasValidFilter()) {
      resetAndFetch()
    } else {
      setAttendance([])
      setSummary(null)
    }
  }, [selectedSchoolId, selectedMonth, selectedDate, viewMode, sortBy, sortOrder])

  // Debounced search effect
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (selectedSchoolId && hasValidFilter()) {
        resetAndFetch()
      }
    }, 2000) // 2-second debounce (changed from 300ms)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery])

  // Set up infinite scroll observer
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && viewMode === "month") {
          loadMoreData()
        }
      },
      { threshold: 1.0 },
    )

    if (lastElementRef.current) {
      observerRef.current.observe(lastElementRef.current)
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect()
    }
  }, [hasMore, loadingMore, viewMode])

  const hasValidFilter = () => {
    if (viewMode === "month") {
      return selectedMonth && selectedMonth.trim() !== ""
    } else {
      return selectedDate && selectedDate.trim() !== ""
    }
  }

  const resetAndFetch = () => {
    setAttendance([])
    setCurrentPage(1)
    setHasMore(false)
    setSummary(null)
    fetchAttendance(1, true)
  }

  const fetchAttendance = async (page = 1, reset = false) => {
    if (!selectedSchoolId || !hasValidFilter()) return

    if (reset) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
    setError(null)

    try {
      const params = new URLSearchParams({
        school_id: selectedSchoolId.toString(),
        page: page.toString(),
        limit: "25",
        sortBy,
        sortOrder,
      })

      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim())
      }

      if (viewMode === "month" && selectedMonth) {
        params.append("month", selectedMonth)
      } else if (viewMode === "date" && selectedDate) {
        params.append("date", selectedDate)
      }

      const res = await fetch(`/api/attendance?${params.toString()}`)

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to fetch attendance")
      }

      const data: AttendanceResponse = await res.json()

      if (reset) {
        setAttendance(data.data || [])
      } else {
        setAttendance((prev) => [...prev, ...(data.data || [])])
      }

      if (data.pagination) {
        setHasMore(data.pagination.hasMore)
        setCurrentPage(data.pagination.page)
      } else {
        setHasMore(false)
      }

      if (data.summary) {
        setSummary(data.summary)
      }
    } catch (error) {
      console.error("Error fetching attendance:", error)
      setError(error instanceof Error ? error.message : "Failed to fetch attendance data")
      if (reset) {
        setAttendance([])
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const loadMoreData = useCallback(() => {
    if (!loadingMore && hasMore && viewMode === "month") {
      fetchAttendance(currentPage + 1, false)
    }
  }, [loadingMore, hasMore, currentPage, viewMode])

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortBy(field)
      setSortOrder(field === "date" ? "desc" : "asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="h-4 w-4 text-[#A2BD9D]" />
    ) : (
      <ArrowDown className="h-4 w-4 text-[#A2BD9D]" />
    )
  }

  const truncateSystemId = (systemId: string) => {
    if (systemId.length <= 8) return systemId
    return `${systemId.substring(0, 6)}...`
  }

  const fetchStudents = async () => {
    if (!selectedSchoolId) return

    try {
      const res = await fetch(`/api/students/${selectedSchoolId}`)
      if (!res.ok) throw new Error("Failed to fetch students")

      const data = await res.json()
      setStudents(data || [])
    } catch (error) {
      console.error("Error fetching students:", error)
    }
  }

  const addPunchTime = async (attendanceId: number) => {
    if (!newPunchTime) return

    try {
      const res = await fetch(`/api/attendance/${attendanceId}/punch`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPunchTime }),
      })

      if (!res.ok) throw new Error("Failed to add punch time")

      setNewPunchTime("")
      setEditingPunchTime(null)
      resetAndFetch()
    } catch (error) {
      console.error("Error adding punch time:", error)
    }
  }

  const removePunchTime = async (attendanceId: number, timeIndex: number) => {
    try {
      const res = await fetch(`/api/attendance/${attendanceId}/punch`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ timeIndex }),
      })

      if (!res.ok) throw new Error("Failed to remove punch time")

      resetAndFetch()
    } catch (error) {
      console.error("Error removing punch time:", error)
    }
  }

  const createNewAttendance = async () => {
    if (!selectedStudentId || !newAttendanceDate) return

    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          student_id: selectedStudentId,
          date: newAttendanceDate,
        }),
      })

      if (res.status === 409) {
        alert("An attendance entry already exists for this student on this date.")
        return
      }

      if (!res.ok) {
        throw new Error("Failed to create attendance")
      }

      setNewAttendanceDate("")
      setSelectedStudentId(null)
      setShowNewAttendanceForm(false)
      resetAndFetch()
    } catch (error) {
      console.error("Error creating new attendance:", error)
    }
  }

  const deleteAttendance = async (attendanceId: number) => {
    if (!confirm("Are you sure you want to delete this attendance record?")) {
      return
    }

    try {
      const res = await fetch(`/api/attendance/${attendanceId}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        throw new Error("Failed to delete attendance")
      }

      resetAndFetch()
    } catch (error) {
      console.error("Error deleting attendance:", error)
    }
  }

  const clearAllFilters = () => {
    setSelectedMonth("")
    setSelectedDate("")
    setSearchQuery("")
    setSortBy("date")
    setSortOrder("desc")
    setViewMode("month")
    setAttendance([])
    setSummary(null)
    setError(null)
    setCurrentPage(1)
    setHasMore(false)
  }

  const handleExcelDataCommitted = (data: ParsedExcelData[]) => {
    if (hasValidFilter()) {
      resetAndFetch()
    }
    setActiveTab("manual")
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

  if (loadingPermissions) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">Loading permissions...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[#A2BD9D]">Attendance Management</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Manual Entry
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Excel Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-6">
            {/* Header with Add Button */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-lg font-semibold text-gray-900">Attendance Records</h3>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {permissions.canCreate && (
                  <Button
                    onClick={() => setShowNewAttendanceForm(true)}
                    className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Day
                  </Button>
                )}
                {viewMode === "month" && selectedMonth && (
                  <AttendanceReportGenerator 
                    selectedSchoolId={selectedSchoolId} 
                    selectedMonth={selectedMonth} 
                    students={students}
                  />
                )}
              </div>
            </div>

            {/* Responsive Filter Section */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full sm:hidden flex items-center justify-between p-3 border-[#A2BD9D]/30"
                >
                  <span className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Filters & Search
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>

              <CollapsibleContent className="sm:block">
                <div className="mt-4 sm:mt-0 p-4 bg-gray-50 rounded-lg border space-y-4">
                  {/* View Mode Selector */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">View Mode:</label>
                    <div className="flex gap-2">
                      <Button
                        variant={viewMode === "month" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setViewMode("month")}
                        className={viewMode === "month" ? "bg-[#A2BD9D] hover:bg-[#8FA889]" : ""}
                      >
                        Monthly View
                      </Button>
                      <Button
                        variant={viewMode === "date" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setViewMode("date")}
                        className={viewMode === "date" ? "bg-[#A2BD9D] hover:bg-[#8FA889]" : ""}
                      >
                        Single Date
                      </Button>
                    </div>
                  </div>

                  {/* Filter Inputs */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {viewMode === "month" ? (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Select Month:</label>
                        <Input
                          type="month"
                          value={selectedMonth}
                          onChange={(e) => setSelectedMonth(e.target.value)}
                          className="w-full sm:w-44 h-9 text-sm border-gray-300 focus:border-[#A2BD9D] focus:ring-[#A2BD9D]"
                          placeholder="Select month..."
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Select Date:</label>
                        <Input
                          type="date"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          className="w-full sm:w-44 h-9 text-sm border-gray-300 focus:border-[#A2BD9D] focus:ring-[#A2BD9D]"
                          placeholder="Select date..."
                        />
                      </div>
                    )}

                    {/* Clear Button */}
                    {(selectedMonth || selectedDate) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearAllFilters}
                        className="h-9 px-3 text-xs flex items-center gap-1 whitespace-nowrap"
                      >
                        <X className="h-3 w-3" />
                        Clear All
                      </Button>
                    )}
                  </div>

                  {/* Search and Sort Controls */}
                  {hasValidFilter() && (
                    <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-gray-200">
                      {/* Search Bar */}
                      <div className="flex-1">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            type="text"
                            placeholder="Search by name, class, or student ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 text-sm border-gray-300 focus:border-[#A2BD9D] focus:ring-[#A2BD9D]"
                          />
                        </div>
                      </div>

                      {/* Sort Controls */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Select value={sortBy} onValueChange={(value: SortField) => setSortBy(value)}>
                          <SelectTrigger className="w-full sm:w-32 h-9 text-sm">
                            <SelectValue placeholder="Sort by" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="name">Name</SelectItem>
                            <SelectItem value="class">Class</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={sortOrder} onValueChange={(value: SortOrder) => setSortOrder(value)}>
                          <SelectTrigger className="w-full sm:w-24 h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="asc">A-Z</SelectItem>
                            <SelectItem value="desc">Z-A</SelectItem>
                          </SelectContent>
                        </Select>

                        {/* System ID Toggle */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowSystemId(!showSystemId)}
                          className="h-9 px-3 text-xs flex items-center gap-1 whitespace-nowrap"
                        >
                          {showSystemId ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          System ID
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Summary for Single Date View */}
            {summary && viewMode === "date" && (
              <Card className="border-[#A2BD9D]/30 bg-[#A2BD9D]/5">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-[#A2BD9D] text-lg">
                        Attendance Summary -{" "}
                        {new Date(summary.date).toLocaleDateString("en-US", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </h4>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-[#A2BD9D]">{summary.present}</div>
                        <div className="text-sm text-gray-600">Present</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-500">{summary.total}</div>
                        <div className="text-sm text-gray-600">Total Records</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Add New Attendance Form */}
            {showNewAttendanceForm && permissions.canCreate && (
              <Card className="border-[#A2BD9D]/30 shadow-sm">
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-4 text-[#A2BD9D]">Add New Attendance Day</h3>
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

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-800">Error Loading Data</h4>
                  <p className="text-red-700 text-sm mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Attendance Table */}
            {!hasValidFilter() ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-2">📅</div>
                <p className="text-gray-500 font-medium">Select a filter to view attendance records</p>
                <p className="text-gray-400 text-sm mt-2">
                  Choose either monthly view or single date view from the filters above
                </p>
              </div>
            ) : loading ? (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-2">⏳</div>
                <p className="text-gray-500">Loading attendance records...</p>
              </div>
            ) : attendance.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-2">📋</div>
                <p className="text-gray-500 font-medium">No attendance records found</p>
                <p className="text-gray-400 text-sm mt-2">
                  {searchQuery
                    ? "No records match your search criteria"
                    : "No attendance records found for the selected filter"}
                </p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#A2BD9D]/5">
                        <TableHead className="text-[#A2BD9D] font-semibold">Student ID</TableHead>
                        {showSystemId && <TableHead className="text-[#A2BD9D] font-semibold">System ID</TableHead>}
                        <TableHead className="text-[#A2BD9D] font-semibold">
                          <Button
                            variant="ghost"
                            className="h-auto p-0 font-semibold text-[#A2BD9D] hover:bg-transparent"
                            onClick={() => handleSort("name")}
                          >
                            <span className="flex items-center gap-1">
                              Name
                              {getSortIcon("name")}
                            </span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-[#A2BD9D] font-semibold">
                          <Button
                            variant="ghost"
                            className="h-auto p-0 font-semibold text-[#A2BD9D] hover:bg-transparent"
                            onClick={() => handleSort("class")}
                          >
                            <span className="flex items-center gap-1">
                              Class/Department
                              {getSortIcon("class")}
                            </span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-[#A2BD9D] font-semibold">
                          <Button
                            variant="ghost"
                            className="h-auto p-0 font-semibold text-[#A2BD9D] hover:bg-transparent"
                            onClick={() => handleSort("date")}
                          >
                            <span className="flex items-center gap-1">
                              Date
                              {getSortIcon("date")}
                            </span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-[#A2BD9D] font-semibold">Punch Times</TableHead>
                        {(permissions.canEdit || permissions.canDelete) && (
                          <TableHead className="text-[#A2BD9D] font-semibold">Actions</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendance.map((record, index) => (
                        <TableRow
                          key={record.id}
                          className="hover:bg-[#A2BD9D]/5"
                          ref={index === attendance.length - 1 ? lastElementRef : null}
                        >
                          <TableCell className="font-medium">{record.students.student_id}</TableCell>
                          {showSystemId && (
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className="bg-[#A2BD9D]/10 text-[#A2BD9D] font-mono text-xs"
                                title={record.students.system_id}
                              >
                                {truncateSystemId(record.students.system_id)}
                              </Badge>
                            </TableCell>
                          )}
                          <TableCell className="font-medium text-gray-800">{record.students.name}</TableCell>
                          <TableCell className="text-gray-600">{record.students.class_department}</TableCell>
                          <TableCell className="text-gray-600">{new Date(record.date).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {record.punch_times.length === 0 ? (
                                <Badge variant="outline" className="text-xs text-gray-400">
                                  No punches
                                </Badge>
                              ) : (
                                record.punch_times.map((time, timeIndex) => (
                                  <div key={timeIndex} className="flex items-center space-x-2">
                                    <Badge variant="outline" className="text-xs">
                                      {time}
                                    </Badge>
                                    {permissions.canDelete && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => removePunchTime(record.id, timeIndex)}
                                        className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                ))
                              )}
                              {editingPunchTime?.attendanceId === record.id && permissions.canEdit && (
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
                          {(permissions.canEdit || permissions.canDelete) && (
                            <TableCell>
                              <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2">
                                {permissions.canEdit && (
                                  <Button
                                    size="sm"
                                    onClick={() => setEditingPunchTime({ attendanceId: record.id })}
                                    className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                )}
                                {permissions.canDelete && (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => deleteAttendance(record.id)}
                                    className="w-full sm:w-auto"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Loading More Indicator */}
                {loadingMore && (
                  <div className="flex justify-center items-center py-4 border-t">
                    <Loader2 className="h-5 w-5 animate-spin text-[#A2BD9D] mr-2" />
                    <span className="text-sm text-gray-600">Loading more records...</span>
                  </div>
                )}

                {/* End of Results Indicator */}
                {viewMode === "month" && !hasMore && attendance.length > 0 && (
                  <div className="text-center py-4 border-t bg-gray-50">
                    <span className="text-sm text-gray-500">
                      All records loaded ({attendance.length} total)
                      {searchQuery && ` matching "${searchQuery}"`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="import" className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Bulk Import from Excel</h3>
                <p className="text-gray-600 text-sm">
                  Upload an Excel file containing attendance data to import multiple records at once. The system will
                  automatically process and validate the data before importing.
                </p>
              </div>

              {permissions.canCreate ? (
                <ExcelUploadComponent onDataCommitted={handleExcelDataCommitted} selectedSchoolId={selectedSchoolId} />
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <div className="text-gray-400 mb-2">🔒</div>
                    <p className="text-gray-500 font-medium">Access Denied</p>
                    <p className="text-gray-400 text-sm mt-2">
                      You don't have permission to import attendance data for this school.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
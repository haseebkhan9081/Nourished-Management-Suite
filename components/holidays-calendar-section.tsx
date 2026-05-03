"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Loader2,
  Trash2,
  X,
} from "lucide-react"

interface HolidaysCalendarSectionProps {
  selectedSchoolId: number | null
}

interface Holiday {
  id: number
  school_id: number | null
  date: string
  label: string | null
  created_at: string
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function ymd(year: number, month0: number, day: number): string {
  const m = String(month0 + 1).padStart(2, "0")
  const d = String(day).padStart(2, "0")
  return `${year}-${m}-${d}`
}

function todayYmd(): string {
  const t = new Date()
  return ymd(t.getFullYear(), t.getMonth(), t.getDate())
}

function expandRange(startISO: string, endISO: string): string[] {
  const dates: string[] = []
  const cur = new Date(startISO)
  const end = new Date(endISO)
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

export function HolidaysCalendarSection({ selectedSchoolId }: HolidaysCalendarSectionProps) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [globalMode, setGlobalMode] = useState(false)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [labelInput, setLabelInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [openHolidayId, setOpenHolidayId] = useState<number | null>(null)

  const monthRange = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    return {
      from: ymd(year, month, 1),
      to: ymd(year, month, lastDay.getDate()),
      firstWeekday: firstDay.getDay(),
      daysInMonth: lastDay.getDate(),
    }
  }, [year, month])

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday[]>()
    for (const h of holidays) {
      const list = map.get(h.date) ?? []
      list.push(h)
      map.set(h.date, list)
    }
    return map
  }, [holidays])

  const fetchHolidays = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const params = new URLSearchParams()
      if (selectedSchoolId != null) {
        params.set("school_id", String(selectedSchoolId))
      } else {
        params.set("school_id", "null")
      }
      params.set("from", monthRange.from)
      params.set("to", monthRange.to)

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/holidays?${params.toString()}`
      )
      if (!res.ok) throw new Error("Failed to load holidays")
      const data = await res.json()
      setHolidays(data.holidays ?? [])
    } catch (err) {
      console.error("Error fetching holidays:", err)
      setErrorMsg("Couldn't load holidays")
      setHolidays([])
    } finally {
      setLoading(false)
    }
  }, [selectedSchoolId, monthRange.from, monthRange.to])

  useEffect(() => {
    fetchHolidays()
  }, [fetchHolidays])

  const goPrev = () => {
    if (month === 0) {
      setMonth(11)
      setYear(y => y - 1)
    } else {
      setMonth(m => m - 1)
    }
    setSelected(new Set())
  }
  const goNext = () => {
    if (month === 11) {
      setMonth(0)
      setYear(y => y + 1)
    } else {
      setMonth(m => m + 1)
    }
    setSelected(new Set())
  }
  const goToday = () => {
    setYear(now.getFullYear())
    setMonth(now.getMonth())
    setSelected(new Set())
  }

  const toggleSelect = (date: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  const openAddDialog = () => {
    if (selected.size === 0) return
    setLabelInput("")
    setErrorMsg(null)
    setAddOpen(true)
  }

  const submitAdd = async () => {
    const dates = Array.from(selected).sort()
    if (dates.length === 0) return
    const trimmedLabel = labelInput.trim()
    const label = trimmedLabel.length > 0 ? trimmedLabel : null
    const schoolIdForBody = globalMode ? undefined : selectedSchoolId

    setSubmitting(true)
    setErrorMsg(null)
    try {
      if (dates.length === 1) {
        const body: Record<string, unknown> = { date: dates[0] }
        if (label !== null) body.label = label
        if (schoolIdForBody != null) body.school_id = schoolIdForBody

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/holidays`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Failed to add holiday")
      } else {
        const body: Record<string, unknown> = { dates }
        if (label !== null) body.label = label
        if (schoolIdForBody != null) body.school_id = schoolIdForBody

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/holidays/bulk`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Failed to add holidays")
      }

      setAddOpen(false)
      setSelected(new Set())
      await fetchHolidays()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add holiday")
    } finally {
      setSubmitting(false)
    }
  }

  const deleteHoliday = async (id: number) => {
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/holidays/${id}`,
        { method: "DELETE" }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to delete holiday")
      setOpenHolidayId(null)
      await fetchHolidays()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete holiday")
    } finally {
      setSubmitting(false)
    }
  }

  if (!selectedSchoolId && !globalMode) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <p className="text-gray-500">Please select a school to manage holidays</p>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Or turn on <span className="font-semibold">Global mode</span> below to add holidays that apply to <span className="font-semibold">every school</span> at once — like national holidays or federal closures.
          </p>
          <div className="flex justify-center items-center gap-2">
            <Switch checked={globalMode} onCheckedChange={setGlobalMode} />
            <span className="text-sm text-gray-700 flex items-center gap-1">
              <Globe className="h-4 w-4" /> Global mode
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const cells: Array<{ date: string | null; day: number | null }> = []
  for (let i = 0; i < monthRange.firstWeekday; i++) {
    cells.push({ date: null, day: null })
  }
  for (let d = 1; d <= monthRange.daysInMonth; d++) {
    cells.push({ date: ymd(year, month, d), day: d })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, day: null })
  }

  const today = todayYmd()

  return (
    <div className="relative space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-[#A2BD9D]">Holidays Calendar</CardTitle>
              <p className="text-xs text-gray-500 mt-1 max-w-xl">
                Mark dates as holidays so they're skipped from attendance averages and reports.
                {globalMode
                  ? " You're currently adding holidays that apply to every school."
                  : " New holidays you add here apply only to the selected school. Global holidays (e.g., national holidays) are also shown for context."}
              </p>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-1">
              <div className="flex items-center gap-2">
                <Globe className={`h-4 w-4 ${globalMode ? "text-amber-600" : "text-gray-400"}`} />
                <span className="text-sm text-gray-700">Global mode</span>
                <Switch checked={globalMode} onCheckedChange={setGlobalMode} />
              </div>
              <p className="text-[11px] text-gray-400">
                On = applies to every school. Off = only this school.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={goPrev} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-base font-semibold text-gray-800 min-w-[140px] text-center">
                {MONTHS[month]} {year}
              </div>
              <Button variant="outline" size="icon" onClick={goNext} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={goToday}>
              Today
            </Button>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded bg-[#A2BD9D]" />
              Per-school holiday
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded bg-amber-400" />
              Global holiday
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border-2 border-[#A2BD9D]" />
              Today
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-7 bg-[#A2BD9D]/5 border-b">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-[#A2BD9D] py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 relative">
              {loading && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
                  <Loader2 className="h-6 w-6 animate-spin text-[#A2BD9D]" />
                </div>
              )}
              {cells.map((cell, idx) => {
                if (cell.date === null) {
                  return <div key={idx} className="aspect-square border-b border-r bg-gray-50/50" />
                }
                const dayHolidays = holidaysByDate.get(cell.date) ?? []
                const isToday = cell.date === today
                const isSelected = selected.has(cell.date)
                const perSchool = dayHolidays.find(h => h.school_id !== null)
                const global = dayHolidays.find(h => h.school_id === null)
                const hasHoliday = dayHolidays.length > 0

                let bgClass = "bg-white hover:bg-[#A2BD9D]/5"
                let textClass = "text-gray-700"
                if (perSchool && global) {
                  bgClass = "bg-gradient-to-br from-[#A2BD9D] to-amber-400 hover:opacity-90"
                  textClass = "text-white font-semibold"
                } else if (perSchool) {
                  bgClass = "bg-[#A2BD9D] hover:bg-[#8FA889]"
                  textClass = "text-white font-semibold"
                } else if (global) {
                  bgClass = "bg-amber-400 hover:bg-amber-500"
                  textClass = "text-white font-semibold"
                }
                if (isSelected) {
                  bgClass = "bg-[#A2BD9D]/30 hover:bg-[#A2BD9D]/40 ring-2 ring-[#A2BD9D] ring-inset"
                  textClass = "text-[#5a6f57] font-semibold"
                }

                const cellInner = (
                  <div
                    className={`relative aspect-square border-b border-r p-1 cursor-pointer transition-colors ${bgClass} ${
                      isToday ? "ring-2 ring-[#A2BD9D] ring-inset" : ""
                    }`}
                    onClick={() => {
                      if (hasHoliday) return
                      toggleSelect(cell.date!)
                    }}
                    title={dayHolidays.map(h => h.label || "Holiday").join(" / ")}
                  >
                    <div className={`text-sm ${textClass}`}>{cell.day}</div>
                    {global && (
                      <Globe className="absolute bottom-1 right-1 h-3 w-3 text-white/90" />
                    )}
                    {dayHolidays[0]?.label && (
                      <div className="absolute bottom-1 left-1 text-[10px] text-white/95 truncate max-w-[80%] hidden sm:block">
                        {dayHolidays[0].label}
                      </div>
                    )}
                  </div>
                )

                if (!hasHoliday) {
                  return <div key={cell.date}>{cellInner}</div>
                }

                const popoverHoliday = perSchool ?? global!
                return (
                  <Popover
                    key={cell.date}
                    open={openHolidayId === popoverHoliday.id}
                    onOpenChange={open => setOpenHolidayId(open ? popoverHoliday.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <div onClick={() => setOpenHolidayId(popoverHoliday.id)}>
                        {cellInner}
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 space-y-3">
                      <div className="text-sm font-semibold text-gray-800">{cell.date}</div>
                      {dayHolidays.map(h => (
                        <div key={h.id} className="flex items-start justify-between gap-2 border-t pt-2 first:border-t-0 first:pt-0">
                          <div className="min-w-0">
                            <div className="text-sm text-gray-800 truncate">
                              {h.label || <span className="italic text-gray-500">No label</span>}
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                h.school_id === null
                                  ? "mt-1 bg-amber-50 text-amber-700 border-amber-300"
                                  : "mt-1 bg-[#A2BD9D]/10 text-[#5a6f57] border-[#A2BD9D]/40"
                              }
                            >
                              {h.school_id === null ? (
                                <><Globe className="h-3 w-3 mr-1" /> Global</>
                              ) : (
                                "Per-school"
                              )}
                            </Badge>
                          </div>
                          {(h.school_id !== null || globalMode) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7"
                              onClick={() => deleteHoliday(h.id)}
                              disabled={submitting}
                              title="Delete holiday"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </PopoverContent>
                  </Popover>
                )
              })}
            </div>
          </div>

          {errorMsg && !addOpen && (
            <p className="text-sm text-red-500">{errorMsg}</p>
          )}
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 flex justify-center">
          <div className="bg-white border border-[#A2BD9D]/40 shadow-lg rounded-full px-4 py-2 flex items-center gap-3">
            <span className="text-sm text-gray-700">
              <span className="font-semibold text-[#A2BD9D]">{selected.size}</span> date{selected.size === 1 ? "" : "s"} selected
            </span>
            <Button
              size="sm"
              className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white"
              onClick={openAddDialog}
            >
              Add holiday
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={clearSelection}
              title="Clear selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add {selected.size === 1 ? "holiday" : `${selected.size} holidays`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Label (optional)</label>
              <Input
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                placeholder="e.g. Spring Break, Eid, Independence Day"
                className="mt-1"
              />
            </div>
            <div className="text-xs text-gray-500 bg-gray-50 rounded p-2 max-h-32 overflow-y-auto">
              <div className="font-semibold mb-1">Dates:</div>
              {Array.from(selected).sort().join(", ")}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                {globalMode ? (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                    <Globe className="h-3 w-3 mr-1" /> Global — all schools
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-[#A2BD9D]/10 text-[#5a6f57] border-[#A2BD9D]/40">
                    Per-school (school #{selectedSchoolId})
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-gray-500">
                {globalMode
                  ? "This holiday will appear on every school's calendar and be skipped from their attendance calculations."
                  : "This holiday will only affect the currently selected school."}
              </p>
            </div>
            {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white"
              onClick={submitAdd}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

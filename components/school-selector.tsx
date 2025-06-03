"use client"

import { useState, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase, type School } from "@/lib/supabase"

interface SchoolSelectorProps {
  selectedSchoolId: number | null
  onSchoolChange: (schoolId: number) => void
}

export function SchoolSelector({ selectedSchoolId, onSchoolChange }: SchoolSelectorProps) {
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSchools()
  }, [])

  const fetchSchools = async () => {
    try {
      const { data, error } = await supabase.from("schools").select("*").order("name")

      if (error) throw error
      setSchools(data || [])

      // Auto-select first school if none selected
      if (!selectedSchoolId && data && data.length > 0) {
        onSchoolChange(data[0].id)
      }
    } catch (error) {
      console.error("Error fetching schools:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-xs">
      <Select
        value={selectedSchoolId?.toString() || ""}
        onValueChange={(value) => onSchoolChange(Number.parseInt(value))}
        disabled={loading}
      >
        <SelectTrigger className="border-[#A2BD9D] focus:ring-[#A2BD9D]">
          <SelectValue placeholder="Select a school..." />
        </SelectTrigger>
        <SelectContent>
          {schools.map((school) => (
            <SelectItem key={school.id} value={school.id.toString()}>
              {school.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

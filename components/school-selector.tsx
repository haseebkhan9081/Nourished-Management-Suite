"use client"

import { useState, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase, type School } from "@/lib/supabase"
import { useUser } from "@clerk/nextjs"

interface SchoolSelectorProps {
  selectedSchoolId: number | null
  onSchoolChange: (schoolId: number) => void
}

export function SchoolSelector({ selectedSchoolId, onSchoolChange }: SchoolSelectorProps) {
  const { user } = useUser()
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      fetchUserSchools()
    }
  }, [user])

  const fetchUserSchools = async () => {
    if (!user?.id) return

    try {
      // Fetch schools that the user has access to
      const { data: accessData, error } = await supabase
        .from("school_access")
        .select(`
          school_id,
          role,
          schools (*)
        `)
        .eq("user_id", user.id)
        .order("schools(name)")

      if (error) throw error

      const userSchools = accessData?.map((access: any) => access.schools).filter(Boolean) || []
      setSchools(userSchools)

      // Auto-select first school if none selected
      if (!selectedSchoolId && userSchools.length > 0) {
        onSchoolChange(userSchools[0].id)
      }
    } catch (error) {
      console.error("Error fetching user schools:", error)
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

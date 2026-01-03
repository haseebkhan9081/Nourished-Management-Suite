"use client"

import { useState, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase, type School } from "@/lib/supabase"
import { useUser } from "@clerk/nextjs"
import { useSession } from "next-auth/react"

interface SchoolSelectorProps {
  selectedSchoolId: number | null
  onSchoolChange: (schoolId: number) => void
  setSelectedSchoolName:(schoolname: string) => void
}

export function SchoolSelector({ selectedSchoolId, onSchoolChange,setSelectedSchoolName }: SchoolSelectorProps) {
  const { data: session, status } = useSession()
  const userId = session?.user?.email 
  const user = session?.user
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      fetchUserSchools()
    }
  }, [user])

 const fetchUserSchools = async () => {
  if (!userId) return

  setLoading(true)
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/user-schools?userId=${userId}`)
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Failed to fetch user schools")
    }
    const { accessData, allAccessData } = await res.json()

    const userSchools = accessData.map((access: any) => access.school).filter(Boolean)
    setSchools(userSchools)

    if (!selectedSchoolId && userSchools.length > 0) {
      onSchoolChange(userSchools[0].id)
      setSelectedSchoolName(userSchools[0].name)
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
        onValueChange={(value) =>{ onSchoolChange(Number.parseInt(value))
        
        }
        }
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

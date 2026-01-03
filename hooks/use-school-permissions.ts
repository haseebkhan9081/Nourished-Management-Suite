"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import {
  getUserRoleForSchool,
  getSchoolPermissions,
  type Role,
  type UserPermissions,
} from "@/lib/permissions"

export function useSchoolPermissions(schoolId: number | null) {
  const { data: session, status } = useSession()
  const userId = session?.user?.email // or some unique id, depending on your backend
  const [role, setRole] = useState<Role>("viewer")
  const [permissions, setPermissions] = useState<UserPermissions>(getSchoolPermissions("viewer"))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!userId || !schoolId) {
        setRole("viewer")
        setPermissions(getSchoolPermissions("viewer"))
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        // Use email or another identifier your backend expects
        const userRole = await getUserRoleForSchool(userId, schoolId)
        setRole(userRole)
        setPermissions(getSchoolPermissions(userRole))
      } catch (error) {
        console.error("Error fetching user role:", error)
        setRole("viewer")
        setPermissions(getSchoolPermissions("viewer"))
      } finally {
        setLoading(false)
      }
    }

    fetchUserRole()
  }, [userId, schoolId])

  return { role, permissions, loading }
}

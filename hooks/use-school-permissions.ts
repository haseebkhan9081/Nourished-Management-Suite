"use client"

import { useState, useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { getUserRoleForSchool, getSchoolPermissions, type Role, type UserPermissions } from "@/lib/permissions"

export function useSchoolPermissions(schoolId: number | null) {
  const { user } = useUser()
  const [role, setRole] = useState<Role>("viewer")
  const [permissions, setPermissions] = useState<UserPermissions>(getSchoolPermissions("viewer"))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user?.id || !schoolId) {
        setRole("viewer")
        setPermissions(getSchoolPermissions("viewer"))
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const userRole = await getUserRoleForSchool(user.id, schoolId)
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
  }, [user, schoolId])

  return { role, permissions, loading }
}

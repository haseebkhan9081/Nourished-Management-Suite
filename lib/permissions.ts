import { supabase } from "./supabase"

// Role hierarchy (higher index = more permissions)
const ROLE_HIERARCHY = ["viewer", "editor", "admin"]

export type Role = "admin" | "editor" | "viewer"

export interface UserPermissions {
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  canManageAccess: boolean
  canViewData: boolean
}

export const getRolePermissions = (role: Role): UserPermissions => {
  switch (role) {
    case "admin":
      return {
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canManageAccess: true,
        canViewData: true,
      }
    case "editor":
      return {
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canManageAccess: false,
        canViewData: true,
      }
    case "viewer":
    default:
      return {
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canManageAccess: false,
        canViewData: true,
      }
  }
}

export const getUserRoleForSchool = async (userId: string, schoolId: number): Promise<Role> => {
  if (!userId || !schoolId) return "viewer"

  try {
    const { data, error } = await supabase
      .from("school_access")
      .select("role")
      .eq("user_id", userId)
      .eq("school_id", schoolId)
      .single()

    if (error || !data) return "viewer"
    return data.role as Role
  } catch (error) {
    console.error("Error getting user role:", error)
    return "viewer"
  }
}

export const hasPermission = (userRole: Role, requiredRole: Role): boolean => {
  const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole)
  const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole)
  return userRoleIndex >= requiredRoleIndex
}

export const getSchoolPermissions = (userRole: Role): UserPermissions => {
  return getRolePermissions(userRole)
}

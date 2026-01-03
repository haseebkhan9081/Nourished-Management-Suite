"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Users, UserPlus } from "lucide-react"
import type { School, SchoolAccess } from "@/lib/supabase"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { Role } from "@/lib/permissions"
import { useSession } from "next-auth/react"

interface User {
  email: string
  name: string | null
  image_url: string | null
  provider: string | null
  provider_id: string | null
  created_at: string // ISO timestamp
  updated_at: string // ISO timestamp
}


export function SchoolManagementSection() {
  const { data: session, status } = useSession()
  const user = session?.user
  const userId = session?.user?.email
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateSchoolForm, setShowCreateSchoolForm] = useState(false)
  const [newSchool, setNewSchool] = useState({ name: "", address: "" })
  const [showAccessForm, setShowAccessForm] = useState<number | null>(null)
  const [newAccess, setNewAccess] = useState({ user_id: "", role: "viewer" as Role })
  const [schoolAccess, setSchoolAccess] = useState<{ [schoolId: number]: SchoolAccess[] }>({})
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  useEffect(() => {
    if (user) {
      fetchUserSchools()
      fetchUsers()

    }
  }, [user])

  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch( `${process.env.NEXT_PUBLIC_API_BASE_URL}/user`)
      if (!res.ok) throw new Error("Failed to fetch")
      const users = await res.json()
      setUsers(users?.users)
    } catch (error) {
      console.error("Error fetching Clerk users:", error)
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchUserSchools = async () => {
    if (!userId) return

    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/user-schools?userId=${userId}`)
      if (!res.ok) throw new Error("Failed to fetch user schools")

      const { accessData, allAccessData } = await res.json()

      const userSchools = accessData.map((access: any) => access.school).filter(Boolean) || []

      setSchools(userSchools)

      // Group access by school_id
      const accessBySchool: { [schoolId: number]: SchoolAccess[] } = {}
      allAccessData.forEach((access: any) => {
        if (!accessBySchool[access.school_id]) {
          accessBySchool[access.school_id] = []
        }
        accessBySchool[access.school_id].push(access)
      })

      setSchoolAccess(accessBySchool)
    } catch (error) {
      console.error("Error fetching user schools:", error)
    } finally {
      setLoading(false)
    }
  }

  const createSchool = async () => {
    if (!userId || !newSchool.name) return

    try {
     const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/schools/create`, {

        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newSchool.name,
          address: newSchool.address,
          user_id: userId,
        }),
      })

      if (!res.ok) throw new Error("Failed to create school")

      setNewSchool({ name: "", address: "" })
      setShowCreateSchoolForm(false)
      fetchUserSchools()
    } catch (error) {
      console.error("Error creating school:", error)
      alert("Failed to create school. Please try again.")
    }
  }

  const addUserAccess = async (schoolId: number) => {
    if (!newAccess.user_id || !newAccess.role) return

    try {
     const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/access/add`, {

        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          school_id: schoolId,
          user_id: newAccess.user_id,
          role: newAccess.role,
        }),
      })

      if (!res.ok) throw new Error("Request failed")

      setNewAccess({ user_id: "", role: "viewer" })
      setShowAccessForm(null)
      fetchUserSchools()
    } catch (error) {
      console.error("Error adding user access:", error)
      alert("Failed to add user access. Please check the user ID and try again.")
    }
  }

  const removeUserAccess = async (accessId: number) => {
    if (!confirm("Are you sure you want to remove this user's access?")) {
      return
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/access/remove?id=${accessId}`, {

        method: "DELETE",
      })

      if (!res.ok) throw new Error("Request failed")

      fetchUserSchools()
    } catch (error) {
      console.error("Error removing user access:", error)
      alert("Failed to remove user access. Please try again.")
    }
  }

  const deleteSchool = async (schoolId: number, schoolName: string) => {
    if (
      !confirm(
        `Are you sure you want to delete "${schoolName}"? This action cannot be undone and will remove all associated data.`,
      )
    ) {
      return
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/schools/delete?id=${schoolId}`, {
        method: "DELETE",
      })

      if (!res.ok) throw new Error("Failed to delete school")

      fetchUserSchools()
      alert("School deleted successfully")
    } catch (error) {
      console.error("Error deleting school:", error)
      alert("Failed to delete school. Please try again.")
    }
  }

  const getUserRole = (schoolId: number) => {
    const access = schoolAccess[schoolId]?.find((a) => a.user_id === user?.email)
    return access?.role || "viewer"
  }

  const canManageAccess = (schoolId: number) => {
    return getUserRole(schoolId) === "admin"
  }

  const getUserDisplayName = (userId: string) => {
    const userInfo = users?.find((u) => u.email === userId)
    if (userInfo) {
     return userInfo.name
    }
    return userId.substring(0, 12) + "..."
  }

  const getUserEmail = (userId: string) => {
    const userInfo = users?.find((u) => u.email === userId)
    return userInfo?.email || "No email"
  }

  const getUserAvatar = (userId: string) => {
    const userInfo = users?.find((u) => u.email === userId)
    return userInfo?.image_url || ""
  }

  const getUserInitials = (userId: string) => {
    const userInfo = users?.find((u) => u.email === userId)
    if (userInfo?.name) {
      return `${userInfo.name[0]}`.toUpperCase()
    } else if (userInfo?.name) {
      return userInfo.name[0].toUpperCase()
    } else if (userInfo?.email) {
      return userInfo.email[0].toUpperCase()
    }
    return "U"
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <CardTitle className="text-[#A2BD9D]">School Management</CardTitle>
          <Button
            onClick={() => setShowCreateSchoolForm(true)}
            className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New School
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showCreateSchoolForm && (
          <Card className="mb-6 border-[#A2BD9D]">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-4">Create New School</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  placeholder="School name"
                  value={newSchool.name}
                  onChange={(e) => setNewSchool({ ...newSchool, name: e.target.value })}
                  className="w-full"
                />
                <Input
                  placeholder="Address"
                  value={newSchool.address}
                  onChange={(e) => setNewSchool({ ...newSchool, address: e.target.value })}
                  className="w-full"
                />
              </div>
              <div className="flex space-x-2 mt-4">
                <Button
                  onClick={createSchool}
                  className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                  disabled={!newSchool.name}
                >
                  Create School
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateSchoolForm(false)
                    setNewSchool({ name: "", address: "" })
                  }}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="text-center py-8">Loading schools...</div>
        ) : schools.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No schools found</p>
            <p className="text-sm text-gray-400 mt-2">Create a new school to get started</p>
          </div>
        ) : (
          <div className="space-y-6">
            {schools.map((school) => (
              <Card key={school.id} className="border">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{school.name}</h3>
                      <p className="text-gray-600">{school.address}</p>
                      <Badge variant="outline" className="mt-1">
                        Your Role: {getUserRole(school.id)}
                      </Badge>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      {canManageAccess(school.id) && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => setShowAccessForm(school.id)}
                            className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                          >
                            <Users className="h-4 w-4 mr-2" />
                            Manage Access
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteSchool(school.id, school.name)}
                            className="w-full sm:w-auto"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete School
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {showAccessForm === school.id && (
                    <Card className="mb-4 border-[#A2BD9D]">
                      <CardContent className="p-4">
                        <h4 className="font-semibold mb-4">Add User Access</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <Select
                            value={newAccess.user_id}
                            onValueChange={(value) => setNewAccess({ ...newAccess, user_id: value })}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select user..." />
                            </SelectTrigger>
                            <SelectContent>
                              {loadingUsers ? (
                                <div className="p-2 text-center">Loading users...</div>
                              ) : users.length === 0 ? (
                                <div className="p-2 text-center">No users found</div>
                              ) : (
                                users.map((user) => (
                                  <SelectItem key={user.email} value={user.email}>
                                    <div className="flex items-center gap-2">
                                      <Avatar className="h-6 w-6">
                                        <AvatarImage src={user.image_url || "/placeholder.svg"} />
                                        <AvatarFallback>
                                          {user.name?.[0] || user.email?.[0] || "U"}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span>
                                        {user.name  
                                          ? `${user.name}`
                                          : user.email || user.email.substring(0, 8)}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <Select
                            value={newAccess.role}
                            onValueChange={(value) => setNewAccess({ ...newAccess, role: value as Role })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="flex space-x-2">
                            <Button
                              onClick={() => addUserAccess(school.id)}
                              className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                              disabled={!newAccess.user_id}
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              Add
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setShowAccessForm(null)
                                setNewAccess({ user_id: "", role: "viewer" })
                              }}
                              className="w-full sm:w-auto"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {schoolAccess[school.id] && schoolAccess[school.id].length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">User Access</h4>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>User</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Role</TableHead>
                              {canManageAccess(school.id) && <TableHead>Actions</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {schoolAccess[school.id].map((access) => (
                              <TableRow key={access.id}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src={getUserAvatar(access.user_id) || "/placeholder.svg"} />
                                      <AvatarFallback>{getUserInitials(access.user_id)}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium">{getUserDisplayName(access.user_id)}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-gray-600">{getUserEmail(access.user_id)}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      access.role === "admin"
                                        ? "default"
                                        : access.role === "editor"
                                          ? "secondary"
                                          : "outline"
                                    }
                                    className={
                                      access.role === "admin"
                                        ? "bg-[#A2BD9D] hover:bg-[#8FA889]"
                                        : access.role === "editor"
                                          ? "bg-gray-200"
                                          : ""
                                    }
                                  >
                                    {access.role}
                                  </Badge>
                                </TableCell>
                                {canManageAccess(school.id) && (
                                  <TableCell>
                                    {access.user_id !== user?.email && (
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => removeUserAccess(access.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

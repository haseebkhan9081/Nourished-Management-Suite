"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2, Plus, Trash2 } from "lucide-react"

type Role = "viewer" | "editor" | "admin"

interface UserAccess {
  email: string
  name: string | null
 image_url: string | null
  role: Role
}

interface Props {
  open: boolean
  onClose: () => void
}

export function ManageAccessModal({ open, onClose }: Props) {
  const { data: session } = useSession()
  const currentUserEmail = session?.user?.email

  const [users, setUsers] = useState<UserAccess[]>([])
  const [allUsers, setAllUsers] = useState<UserAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // Add user state
  const [adding, setAdding] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState<string | null>(null)
  const [newRole, setNewRole] = useState<Role>("viewer")
  const [addingLoading, setAddingLoading] = useState(false)

  /* ---------------- Fetch page users ---------------- */
  useEffect(() => {
    if (!open) return

    setLoading(true)
    fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/user/permissions/page?page=payment_insights`
    )
      .then(res => res.json())
      .then(data => setUsers(data.users))
      .finally(() => setLoading(false))
  }, [open])

  /* ---------------- Helpers ---------------- */
  const getInitials = (name?: string | null, email?: string) => {
    if (name) {
      return name
        .split(" ")
        .map(n => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    }
    return email?.slice(0, 2).toUpperCase() || "U"
  }

  /* ---------------- Update role ---------------- */
  const updateRole = async (email: string, role: Role) => {
    setSaving(email)

    await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/user/permissions/page/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: "payment_insights",
        email: email,
        role: role,
      }),
    })

    setUsers(prev =>
      prev.map(u => (u.email === email ? { ...u, role } : u))
    )

    setSaving(null)
  }

  /* ---------------- Start add user ---------------- */
  const startAddUser = async () => {
    setAdding(true)

    if (allUsers.length === 0) {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/user`
      )
      const data = await res.json()
      setAllUsers(data.users)
    }
  }

  /* ---------------- Save new user ---------------- */
  const addUser = async () => {
    if (!newUserEmail) return

    setAddingLoading(true)

    await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/user/permissions/page/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: "payment_insights",
        email: newUserEmail,
        role: newRole,
      }),
    })

    const added = allUsers.find(u => u.email === newUserEmail)
    if (added) {
      setUsers(prev => [...prev, { ...added, role: newRole }])
    }

    setAdding(false)
    setNewUserEmail(null)
    setNewRole("viewer")
    setAddingLoading(false)
  }
const removeUser = async (email: string) => {
  try {
    // Optional: show some loading state for this user
    setSaving(email)

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/user/permissions/page/remove`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "payment_insights", // or pass dynamically
          email,
        }),
      }
    )

    if (!res.ok) throw new Error("Failed to remove user")

    // Update the local state to remove the user from the list
    setUsers(prev => prev.filter(u => u.email !== email))

    setSaving(null)
  } catch (error) {
    console.error("❌ Error removing user:", error)
    setSaving(null)
  }
}

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-gray-50">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-gray-900">
            Manage Access
          </DialogTitle>
          <p className="text-sm text-gray-600">
            Control who can view or manage Payment Insights
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-14">
            <Loader2 className="h-7 w-7 animate-spin text-[#A2BD9D]" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Existing users */}
            {users.map(user => {
              const isSelf = user.email === currentUserEmail
              const isSelfAdmin = isSelf && user.role === "admin"

              return (
                <div
                  key={user.email}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg bg-white px-4 py-3 border shadow-sm"
                >
                  {/* User info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user.image_url || undefined} />
                      <AvatarFallback>
                        {getInitials(user.name, user.email)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {user.name || user.email}
                        {isSelf && (
                          <span className="ml-2 text-xs text-gray-500">
                            (You)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2">
                    <Select
                      value={user.role}
                      disabled={isSelfAdmin}
                      onValueChange={(value: Role) =>
                        updateRole(user.email, value)
                      }
                    >
                      <SelectTrigger className="w-32 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>

                    {saving === user.email && (
                      <Loader2 className="h-4 w-4 animate-spin text-[#A2BD9D]" />
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isSelfAdmin}
                      className="text-red-500 hover:bg-red-50 disabled:opacity-40"
                     onClick={() => removeUser(user.email)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              )
            })}

            {/* Add user row */}
            {adding && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-lg bg-white px-4 py-3 border border-dashed">
                <Select
                  value={newUserEmail ?? ""}
                  onValueChange={setNewUserEmail}
                >
                  <SelectTrigger className="w-full sm:w-64 h-9">
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers
                      .filter(u => !users.some(x => x.email === u.email))
                      .map(user => (
                        <SelectItem key={user.email} value={user.email}>
                            <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user.image_url || undefined} />
                      <AvatarFallback>
                        {getInitials(user.name, user.email)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {user.name || user.email}

                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <Select value={newRole} onValueChange={(value:string) => setNewRole(value as Role)}>
                  <SelectTrigger className="w-32 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!newUserEmail || addingLoading}
                    onClick={addUser}
                    className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white"
                  >
                    {addingLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAdding(false)
                      setNewUserEmail(null)
                      setNewRole("viewer")
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Add user button */}
            {!adding && (
              <Button
                variant="outline"
                className="w-full flex items-center gap-2 mt-4"
                onClick={startAddUser}
              >
                <Plus size={16} />
                Add User
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

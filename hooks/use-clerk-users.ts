"use client"

import { useState, useEffect } from "react"
import { useUser } from "@clerk/nextjs"

export interface ClerkUser {
  id: string
  firstName?: string | null
  lastName?: string | null
  email?: string
  imageUrl?: string
}

export function useClerkUsers() {
  const { user: currentUser } = useUser()
  const [users, setUsers] = useState<ClerkUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUsers = async () => {
      if (!currentUser) return

      setLoading(true)
      setError(null)

      try {
        // In a real app, this would be a server action or API route
        // that calls Clerk's API to get all users
        // For now, we'll simulate with just the current user
        const mockUsers: ClerkUser[] = [
          {
            id: currentUser.id,
            firstName: currentUser.firstName,
            lastName: currentUser.lastName,
            email: currentUser.emailAddresses[0]?.emailAddress,
            imageUrl: currentUser.imageUrl,
          },
        ]

        // In a production app, you would fetch all users from Clerk API
        // This would require a server action or API route

        setUsers(mockUsers)
      } catch (err) {
        console.error("Error fetching users:", err)
        setError("Failed to load users")
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [currentUser])

  return { users, loading, error }
}

"use server"

import { clerkClient } from "@clerk/nextjs/server"

export async function getClerkUsers() {
  try {
    const users = await clerkClient.users.getUserList({
      limit: 100,
      orderBy: "-created_at",
    })

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.emailAddresses[0]?.emailAddress,
      imageUrl: user.imageUrl,
      createdAt: user.createdAt,
    }))
  } catch (error) {
    console.error("Error fetching Clerk users:", error)
    throw new Error("Failed to fetch users")
  }
}

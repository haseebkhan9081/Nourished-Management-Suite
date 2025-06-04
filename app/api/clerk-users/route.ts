import { NextRequest, NextResponse } from 'next/server'
import { createClerkClient } from '@clerk/backend'

// Log whether the secret key is defined
console.log("CLERK_SECRET_KEY exists:", !!process.env.CLERK_SECRET_KEY)

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
const clerk = clerkClient

export async function GET(request: NextRequest) {
  console.log("GET /api/clerk-users triggered")

  try {
    console.log("Fetching Clerk user list...")

    const { data: users, totalCount } = await clerk.users.getUserList({
      limit: 100,
      orderBy: "-created_at",
    })

    console.log(`Fetched ${users.length} users`)
    console.log("Total count from Clerk:", totalCount)

    const sanitizedUsers = users.map(user => {
      const userData = {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.emailAddresses[0]?.emailAddress,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
      }

      console.log("Sanitized user:", userData)
      return userData
    })

    return NextResponse.json({ totalCount, users: sanitizedUsers }, { status: 200 })
  } catch (error: any) {
    console.error("Failed to fetch Clerk users:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

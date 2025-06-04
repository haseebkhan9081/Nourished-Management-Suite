import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(req: Request) {
  try {
    console.log("Request URL:", req.url) // Log full request URL

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("userId")

    console.log("Extracted userId:", userId) // Log extracted userId

    if (!userId) {
      console.warn("No userId provided in query string")
      return NextResponse.json({ error: "Missing userId" }, { status: 400 })
    }

    // Fetch school access records for user with related schools
    const accessData = await prisma.schoolAccess.findMany({
      where: { user_id: userId },
      include: { school: true },
      orderBy: {
        school: { name: "asc" }
      }
    })

    console.log(`Found ${accessData.length} access records for userId ${userId}`)

    return NextResponse.json(accessData)
  } catch (error) {
    console.error("API Error fetching user schools:", error)
    return NextResponse.json({ error: "Failed to fetch user schools" }, { status: 500 })
  }
}

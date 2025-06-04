// app/api/role/route.ts
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("userId")
    const schoolId = searchParams.get("schoolId")

    if (!userId || !schoolId) {
      return NextResponse.json({ error: "Missing userId or schoolId" }, { status: 400 })
    }

    // Assuming user_id is string and school_id is number
    const access = await prisma.schoolAccess.findFirst({
      where: {
        user_id: userId,
        school_id: Number(schoolId),
      },
      select: {
        role: true,
      },
    })

    if (!access) {
      return NextResponse.json({ role: "viewer" })
    }

    return NextResponse.json({ role: access.role })
  } catch (error) {
    console.error("API Error fetching user role:", error)
    return NextResponse.json({ role: "viewer" }, { status: 500 })
  }
}

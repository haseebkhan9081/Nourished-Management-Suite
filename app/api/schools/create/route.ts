import { NextResponse } from "next/server"
import  prisma from "@/lib/prisma"

export async function POST(req: Request) {
  const body = await req.json()
  const { name, address, user_id } = body
  console.log("Runtime DB URL:", process.env.DATABASE_URL)


  if (!user_id || !name) {
    return NextResponse.json({ error: "Missing user_id or name" }, { status: 400 })
  }

  try {
    // Create the school
    const school = await prisma.school.create({
      data: {
        name,
        address,
      },
    })

    // Grant admin access
    await prisma.schoolAccess.create({
      data: {
        school_id: school.id,
        user_id,
        role: "admin",
      },
    })

    return NextResponse.json({ success: true, school })
  } catch (error) {
    console.error("API Error:", error)
    return NextResponse.json({ error: "Failed to create school" }, { status: 500 })
  }
}

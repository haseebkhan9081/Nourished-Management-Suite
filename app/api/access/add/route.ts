// app/api/access/add/route.ts

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
  const body = await req.json()
  const { school_id, user_id, role } = body

  if (!school_id || !user_id || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  try {
    // Check for duplicate access
    const existingAccess = await prisma.schoolAccess.findFirst({
      where: {
        school_id,
        user_id,
      },
    })

    if (existingAccess) {
      return NextResponse.json(
        { error: "User already has access to this school" },
        { status: 409 }
      )
    }

    await prisma.schoolAccess.create({
      data: {
        school_id,
        user_id,
        role,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("API Error:", error)
    return NextResponse.json({ error: "Failed to add user access" }, { status: 500 })
  }
}

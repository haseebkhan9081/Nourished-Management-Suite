// app/api/schools/route.ts

import { NextResponse } from "next/server"
import  prisma  from "@/lib/prisma"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("user_id")

  if (!userId) return NextResponse.json({ error: "Missing user_id" }, { status: 400 })

  try {
    // Get all access records with school info
    const accessData = await prisma.schoolAccess.findMany({
      where: { user_id: userId },
      include: { school: true },
    })
//@ts-ignore
    const schoolIds = accessData.map(a => a.school?.id).filter(Boolean)

    let allAccessData = []
    if (schoolIds.length > 0) {
      allAccessData = await prisma.schoolAccess.findMany({
        where: { school_id: { in: schoolIds } },
      })
    }

    return NextResponse.json({ accessData, allAccessData })
  } catch (error) {
    console.error("API Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

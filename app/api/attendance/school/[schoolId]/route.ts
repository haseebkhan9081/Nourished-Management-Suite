import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"


export async function GET(req: Request, { params }: { params: { schoolId: string }}) {
  const {schoolId} = params

  if (!schoolId) {
    return NextResponse.json({ error: "Missing school ID" }, { status: 400 })
  }

  try {
    const attendance = await prisma.attendance.findMany({
      where: {
        student: { school_id: Number(schoolId) }, // assuming relation naming
      },
      include: {
        student: true, // load related student info (adjust field names accordingly)
      },
      orderBy: {
        date: "desc",
      },
    })

    return NextResponse.json(attendance)
  } catch (error) {
    console.error("Error fetching attendance:", error)
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 })
  }
}
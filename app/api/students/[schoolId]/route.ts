import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(
  req: Request,
  { params }: { params: { schoolId: string } }
) {
  const { schoolId } = await params

  if (!schoolId) {
    return NextResponse.json({ error: "Missing school ID" }, { status: 400 })
  }

  try {
    const students = await prisma.student.findMany({
      where: { school_id: Number(schoolId) },
      orderBy: { name: "asc" },
    })

    return NextResponse.json(students)
  } catch (error) {
    console.error("Error fetching students:", error)
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 })
  }
}

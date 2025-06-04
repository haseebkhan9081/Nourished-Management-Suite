// app/api/expenses/[schoolId]/route.ts
import prisma  from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  {params}: { params: { schoolId: string } }
) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month")
  const {schoolId} = await params

  if (!schoolId || !month) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
  }

  try {
    const expenses = await prisma.expense.findMany({
      where: {
        school_id: parseInt(schoolId),
        month_year: month,
      },
      orderBy: {
        created_at: "asc",
      },
    })

    return NextResponse.json(expenses)
  } catch (error) {
    console.error("API Error fetching expenses:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

import prisma  from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  {params}: { params: { schoolId: string } }
) {
  const {schoolId} = await params
  const { searchParams } = new URL(req.url)
  const excludeMonth = searchParams.get("excludeMonth")

  if (!schoolId || !excludeMonth) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
  }

  try {
    const months = await prisma.expense.findMany({
      where: {
        school_id: parseInt(schoolId),
        NOT: { month_year: excludeMonth },
      },
      select: {
        month_year: true,
      },
      orderBy: {
        month_year: "desc",
      },
    })

    // Get unique month_year values
    const uniqueMonths = Array.from(new Set(months.map((m:any) => m.month_year)))

    return NextResponse.json(uniqueMonths)
  } catch (error) {
    console.error("API Error fetching previous months:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

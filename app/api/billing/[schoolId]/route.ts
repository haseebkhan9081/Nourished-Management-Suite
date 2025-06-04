// app/api/billing/[schoolId]/route.ts
import  prisma  from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  {params}: { params: { schoolId: string } }
) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month") // format: "2025-06"
  const {schoolId} = await params

  if (!schoolId || !month) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
  }

  try {
    const startDate = new Date(`${month}-01`)
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + 1)
    endDate.setDate(0)

    const meals = await prisma.meal.findMany({
      where: {
        school_id: parseInt(schoolId),
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        meal_items: true,
      },
      orderBy: {
        date: "asc",
      },
    })

    return NextResponse.json(meals)
  } catch (error) {
    console.error("API Error fetching billing:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

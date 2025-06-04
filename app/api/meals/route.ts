import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { startOfMonth, endOfMonth } from "date-fns"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const schoolId = url.searchParams.get("school_id")
    const month = url.searchParams.get("month") // Format: "YYYY-MM"

    if (!schoolId) {
      return NextResponse.json({ error: "Missing school_id query parameter" }, { status: 400 })
    }

    let dateFilter = {}

    if (month) {
      // Prevent timezone offset by using fixed midnight string
      const parsedMonth = new Date(`${month}-01T00:00:00`)

      const startDate = startOfMonth(parsedMonth)
      const endDate = endOfMonth(parsedMonth)

      console.log("Parsed month:", month)
      console.log("Start of month:", startDate.toISOString())
      console.log("End of month:", endDate.toISOString())

      dateFilter = {
        date: {
          gte: startDate,
          lte: endDate,
        }
      }
    }

    const meals = await prisma.meal.findMany({
      where: {
        school_id: Number(schoolId),
        ...dateFilter,
      },
      include: {
        meal_items: true,
      },
      orderBy: {
        date: "desc",
      },
    })

    console.log(`Found ${meals.length} meals for school ${schoolId}`)

    return NextResponse.json(meals)
  } catch (error) {
    console.error("Error fetching meals:", error)
    return NextResponse.json({ error: "Failed to fetch meals" }, { status: 500 })
  }
}

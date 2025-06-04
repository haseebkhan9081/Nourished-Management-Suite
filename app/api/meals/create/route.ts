import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { school_id, date } = body

    if (!school_id || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    var dateObj = new Date(date)

    // Check if a meal already exists for this school and date
    const existingMeal = await prisma.meal.findFirst({
      where: {
        school_id,
        date:dateObj,
      },
    })

    if (existingMeal) {
      return NextResponse.json(
        { error: "A meal entry already exists for this date." },
        { status: 409 }
      )
    }

    var dateObj=new Date(date)
    const dayOfWeek = dateObj.toLocaleDateString("en-US", { weekday: "long" })

    // Create the new meal
    const newMeal = await prisma.meal.create({
      data: {
        school_id,
        date:dateObj,
        day_of_week: dayOfWeek,
        total_cost: 0,
      },
    })

    return NextResponse.json({ success: true, meal: newMeal })
  } catch (error) {
    console.error("Error creating new meal:", error)
    return NextResponse.json({ error: "Failed to create new meal" }, { status: 500 })
  }
}

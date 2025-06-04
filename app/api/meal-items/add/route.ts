import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { meal_id, item_name, unit_price, quantity } = body

    if (!meal_id || !item_name || unit_price == null || quantity == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    const unitPriceNum = parseFloat(unit_price)
    const quantityNum = parseInt(quantity, 10)
    const total = unitPriceNum * quantityNum

    const newMealItem = await prisma.mealItem.create({
      data: {
        meal_id: Number(meal_id),
        item_name,
        unit_price: unitPriceNum,
        quantity: quantityNum,
        total, 
      },
    })

    return NextResponse.json({ success: true, mealItem: newMealItem })
  } catch (error) {
    console.error("Error adding meal item:", error)
    return NextResponse.json({ error: "Failed to add meal item" }, { status: 500 })
  }
}

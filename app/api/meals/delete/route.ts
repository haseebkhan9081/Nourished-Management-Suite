import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const mealId = searchParams.get("mealId")

    if (!mealId) {
      return NextResponse.json({ error: "Missing mealId" }, { status: 400 })
    }

    // Delete meal items first if Prisma schema does NOT cascade deletes automatically
    await prisma.mealItem.deleteMany({
      where: { meal_id: Number(mealId) },
    })

    // Delete the meal itself
    await prisma.meal.delete({
      where: { id: Number(mealId) },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting meal:", error)
    return NextResponse.json({ error: "Failed to delete meal" }, { status: 500 })
  }
}

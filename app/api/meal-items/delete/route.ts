import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { itemId } = body

    if (!itemId) {
      return NextResponse.json({ error: "Missing itemId" }, { status: 400 })
    }

    await prisma.mealItem.delete({
      where: {
        id: Number(itemId),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting meal item:", error)
    return NextResponse.json({ error: "Failed to delete meal item" }, { status: 500 })
  }
}

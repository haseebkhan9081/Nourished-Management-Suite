import { NextResponse } from "next/server"
import prisma  from "@/lib/prisma"

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const idParam = searchParams.get("id")

    if (!idParam) {
      return NextResponse.json({ error: "Missing access ID" }, { status: 400 })
    }

    const accessId = Number(idParam)
    if (isNaN(accessId)) {
      return NextResponse.json({ error: "Invalid access ID" }, { status: 400 })
    }

    await prisma.schoolAccess.delete({
      where: { id: accessId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("API Error deleting access:", error)
    return NextResponse.json({ error: "Failed to remove user access" }, { status: 500 })
  }
}

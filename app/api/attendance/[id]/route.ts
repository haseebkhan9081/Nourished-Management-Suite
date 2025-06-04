import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const attendanceId = parseInt(params.id)

  if (isNaN(attendanceId)) {
    return NextResponse.json({ error: "Invalid attendance ID" }, { status: 400 })
  }

  try {
    await prisma.attendance.delete({
      where: {
        id: attendanceId,
      },
    })

    return NextResponse.json({ message: "Deleted successfully" })
  } catch (error) {
    console.error("Error deleting attendance:", error)
    return NextResponse.json({ error: "Failed to delete attendance" }, { status: 500 })
  }
}


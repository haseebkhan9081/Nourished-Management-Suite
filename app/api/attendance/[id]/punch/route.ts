import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const attendanceId = Number(id)
  const body = await req.json()
  const { newPunchTime } = body

  if (!newPunchTime) {
    return NextResponse.json({ error: "Missing punch time" }, { status: 400 })
  }

  try {
    const current = await prisma.attendance.findUnique({
      where: { id: attendanceId },
    })

    if (!current) {
      return NextResponse.json({ error: "Attendance record not found" }, { status: 404 })
    }

    const updatedPunchTimes = [...(current.punch_times || []), newPunchTime]

    const updated = await prisma.attendance.update({
      where: { id: attendanceId },
      data: { punch_times: updatedPunchTimes },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating punch times:", error)
    return NextResponse.json({ error: "Failed to update punch times" }, { status: 500 })
  }
}




export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const attendanceId = Number(id)
  const body = await req.json()
  const { timeIndex } = body

  try {
    const current = await prisma.attendance.findUnique({
      where: { id: attendanceId },
    })

    if (!current) {
      return NextResponse.json({ error: "Attendance record not found" }, { status: 404 })
    }
//@ts-ignore
    const updatedPunchTimes = (current.punch_times || []).filter((_, index) => index !== timeIndex)

    const updated = await prisma.attendance.update({
      where: { id: attendanceId },
      data: { punch_times: updatedPunchTimes },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error removing punch time:", error)
    return NextResponse.json({ error: "Failed to remove punch time" }, { status: 500 })
  }
}

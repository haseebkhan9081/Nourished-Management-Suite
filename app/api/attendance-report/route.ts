import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentIds, month, schoolId } = body

    if (!studentIds || !month || !schoolId) {
      return NextResponse.json(
        { error: 'Missing required parameters: studentIds, month, schoolId' },
        { status: 400 }
      )
    }

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json(
        { error: 'studentIds must be a non-empty array' },
        { status: 400 }
      )
    }

    // Parse month (format: YYYY-MM)
    const [year, monthNum] = month.split('-')
    const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1)
    const endDate = new Date(parseInt(year), parseInt(monthNum), 0) // Last day of month

    // Get all students that match the provided student IDs
    const students = await prisma.student.findMany({
      where: {
        school_id: Number(schoolId),
        student_id: {
          in: studentIds
        }
      }
    })
//@ts-ignore
    // Get student IDs from database (these are the actual IDs, not the student_id field)
    const studentDbIds = students.map(student => student.id)

    // Get attendance records for these students in the specified month
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        student_id: {
          in: studentDbIds
        },
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        students: true
      },
      orderBy: {
        date: 'asc'
      }
    })

    return NextResponse.json(attendanceRecords)

  } catch (error) {
    console.error('Error fetching attendance report data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
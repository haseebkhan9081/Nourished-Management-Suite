import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { randomUUID } from "crypto"

// Create a new Prisma client instance for each request
// This avoids transaction timeout issues

interface BatchImportRequest {
  batch: any[]
  batchIndex: number
  totalBatches: number
  schoolId: number
}

export async function POST(request: NextRequest) {


  try {
    const body: BatchImportRequest = await request.json()
    const { batch, batchIndex, totalBatches, schoolId } = body

    if (!batch || !Array.isArray(batch) || batch.length === 0) {
      return NextResponse.json({ error: "Invalid batch data" }, { status: 400 })
    }

    console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} records)`)

    // Verify school exists
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
    })

    if (!school) {
      return NextResponse.json({ error: `School with ID ${schoolId} not found` }, { status: 400 })
    }

    let newStudentsCount = 0
    let attendanceRecordsCount = 0
    const errors: string[] = []

    // Process each record in the batch (without using transactions)
    for (const record of batch) {
      try {
        // Validate required fields
        if (!record.student_id || !record.name || !record.date) {
          errors.push(`Skipping record with missing required fields: ${JSON.stringify(record)}`)
          continue
        }

        // Validate date format
        let dateObj: Date
        try {
          dateObj = new Date(record.date)
          if (isNaN(dateObj.getTime())) {
            errors.push(`Skipping record with invalid date format: ${record.date}`)
            continue
          }
        } catch (e) {
          errors.push(`Error parsing date ${record.date}: ${e instanceof Error ? e.message : String(e)}`)
          continue
        }

        // Check if student exists by student_id and school_id
        let student = await prisma.student.findFirst({
          where: {
            student_id: record.student_id,
            school_id: schoolId,
          },
        })

        // If student doesn't exist, create them
        if (!student) {
          student = await prisma.student.create({
            data: {
              student_id: record.student_id,
              name: record.name,
              class_department: record.class_department || "",
              school_id: schoolId,
              system_id: randomUUID(),
            },
          })
          newStudentsCount++
        } else {
          // Update student's name or class_department if they differ
          if (
            record.name !== student.name ||
            (record.class_department && record.class_department !== student.class_department)
          ) {
            await prisma.student.update({
              where: { id: student.id },
              data: {
                name: record.name,
                class_department: record.class_department || student.class_department,
              },
            })
          }
        }

        // Process punch times - filter out empty strings and ensure valid format
        const validPunchTimes = (record.punch_times || [])
          .filter((time: string) => time && time.trim())
          .map((time: string) => time.trim())

        // Check if attendance record exists for this student and date
        const existingAttendance = await prisma.attendance.findFirst({
          where: {
            student_id: student.id,
            date: dateObj,
          },
        })

        if (existingAttendance) {
          // Update existing attendance record with new punch times
          // Merge existing punch times with new ones, removing duplicates
          const existingTimes = existingAttendance.punch_times || []
          const allTimes = [...existingTimes, ...validPunchTimes]
          const uniqueTimes = Array.from(new Set(allTimes)).sort()

          await prisma.attendance.update({
            where: { id: existingAttendance.id },
            data: {
              punch_times: uniqueTimes,
              updated_at: new Date(),
            },
          })
          attendanceRecordsCount++
        } else {
          // Create new attendance record
          await prisma.attendance.create({
            data: {
              student_id: student.id,
              date: dateObj,
              punch_times: validPunchTimes.sort(), // Sort times for consistency
            },
          })
          attendanceRecordsCount++
        }
      } catch (recordError) {
        const errorMessage = recordError instanceof Error ? recordError.message : String(recordError)
        errors.push(`Error processing record for student ${record.student_id}: ${errorMessage}`)
        // Continue processing other records
      }
    }

    console.log(`Completed batch ${batchIndex + 1}/${totalBatches}`)

    return NextResponse.json({
      success: true,
      batchIndex,
      totalBatches,
      summary: {
        newStudentsRegistered: newStudentsCount,
        attendanceRecordsProcessed: attendanceRecordsCount,
        recordsProcessed: batch.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    })
  } catch (error) {
    console.error(`Error processing batch:`, error)

    return NextResponse.json(
      {
        error: "Failed to process batch",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  } finally {
    await prisma.$disconnect()
  }
}

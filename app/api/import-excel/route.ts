import { type NextRequest, NextResponse } from "next/server"

import { randomUUID } from "crypto"

// Create a new Prisma client instance
import prisma from "@/lib/prisma"

interface ImportExcelData {
  "AC-No": string // This is student_id in our database
  Name: string
  Class: string // This is class_department in our database
  Date: string // ISO format YYYY-MM-DD
  Time: string // Space-separated time values
}

interface FormattedImportData {
  student_id: string
  name: string
  class_department: string
  punch_times: string[]
  date: string
  school_id: number
}

interface ImportExcelRequest {
  data: FormattedImportData[]
}

// Process records in smaller batches for faster processing
const BATCH_SIZE = 25 // Reduced from 50 for faster processing

export async function POST(request: NextRequest) {
  try {
    const body: ImportExcelRequest = await request.json()

    if (!body.data || !Array.isArray(body.data)) {
      return NextResponse.json({ error: "Invalid request body. Expected 'data' array." }, { status: 400 })
    }

    if (body.data.length === 0) {
      return NextResponse.json({ error: "No data provided for import." }, { status: 400 })
    }

    let newStudentsCount = 0
    let attendanceRecordsCount = 0
    const errors: string[] = []

    // Verify school exists first (outside of transaction)
    const schoolId = body.data[0]?.school_id
    if (schoolId) {
      const school = await prisma.school.findUnique({
        where: { id: schoolId },
      })

      if (!school) {
        return NextResponse.json({ error: `School with ID ${schoolId} not found` }, { status: 400 })
      }
    }

    // Process data in batches
    const batches = []
    for (let i = 0; i < body.data.length; i += BATCH_SIZE) {
      batches.push(body.data.slice(i, i + BATCH_SIZE))
    }

    console.log(`Processing ${body.data.length} records in ${batches.length} batches of ${BATCH_SIZE}`)

    // Process each batch in a separate transaction
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} records)`)

      try {
        await prisma.$transaction(
          async (tx:any) => {
            for (const record of batch) {
              // Validate required fields
              if (!record.student_id || !record.name || !record.date || !record.school_id) {
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

              try {
                // Check if student exists by student_id and school_id
                let student = await tx.student.findFirst({
                  where: {
                    student_id: record.student_id,
                    school_id: record.school_id,
                  },
                })

                // If student doesn't exist, create them
                if (!student) {
                  student = await tx.student.create({
                    data: {
                      student_id: record.student_id,
                      name: record.name,
                      class_department: record.class_department || "",
                      school_id: record.school_id,
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
                    await tx.student.update({
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
                  .filter((time) => time && time.trim())
                  .map((time) => time.trim())

                // Check if attendance record exists for this student and date
                const existingAttendance = await tx.attendance.findFirst({
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

                  await tx.attendance.update({
                    where: { id: existingAttendance.id },
                    data: {
                      punch_times: uniqueTimes,
                      updated_at: new Date(),
                    },
                  })
                  attendanceRecordsCount++
                } else {
                  // Create new attendance record
                  await tx.attendance.create({
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
                // Continue processing other records instead of failing the entire batch
                continue
              }
            }
          },
          {
            maxWait: 5000, // Reduced wait time
            timeout: 10000, // Reduced timeout for faster processing
          },
        )

        console.log(`Completed batch ${batchIndex + 1}/${batches.length}`)
      } catch (batchError) {
        console.error(`Error processing batch ${batchIndex + 1}:`, batchError)
        errors.push(
          `Failed to process batch ${batchIndex + 1}: ${batchError instanceof Error ? batchError.message : String(batchError)}`,
        )
        // Continue with next batch instead of failing entirely
        continue
      }
    }

    return NextResponse.json({
      success: true,
      message: "Data imported successfully",
      summary: {
        newStudentsRegistered: newStudentsCount,
        attendanceRecordsProcessed: attendanceRecordsCount,
        totalRecordsProcessed: body.data.length,
        batchesProcessed: batches.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    })
  } catch (error) {
    console.error("Error importing Excel data:", error)

    // Handle specific Prisma errors
    if (error instanceof Error) {
      if (error.message.includes("Foreign key constraint")) {
        return NextResponse.json({ error: "Invalid school_id provided. School does not exist." }, { status: 400 })
      }

      if (error.message.includes("Unique constraint")) {
        return NextResponse.json(
          { error: "Duplicate data detected. Please check your Excel file for duplicate entries." },
          { status: 400 },
        )
      }

      if (error.message.includes("Transaction already closed") || error.message.includes("timeout")) {
        return NextResponse.json(
          {
            error: "Import timeout. Please try with a smaller file or contact support.",
            details: "The file is too large to process in one go. Try splitting it into smaller files.",
          },
          { status: 408 },
        )
      }
    }

    return NextResponse.json(
      {
        error: "Failed to import data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  } finally {
    await prisma.$disconnect()
  }
}

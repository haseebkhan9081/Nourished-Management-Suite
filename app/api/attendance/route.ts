import { NextResponse,NextRequest } from "next/server"
import prisma from "@/lib/prisma"


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const schoolId = searchParams.get("school_id")
    const month = searchParams.get("month") // Format: YYYY-MM
    const singleDate = searchParams.get("date") // Format: YYYY-MM-DD
    const page = searchParams.get("page") || "1"
    const limit = searchParams.get("limit") || "25"
    const sortBy = searchParams.get("sortBy") || "date"
    const sortOrder = searchParams.get("sortOrder") || "desc"
    const search = searchParams.get("search") || ""

    // Validate required school_id
    if (!schoolId) {
      return NextResponse.json({ error: "school_id is required" }, { status: 400 })
    }

    const schoolIdNum = Number.parseInt(schoolId)
    if (isNaN(schoolIdNum)) {
      return NextResponse.json({ error: "school_id must be a valid number" }, { status: 400 })
    }

    // Verify school exists
    const school = await prisma.school.findUnique({
      where: { id: schoolIdNum },
    })

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }

    let dateFilter: any = {}
    let isPaginated = false

    // Handle single date filter (YYYY-MM-DD format)
    if (singleDate) {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(singleDate)) {
        return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD format" }, { status: 400 })
      }

      const dateObj = new Date(singleDate)
      if (isNaN(dateObj.getTime())) {
        return NextResponse.json({ error: "Invalid date value" }, { status: 400 })
      }

      // Set date filter for exact date
      const startOfDay = new Date(dateObj)
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date(dateObj)
      endOfDay.setHours(23, 59, 59, 999)

      dateFilter = {
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      }
    }
    // Handle month filter with pagination (YYYY-MM format)
    else if (month) {
      // Validate month format
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return NextResponse.json({ error: "Invalid month format. Use YYYY-MM format" }, { status: 400 })
      }

      const [year, monthNum] = month.split("-")
      const yearInt = Number.parseInt(year)
      const monthInt = Number.parseInt(monthNum)

      // Create start and end dates for the month
      const startOfMonth = new Date(yearInt, monthInt - 1, 1)
      const endOfMonth = new Date(yearInt, monthInt, 0)

      dateFilter = {
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      }

      isPaginated = true
    } else {
      return NextResponse.json(
        {
          error: "Either month or date parameter must be provided",
          details: "Provide either 'month' parameter (YYYY-MM format) or 'date' parameter (YYYY-MM-DD format)",
        },
        { status: 400 },
      )
    }

    // Build search filter
    let searchFilter: any = {}
    if (search.trim()) {
      searchFilter = {
        students: {
          OR: [
            {
              name: {
                contains: search.trim(),
                mode: "insensitive",
              },
            },
            {
              class_department: {
                contains: search.trim(),
                mode: "insensitive",
              },
            },
            {
              student_id: {
                contains: search.trim(),
                mode: "insensitive",
              },
            },
          ],
        },
      }
    }

    // Build sort configuration
    let orderBy: any = []

    switch (sortBy) {
      case "name":
        orderBy = [{ students: { name: sortOrder } }]
        break
      case "class":
        orderBy = [{ students: { class_department: sortOrder } }, { students: { name: "asc" } }]
        break
      case "date":
      default:
        orderBy = [{ date: sortOrder }, { students: { name: "asc" } }]
        break
    }

    // Calculate pagination for month view
    const pageNum = Math.max(1, Number.parseInt(page))
    const limitNum = Math.min(50, Math.max(10, Number.parseInt(limit))) // Limit between 10-50
    const skip = (pageNum - 1) * limitNum

    // Combine all filters
    const whereClause = {
      students: {
        school_id: schoolIdNum,
        ...(searchFilter.students || {}),
      },
      ...dateFilter,
    }

    // Fetch attendance records with student information using Prisma
    const attendanceRecords = await prisma.attendance.findMany({
      where: whereClause,
      include: {
        students: true,
      },
      orderBy,
      ...(isPaginated ? { skip, take: limitNum } : {}),
    })

    // For single date, also get summary statistics
    let summary = null
    if (singleDate) {
      const totalRecords = attendanceRecords.length
      const presentStudents = attendanceRecords.filter(
        (record:any) => record.punch_times && record.punch_times.length > 0,
      ).length

      summary = {
        total: totalRecords,
        present: presentStudents,
        date: singleDate,
      }
    }

    // For month view, get total count for pagination
    let totalCount = null
    let hasMore = false
    if (isPaginated) {
      totalCount = await prisma.attendance.count({
        where: whereClause,
      })
      hasMore = skip + limitNum < totalCount
    }

    // Format dates for the response
    const formattedRecords = attendanceRecords.map((record:any) => ({
      ...record,
      date: record.date.toISOString().split("T")[0], // Format as YYYY-MM-DD
    }))

    const response: any = {
      data: formattedRecords,
      pagination: isPaginated
        ? {
            page: pageNum,
            limit: limitNum,
            total: totalCount,
            hasMore,
          }
        : null,
      summary,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error fetching attendance:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  } finally {
    await prisma.$disconnect()
  }
}


export async function POST(req: Request) {
  const { student_id, date } = await req.json()

  if (!student_id || !date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  try {
    const existing = await prisma.attendance.findFirst({
      where: {
        student_id,
        date: new Date(date),
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: "Attendance already exists for this student on this date" },
        { status: 409 }
      )
    }

    const attendance = await prisma.attendance.create({
      data: {
        student_id,
        date: new Date(date),
        punch_times: [],
      },
    })

    return NextResponse.json(attendance)
  } catch (error) {
    console.error("Error creating attendance:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

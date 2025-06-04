import { NextResponse } from 'next/server'


import prisma from '@/lib/prisma'

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const idParam = searchParams.get('id')

  if (!idParam) {
    return NextResponse.json({ error: 'Missing school ID' }, { status: 400 })
  }

  const schoolId = parseInt(idParam)
  if (isNaN(schoolId)) {
    return NextResponse.json({ error: 'Invalid school ID' }, { status: 400 })
  }

  try {
    // Use a transaction for atomic safety
    await prisma.$transaction([
      // Delete Attendance
      prisma.attendance.deleteMany({
        where: {
          students: {
            school_id: schoolId,
          },
        },
      }),

      // Delete MealItems
      prisma.mealItem.deleteMany({
        where: {
          meal: {
            school_id: schoolId,
          },
        },
      }),

      // Delete Meals
      prisma.meal.deleteMany({
        where: {
          school_id: schoolId,
        },
      }),

      // Delete Students
      prisma.student.deleteMany({
        where: {
          school_id: schoolId,
        },
      }),

      // Delete Expenses
      prisma.expense.deleteMany({
        where: {
          school_id: schoolId,
        },
      }),

      // Delete SchoolAccess
      prisma.schoolAccess.deleteMany({
        where: {
          school_id: schoolId,
        },
      }),

      // Finally delete the School
      prisma.school.delete({
        where: {
          id: schoolId,
        },
      }),
    ])

    return NextResponse.json({ message: 'School deleted successfully' }, { status: 200 })
  } catch (error) {
    console.error('[DELETE_SCHOOL_ERROR]', error)
    return NextResponse.json({ error: 'Failed to delete school' }, { status: 500 })
  }
}

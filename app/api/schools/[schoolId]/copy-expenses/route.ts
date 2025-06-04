import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const { previousMonth, currentMonth } = await req.json()
  const schoolId = Number(params.schoolId)

  if (!schoolId || !previousMonth || !currentMonth) {
    return NextResponse.json({ error: "Missing required data" }, { status: 400 })
  }

  try {
    // Fetch previous month expenses
    const previousExpenses = await prisma.expense.findMany({
      where: {
        school_id: schoolId,
        month_year: previousMonth,
      },
    })

    if (previousExpenses.length === 0) {
      return NextResponse.json({ message: "No expenses to copy" }, { status: 200 })
    }

    // Fetch existing expense names for current month
    const existingCurrentExpenses = await prisma.expense.findMany({
      where: {
        school_id: schoolId,
        month_year: currentMonth,
      },
      select: {
        expense_name: true,
      },
    })
//@ts-ignore
    const existingNames = new Set(existingCurrentExpenses.map(e => e.expense_name))

    // Filter out duplicates
    //@ts-ignore
    const newExpenses = previousExpenses
      .filter((expense:any) => !existingNames.has(expense.expense_name))
      .map((expense:any) => ({
        school_id: schoolId,
        month_year: currentMonth,
        expense_name: expense.expense_name,
        amount: expense.amount,
      }))

    if (newExpenses.length === 0) {
      return NextResponse.json({ message: "All expenses already exist for this month" }, { status: 200 })
    }

    // Insert only new (non-duplicate) expenses
    await prisma.expense.createMany({
      data: newExpenses,
    })

    return NextResponse.json({ message: `Copied ${newExpenses.length} new expenses.` }, { status: 200 })
  } catch (error) {
    console.error("Error copying expenses:", error)
    return NextResponse.json({ error: "Failed to copy expenses" }, { status: 500 })
  }
}


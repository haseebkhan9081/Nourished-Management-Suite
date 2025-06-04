import prisma  from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, month_year, expense_name, amount } = body

    if (!school_id || !month_year || !expense_name || amount === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const expense = await prisma.expense.create({
      data: {
        school_id: Number(school_id),
        month_year,
        expense_name,
        amount: Number(amount),
      },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error("Error adding expense:", error)
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    )
  }
}

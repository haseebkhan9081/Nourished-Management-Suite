// app/api/schools/[schoolId]/expenses/[expenseId]/route.ts

import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: { schoolId: string; expenseId: string }
  }
) {
  const schoolId = Number(await params.schoolId)
  const expenseId = Number(await params.expenseId)

  if (isNaN(schoolId) || isNaN(expenseId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 })
  }

  try {
    // Optionally verify expense belongs to school (recommended)
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
    })

    if (!expense || expense.school_id !== schoolId) {
      return NextResponse.json({ error: "Expense not found for this school" }, { status: 404 })
    }

    await prisma.expense.delete({
      where: { id: expenseId },
    })

    return NextResponse.json({ message: "Expense deleted" }, { status: 200 })
  } catch (error) {
    console.error("Error deleting expense:", error)
    return NextResponse.json(
      { error: "Failed to delete expense" },
      { status: 500 }
    )
  }
}

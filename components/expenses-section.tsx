"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, Copy, Loader2 } from "lucide-react"
import type { Expense } from "@/lib/supabase"
import { useUser } from "@clerk/nextjs"
import { useSchoolPermissions } from "@/hooks/use-school-permissions"

interface ExpensesSectionProps {
  selectedSchoolId: number | null
}

export function ExpensesSection({ selectedSchoolId }: ExpensesSectionProps) {
  const { permissions, loading: loadingPermissions } = useSchoolPermissions(selectedSchoolId)
  const { user } = useUser()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(false)
  const [operationLoading, setOperationLoading] = useState(false) // New state for operation loading
  const [selectedMonth, setSelectedMonth] = useState("")
  const [showAddExpenseForm, setShowAddExpenseForm] = useState(false)
  const [newExpense, setNewExpense] = useState({ expense_name: "", amount: "" })
  const [totalExpenses, setTotalExpenses] = useState(0)
  const [previousMonths, setPreviousMonths] = useState<string[]>([])
  const [copyingExpenses, setCopyingExpenses] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  // Format currency in PKR with proper formatting
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("en-PK", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  }

  useEffect(() => {
    if (selectedSchoolId && selectedMonth) {
      fetchExpenses()
      fetchPreviousMonths()
    }
  }, [selectedSchoolId, selectedMonth])

  const fetchExpenses = async () => {
    if (!selectedSchoolId || !selectedMonth) return

    setLoading(true)
    try {
      const res = await fetch(`/api/expenses/${selectedSchoolId}?month=${selectedMonth}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Unknown error")

      setExpenses(data || [])
      calculateTotal(data || [])
    } catch (error) {
      console.error("Error fetching expenses:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPreviousMonths = async () => {
    if (!selectedSchoolId || !selectedMonth) return

    try {
      const res = await fetch(`/api/expenses/previousMonths/${selectedSchoolId}?excludeMonth=${selectedMonth}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Unknown error")

      setPreviousMonths(data)
    } catch (error) {
      console.error("Error fetching previous months:", error)
    }
  }

  const calculateTotal = (expenseList: Expense[]) => {
    const total = expenseList.reduce((sum, expense) => sum + Number(expense.amount), 0)
    setTotalExpenses(total)
  }

  const addExpense = async () => {
    if (!selectedSchoolId || !selectedMonth || !newExpense.expense_name || !newExpense.amount) return

    setOperationLoading(true) // Show loading overlay
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          school_id: selectedSchoolId,
          month_year: selectedMonth,
          expense_name: newExpense.expense_name,
          amount: Number(newExpense.amount),
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to add expense")
      }

      setNewExpense({ expense_name: "", amount: "" })
      setShowAddExpenseForm(false)
      fetchExpenses()
    } catch (error) {
      console.error("Error adding expense:", error)
    } finally {
      setOperationLoading(false) // Hide loading overlay
    }
  }

  const deleteExpense = async (expenseId: number) => {
    if (!confirm("Are you sure you want to delete this expense?")) {
      return
    }

    setOperationLoading(true) // Show loading overlay
    try {
      const res = await fetch(`/api/schools/${selectedSchoolId}/expenses/${expenseId}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to delete expense")
      }

      fetchExpenses()
    } catch (error) {
      console.error("Error deleting expense:", error)
    } finally {
      setOperationLoading(false) // Hide loading overlay
    }
  }

  const copyFromPreviousMonth = async (previousMonth: string) => {
    if (!selectedSchoolId || !selectedMonth) return

    setCopyingExpenses(true)
    setOperationLoading(true) // Show loading overlay

    try {
      const res = await fetch(`/api/schools/${selectedSchoolId}/copy-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousMonth,
          currentMonth: selectedMonth,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || "Unknown error")
      }

      fetchExpenses()
      alert(result.message)
    } catch (error: any) {
      console.error("Error copying expenses:", error)
      alert(error.message || "Failed to copy expenses.")
    } finally {
      setCopyingExpenses(false)
      setOperationLoading(false) // Hide loading overlay
    }
  }

  const formatMonthYear = (monthYear: string) => {
    const [year, month] = monthYear.split("-")
    return new Date(`${year}-${month}-01`).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    })
  }

  if (!selectedSchoolId) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">Please select a school to view expenses</p>
        </CardContent>
      </Card>
    )
  }

  if (loadingPermissions) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">Loading permissions...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="relative">
      {/* Loading Overlay */}
      {operationLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg shadow-lg flex items-center gap-3">
            <Loader2 className="h-6 w-6 text-[#A2BD9D] animate-spin" />
            <p className="text-gray-700 font-medium">Processing...</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-[#A2BD9D]">Monthly Expenses</CardTitle>
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
              <label className="text-sm font-medium whitespace-nowrap">Select Month/Year:</label>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full sm:w-48 border-[#A2BD9D] focus:ring-[#A2BD9D]"
                placeholder="Select month..."
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedMonth ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Please select a month to view or add expenses</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  {permissions.canCreate && (
                    <Button
                      onClick={() => setShowAddExpenseForm(true)}
                      className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Expense
                    </Button>
                  )}

                  {permissions.canCreate && previousMonths.length > 0 && (
                    <div className="relative w-full sm:w-auto">
                      <Button
                        variant="outline"
                        onClick={() => setShowDropdown((prev) => !prev)}
                        className="w-full sm:w-auto border-[#A2BD9D]/30 hover:border-[#A2BD9D] hover:bg-[#A2BD9D]/5"
                        disabled={copyingExpenses}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy From Previous Month
                      </Button>

                      {showDropdown && (
                        <div className="absolute left-0 top-full mt-2 w-full sm:w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                          <select
                            className="block w-full px-4 py-2 text-sm text-gray-700 bg-white border-none rounded-md focus:outline-none focus:ring-2 focus:ring-[#A2BD9D]"
                            onChange={(e) => {
                              const value = e.target.value
                              if (value) {
                                copyFromPreviousMonth(value)
                                e.target.value = ""
                                setShowDropdown(false)
                              }
                            }}
                          >
                            <option value="">Select month</option>
                            {previousMonths.map((month) => (
                              <option key={month} value={month}>
                                {formatMonthYear(month)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {showAddExpenseForm && permissions.canCreate && (
                <Card className="mb-6 border-[#A2BD9D]/30 shadow-sm">
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-4 text-[#A2BD9D]">Add New Expense</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Input
                        placeholder="Expense name"
                        value={newExpense.expense_name}
                        onChange={(e) => setNewExpense({ ...newExpense, expense_name: e.target.value })}
                        className="w-full border-[#A2BD9D]/30 focus:border-[#A2BD9D] focus:ring-[#A2BD9D]/20"
                      />
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                          ₨
                        </span>
                        <Input
                          type="number"
                          step="1"
                          placeholder="0"
                          value={newExpense.amount}
                          onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                          className="w-full pl-8 border-[#A2BD9D]/30 focus:border-[#A2BD9D] focus:ring-[#A2BD9D]/20"
                        />
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          onClick={addExpense}
                          className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                          disabled={!newExpense.expense_name || !newExpense.amount || operationLoading}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowAddExpenseForm(false)
                            setNewExpense({ expense_name: "", amount: "" })
                          }}
                          className="w-full sm:w-auto border-[#A2BD9D]/30 hover:border-[#A2BD9D] hover:bg-[#A2BD9D]/5"
                          disabled={operationLoading}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {loading ? (
                <div className="text-center py-8">Loading expenses...</div>
              ) : expenses.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-2">💰</div>
                  <p className="text-gray-500 font-medium">No expenses found for {formatMonthYear(selectedMonth)}</p>
                  {permissions.canCreate && (
                    <p className="text-sm text-gray-400 mt-2">
                      Add expenses using the button above or copy from a previous month
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[#A2BD9D]/5">
                          <TableHead className="text-[#A2BD9D] font-semibold">Expense Name</TableHead>
                          <TableHead className="text-[#A2BD9D] font-semibold">Amount (PKR)</TableHead>
                          {permissions.canDelete && (
                            <TableHead className="text-[#A2BD9D] font-semibold">Actions</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenses.map((expense) => (
                          <TableRow key={expense.id} className="hover:bg-[#A2BD9D]/5">
                            <TableCell className="font-medium text-gray-800">{expense.expense_name}</TableCell>
                            <TableCell className="font-semibold text-gray-700">
                              ₨{formatCurrency(Number(expense.amount))}
                            </TableCell>
                            {permissions.canDelete && (
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => deleteExpense(expense.id)}
                                  className="hover:bg-red-600"
                                  disabled={operationLoading}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <div className="bg-gradient-to-r from-[#A2BD9D] to-[#8FA889] text-white p-4 rounded-lg w-full sm:w-auto shadow-sm">
                      <div className="text-lg font-semibold text-center sm:text-left">
                        Total Expenses: ₨{formatCurrency(totalExpenses)}
                      </div>
                      <div className="text-sm opacity-90 text-center sm:text-left">
                        {formatMonthYear(selectedMonth)}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

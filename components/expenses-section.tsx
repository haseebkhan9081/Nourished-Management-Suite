"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, Copy } from "lucide-react"
import { supabase, type Expense } from "@/lib/supabase"
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
  const [selectedMonth, setSelectedMonth] = useState("")
  const [showAddExpenseForm, setShowAddExpenseForm] = useState(false)
  const [newExpense, setNewExpense] = useState({ expense_name: "", amount: "" })
  const [totalExpenses, setTotalExpenses] = useState(0)
  const [previousMonths, setPreviousMonths] = useState<string[]>([])
  const [copyingExpenses, setCopyingExpenses] = useState(false)

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
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("school_id", selectedSchoolId)
        .eq("month_year", selectedMonth)
        .order("created_at", { ascending: true })

      if (error) throw error

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
      const { data, error } = await supabase
        .from("expenses")
        .select("month_year")
        .eq("school_id", selectedSchoolId)
        .not("month_year", "eq", selectedMonth)
        .order("month_year", { ascending: false })

      if (error) throw error

      // Extract unique month_year values
      const uniqueMonths = Array.from(new Set(data?.map((item) => item.month_year)))
      setPreviousMonths(uniqueMonths)
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

    try {
      const { error } = await supabase.from("expenses").insert({
        school_id: selectedSchoolId,
        month_year: selectedMonth,
        expense_name: newExpense.expense_name,
        amount: Number(newExpense.amount),
      })

      if (error) throw error

      setNewExpense({ expense_name: "", amount: "" })
      setShowAddExpenseForm(false)
      fetchExpenses()
    } catch (error) {
      console.error("Error adding expense:", error)
    }
  }

  const deleteExpense = async (expenseId: number) => {
    if (!confirm("Are you sure you want to delete this expense?")) {
      return
    }

    try {
      const { error } = await supabase.from("expenses").delete().eq("id", expenseId)

      if (error) throw error
      fetchExpenses()
    } catch (error) {
      console.error("Error deleting expense:", error)
    }
  }

  const copyFromPreviousMonth = async (previousMonth: string) => {
    if (!selectedSchoolId || !selectedMonth) return

    setCopyingExpenses(true)
    try {
      // Fetch expenses from the previous month
      const { data: previousExpenses, error: fetchError } = await supabase
        .from("expenses")
        .select("*")
        .eq("school_id", selectedSchoolId)
        .eq("month_year", previousMonth)

      if (fetchError) throw fetchError

      if (!previousExpenses || previousExpenses.length === 0) {
        alert("No expenses found in the selected month.")
        return
      }

      // Create new expenses for the current month
      const newExpenses = previousExpenses.map((expense) => ({
        school_id: selectedSchoolId,
        month_year: selectedMonth,
        expense_name: expense.expense_name,
        amount: expense.amount,
      }))

      const { error: insertError } = await supabase.from("expenses").insert(newExpenses)

      if (insertError) throw insertError

      fetchExpenses()
      alert(`Successfully copied ${newExpenses.length} expenses from ${formatMonthYear(previousMonth)}`)
    } catch (error) {
      console.error("Error copying expenses:", error)
      alert("Failed to copy expenses. Please try again.")
    } finally {
      setCopyingExpenses(false)
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
                      onClick={() => document.getElementById("copyMonthDropdown")?.click()}
                      className="w-full sm:w-auto"
                      disabled={copyingExpenses}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy From Previous Month
                    </Button>
                    <select
                      id="copyMonthDropdown"
                      className="absolute opacity-0 w-0 h-0"
                      onChange={(e) => {
                        if (e.target.value) {
                          copyFromPreviousMonth(e.target.value)
                          e.target.value = ""
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
            </div>

            {showAddExpenseForm && permissions.canCreate && (
              <Card className="mb-6 border-[#A2BD9D]">
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-4">Add New Expense</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      placeholder="Expense name"
                      value={newExpense.expense_name}
                      onChange={(e) => setNewExpense({ ...newExpense, expense_name: e.target.value })}
                      className="w-full"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Amount"
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                      className="w-full"
                    />
                    <div className="flex space-x-2">
                      <Button
                        onClick={addExpense}
                        className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                        disabled={!newExpense.expense_name || !newExpense.amount}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowAddExpenseForm(false)
                          setNewExpense({ expense_name: "", amount: "" })
                        }}
                        className="w-full sm:w-auto"
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
                <p className="text-gray-500">No expenses found for {formatMonthYear(selectedMonth)}</p>
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
                      <TableRow>
                        <TableHead>Expense Name</TableHead>
                        <TableHead>Amount</TableHead>
                        {permissions.canDelete && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell className="font-medium">{expense.expense_name}</TableCell>
                          <TableCell>${Number(expense.amount).toFixed(2)}</TableCell>
                          {permissions.canDelete && (
                            <TableCell>
                              <Button size="sm" variant="destructive" onClick={() => deleteExpense(expense.id)}>
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
                  <div className="bg-[#A2BD9D] text-white p-4 rounded-lg w-full sm:w-auto">
                    <div className="text-lg font-semibold text-center sm:text-left">
                      Total Expenses: ${totalExpenses.toFixed(2)}
                    </div>
                    <div className="text-sm opacity-90 text-center sm:text-left">{formatMonthYear(selectedMonth)}</div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

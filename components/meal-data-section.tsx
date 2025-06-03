"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, X } from "lucide-react"
import { supabase, type Meal, type MealItem } from "@/lib/supabase"

interface MealDataSectionProps {
  selectedSchoolId: number | null
}

export function MealDataSection({ selectedSchoolId }: MealDataSectionProps) {
  const [meals, setMeals] = useState<(Meal & { meal_items: MealItem[] })[]>([])
  const [loading, setLoading] = useState(false)
  const [editingItem, setEditingItem] = useState<{ mealId: number; itemId?: number } | null>(null)
  const [newItem, setNewItem] = useState({ item_name: "", unit_price: "", quantity: "" })
  const [showNewMealForm, setShowNewMealForm] = useState(false)
  const [newMealDate, setNewMealDate] = useState("")

  // Filter states
  const [singleDateFilter, setSingleDateFilter] = useState("")
  const [startDateFilter, setStartDateFilter] = useState("")
  const [endDateFilter, setEndDateFilter] = useState("")
  const [monthFilter, setMonthFilter] = useState("")

  useEffect(() => {
    if (selectedSchoolId) {
      fetchMeals()
    }
  }, [selectedSchoolId])

  const fetchMeals = async () => {
    if (!selectedSchoolId) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("meals")
        .select(`
          *,
          meal_items (*)
        `)
        .eq("school_id", selectedSchoolId)
        .order("date", { ascending: false })

      if (error) throw error
      setMeals(data || [])
    } catch (error) {
      console.error("Error fetching meals:", error)
    } finally {
      setLoading(false)
    }
  }

  const addMealItem = async (mealId: number) => {
    if (!newItem.item_name || !newItem.unit_price || !newItem.quantity) return

    try {
      const { error } = await supabase.from("meal_items").insert({
        meal_id: mealId,
        item_name: newItem.item_name,
        unit_price: Number.parseFloat(newItem.unit_price),
        quantity: Number.parseInt(newItem.quantity),
      })

      if (error) throw error

      setNewItem({ item_name: "", unit_price: "", quantity: "" })
      setEditingItem(null)
      fetchMeals()
    } catch (error) {
      console.error("Error adding meal item:", error)
    }
  }

  const deleteMealItem = async (itemId: number) => {
    try {
      const { error } = await supabase.from("meal_items").delete().eq("id", itemId)

      if (error) throw error
      fetchMeals()
    } catch (error) {
      console.error("Error deleting meal item:", error)
    }
  }

  const createNewMeal = async () => {
    if (!selectedSchoolId || !newMealDate) return

    try {
      // Check if meal already exists for this date and school
      const { data: existingMeal, error: checkError } = await supabase
        .from("meals")
        .select("id")
        .eq("school_id", selectedSchoolId)
        .eq("date", newMealDate)

      if (checkError) throw checkError

      if (existingMeal && existingMeal.length > 0) {
        alert("A meal entry already exists for this date. Please choose a different date.")
        return
      }

      const date = new Date(newMealDate)
      const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" })

      const { error } = await supabase.from("meals").insert({
        school_id: selectedSchoolId,
        date: newMealDate,
        day_of_week: dayOfWeek,
        total_cost: 0,
      })

      if (error) throw error

      setNewMealDate("")
      setShowNewMealForm(false)
      fetchMeals()
    } catch (error) {
      console.error("Error creating new meal:", error)
    }
  }

  const calculateMealTotal = (items: MealItem[]) => {
    return items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  }

  const deleteMeal = async (mealId: number) => {
    if (!confirm("Are you sure you want to delete this meal day? This will also delete all meal items.")) {
      return
    }

    try {
      const { error } = await supabase.from("meals").delete().eq("id", mealId)

      if (error) throw error
      fetchMeals()
    } catch (error) {
      console.error("Error deleting meal:", error)
    }
  }

  const clearAllFilters = () => {
    setSingleDateFilter("")
    setStartDateFilter("")
    setEndDateFilter("")
    setMonthFilter("")
  }

  const filteredMeals = meals.filter((meal) => {
    // Single date filter
    if (singleDateFilter) {
      return meal.date === singleDateFilter
    }

    // Date range filter
    if (startDateFilter && endDateFilter) {
      return meal.date >= startDateFilter && meal.date <= endDateFilter
    }

    // Month filter
    if (monthFilter) {
      const mealMonth = new Date(meal.date).toISOString().slice(0, 7)
      return mealMonth === monthFilter
    }

    return true
  })

  const hasActiveFilters = singleDateFilter || startDateFilter || endDateFilter || monthFilter

  if (!selectedSchoolId) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">Please select a school to view meal data</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <CardTitle className="text-[#A2BD9D]">Meal Data</CardTitle>
          <Button onClick={() => setShowNewMealForm(true)} className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add New Day
          </Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Single Date:</label>
            <Input
              type="date"
              value={singleDateFilter}
              onChange={(e) => {
                setSingleDateFilter(e.target.value)
                setStartDateFilter("")
                setEndDateFilter("")
                setMonthFilter("")
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Start Date:</label>
            <Input
              type="date"
              value={startDateFilter}
              onChange={(e) => {
                setStartDateFilter(e.target.value)
                setSingleDateFilter("")
                setMonthFilter("")
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">End Date:</label>
            <Input
              type="date"
              value={endDateFilter}
              onChange={(e) => {
                setEndDateFilter(e.target.value)
                setSingleDateFilter("")
                setMonthFilter("")
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Month/Year:</label>
            <Input
              type="month"
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value)
                setSingleDateFilter("")
                setStartDateFilter("")
                setEndDateFilter("")
              }}
              className="w-full"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={clearAllFilters} size="sm">
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {showNewMealForm && (
          <Card className="mb-4 border-[#A2BD9D]">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-4">Add New Meal Day</h3>
              <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
                <Input
                  type="date"
                  value={newMealDate}
                  onChange={(e) => setNewMealDate(e.target.value)}
                  className="w-full sm:w-48"
                />
                <Button
                  onClick={createNewMeal}
                  className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                  disabled={!newMealDate}
                >
                  Create Meal Day
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowNewMealForm(false)
                    setNewMealDate("")
                  }}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {loading ? (
          <div className="text-center py-8">Loading meals...</div>
        ) : (
          <div className="space-y-4">
            {filteredMeals.map((meal) => (
              <div key={meal.id} className="border rounded-lg p-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                  <div>
                    <h3 className="font-semibold">
                      {new Date(meal.date).toLocaleDateString()} - {meal.day_of_week}
                    </h3>
                    <Badge variant="outline" className="mt-1">
                      Total: ${calculateMealTotal(meal.meal_items).toFixed(2)}
                    </Badge>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button
                      size="sm"
                      onClick={() => setEditingItem({ mealId: meal.id })}
                      className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteMeal(meal.id)}
                      className="w-full sm:w-auto"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete Day
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {meal.meal_items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.item_name}</TableCell>
                          <TableCell>${item.unit_price.toFixed(2)}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>${(item.unit_price * item.quantity).toFixed(2)}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="destructive" onClick={() => deleteMealItem(item.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {editingItem?.mealId === meal.id && (
                        <TableRow>
                          <TableCell>
                            <Input
                              placeholder="Item name"
                              value={newItem.item_name}
                              onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={newItem.unit_price}
                              onChange={(e) => setNewItem({ ...newItem, unit_price: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              placeholder="0"
                              value={newItem.quantity}
                              onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            $
                            {(
                              Number.parseFloat(newItem.unit_price || "0") * Number.parseInt(newItem.quantity || "0")
                            ).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2">
                              <Button
                                size="sm"
                                onClick={() => addMealItem(meal.id)}
                                className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingItem(null)}
                                className="w-full sm:w-auto"
                              >
                                Cancel
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

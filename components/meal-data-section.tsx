"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, X, Loader2 } from "lucide-react"
import type { Meal, MealItem } from "@/lib/supabase"
import { useSchoolPermissions } from "@/hooks/use-school-permissions"

interface MealDataSectionProps {
  selectedSchoolId: number | null
}

export function MealDataSection({ selectedSchoolId }: MealDataSectionProps) {
  const EXCHANGE_RATE = 300 // PKR to USD
  const { permissions, loading: loadingPermissions } = useSchoolPermissions(selectedSchoolId)
  const [meals, setMeals] = useState<(Meal & { meal_items: MealItem[] })[]>([])
  const [loading, setLoading] = useState(false)
  const [operationLoading, setOperationLoading] = useState(false)
  const [editingItem, setEditingItem] = useState<{ mealId: number; itemId?: number } | null>(null)
  const [newItem, setNewItem] = useState({ item_name: "", unit_price: "", quantity: "" })
  const [showNewMealForm, setShowNewMealForm] = useState(false)
  const [newMealDate, setNewMealDate] = useState("")

  // Filter states
  const [monthFilter, setMonthFilter] = useState("")

  const useEffect = (effect: any, deps: any) => {
    // Implementation of useEffect
  }

  const fetchMeals = async (month: string = monthFilter) => {
    if (!selectedSchoolId || !month) return

    setLoading(true)
    try {
      const res = await fetch(`/api/meals?school_id=${selectedSchoolId}&month=${month}`)
      if (!res.ok) {
        throw new Error("Failed to fetch meals")
      }
      const data = await res.json()
      setMeals(data || [])
    } catch (error) {
      console.error("Error fetching meals:", error)
    } finally {
      setLoading(false)
    }
  }

  const addMealItem = async (mealId: number) => {
    if (!permissions.canEdit || !newItem.item_name || !newItem.unit_price || !newItem.quantity) return

    setOperationLoading(true)
    try {
      const res = await fetch("/api/meal-items/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meal_id: mealId,
          item_name: newItem.item_name,
          unit_price: (Number.parseFloat(newItem.unit_price) / EXCHANGE_RATE).toString(),
          quantity: newItem.quantity,
        }),
      })

      if (!res.ok) {
        throw new Error("Failed to add meal item")
      }

      setNewItem({ item_name: "", unit_price: "", quantity: "" })
      setEditingItem(null)
      fetchMeals(monthFilter)
    } catch (error) {
      console.error("Error adding meal item:", error)
    } finally {
      setOperationLoading(false)
    }
  }

  const deleteMealItem = async (itemId: number) => {
    if (!permissions.canDelete) return

    setOperationLoading(true)
    try {
      const res = await fetch("/api/meal-items/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      })

      if (!res.ok) throw new Error("Failed to delete meal item")

      fetchMeals()
    } catch (error) {
      console.error("Error deleting meal item:", error)
    } finally {
      setOperationLoading(false)
    }
  }

  const createNewMeal = async () => {
    if (!permissions.canCreate || !selectedSchoolId || !newMealDate) return

    setOperationLoading(true)
    try {
      const res = await fetch("/api/meals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: selectedSchoolId, date: newMealDate }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert(data.error || "Failed to create new meal.")
        return
      }

      setNewMealDate("")
      setShowNewMealForm(false)
      fetchMeals()
    } catch (error) {
      console.error("Error creating new meal:", error)
    } finally {
      setOperationLoading(false)
    }
  }

  const calculateMealTotal = (items: MealItem[]) => {
    return items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  }

  const deleteMeal = async (mealId: number) => {
    if (!permissions.canDelete) return

    if (!confirm("Are you sure you want to delete this meal day? This will also delete all meal items.")) {
      return
    }

    setOperationLoading(true)
    try {
      const res = await fetch(`/api/meals/delete?mealId=${mealId}`, {
        method: "DELETE",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete meal")
      }

      fetchMeals()
    } catch (error) {
      console.error("Error deleting meal:", error)
    } finally {
      setOperationLoading(false)
    }
  }

  const filteredMeals = meals // Remove the filtering since API now handles it

  if (!selectedSchoolId) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">Please select a school to view meal data</p>
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
            <CardTitle className="text-[#A2BD9D]">Meal Data</CardTitle>
            {permissions.canCreate&&monthFilter&& (
              <Button
                onClick={() => setShowNewMealForm(true)}
                className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add New Day
              </Button>
            )}
          </div>

          {/* Month/Year Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4 p-3 bg-gray-50 rounded-lg border">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Filter by Month:</label>
              <Input
                type="month"
                value={monthFilter}
                onChange={(e) => {
                  setMonthFilter(e.target.value)
                  if (e.target.value && selectedSchoolId) {
                    console.log("calling fetchMeals with ", e.target.value)
                    fetchMeals(e.target.value)
                  }
                }}
                className="w-full sm:w-44 h-9 text-sm border-gray-300 focus:border-[#A2BD9D] focus:ring-[#A2BD9D]"
                placeholder="Select month..."
              />
            </div>
            {monthFilter && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMonthFilter("")
                  setMeals([])
                }}
                className="h-9 px-2 text-xs flex items-center gap-1 whitespace-nowrap self-start sm:self-auto"
              >
                <X className="h-3 w-3 flex-shrink-0" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {showNewMealForm && permissions.canCreate && (
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
          {!monthFilter ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-2">📅</div>
              <p className="text-gray-500 font-medium">Select a month to view meal data</p>
              <p className="text-gray-400 text-sm">Choose a month and year from the filter above</p>
            </div>
          ) : loading ? (
            <div className="text-center py-8">Loading meals...</div>
          ) : filteredMeals.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-2">🍽️</div>
              <p className="text-gray-500 font-medium">No meal data found</p>
              <p className="text-gray-400 text-sm">No meals recorded for the selected month</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMeals.map((meal) => (
                <div key={meal.id} className="border rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <div>
                      <h3 className="font-semibold">
                        {new Date(meal.date).toLocaleDateString()} - {meal.day_of_week}
                      </h3>
                      <div className="mt-1 space-y-1">
                        <Badge variant="outline" className="text-base font-semibold">
                          Total: ₨{(calculateMealTotal(meal.meal_items) * EXCHANGE_RATE).toFixed(0)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      {permissions.canEdit && (
                        <Button
                          size="sm"
                          onClick={() => setEditingItem({ mealId: meal.id })}
                          className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Item
                        </Button>
                      )}
                      {permissions.canDelete && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMeal(meal.id)}
                          className="w-full sm:w-auto"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete Day
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Unit Price (PKR Input)</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Total</TableHead>
                          {permissions.canDelete && <TableHead>Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {meal.meal_items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.item_name}</TableCell>
                            <TableCell>₨{(item.unit_price * EXCHANGE_RATE).toFixed(0)}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>₨{(item.unit_price * EXCHANGE_RATE * item.quantity).toFixed(0)}</TableCell>
                            {permissions.canDelete && (
                              <TableCell>
                                <Button size="sm" variant="destructive" onClick={() => deleteMealItem(item.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                        {editingItem?.mealId === meal.id && permissions.canEdit && (
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
                                placeholder="0.00 PKR"
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
                              ₨
                              {(
                                Number.parseFloat(newItem.unit_price || "0") * Number.parseInt(newItem.quantity || "0")
                              ).toFixed(0)}
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
    </div>
  )
}

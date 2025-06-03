"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2 } from "lucide-react"
import { supabase, type Meal, type MealItem } from "@/lib/supabase"

interface MealDataSectionProps {
  selectedSchoolId: number | null
}

export function MealDataSection({ selectedSchoolId }: MealDataSectionProps) {
  const [meals, setMeals] = useState<(Meal & { meal_items: MealItem[] })[]>([])
  const [loading, setLoading] = useState(false)
  const [editingItem, setEditingItem] = useState<{ mealId: number; itemId?: number } | null>(null)
  const [newItem, setNewItem] = useState({ item_name: "", unit_price: "", quantity: "" })

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

  const calculateMealTotal = (items: MealItem[]) => {
    return items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  }

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
        <CardTitle className="text-[#A2BD9D]">Meal Data</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">Loading meals...</div>
        ) : (
          <div className="space-y-4">
            {meals.map((meal) => (
              <div key={meal.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-semibold">
                      {new Date(meal.date).toLocaleDateString()} - {meal.day_of_week}
                    </h3>
                    <Badge variant="outline" className="mt-1">
                      Total: ${calculateMealTotal(meal.meal_items).toFixed(2)}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setEditingItem({ mealId: meal.id })}
                    className="bg-[#A2BD9D] hover:bg-[#8FA889]"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>
                </div>

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
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              onClick={() => addMealItem(meal.id)}
                              className="bg-[#A2BD9D] hover:bg-[#8FA889]"
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>
                              Cancel
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

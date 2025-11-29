"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, X, Loader2, File, FileText } from "lucide-react"
import type { Meal, MealItem } from "@/lib/supabase"
import { useSchoolPermissions } from "@/hooks/use-school-permissions"
import { LoadingOverlay } from "./LoadingOverlay"
import { MonthFilter } from "./MonthFilter"
import { AddMealDayForm } from "./AddMealDayForm"
import { MealDayList } from "./MealDayList"
import { calculateMealTotal, fetchMeals as fetchMealsHelper, addMealItem as addMealItemHelper } from "./helpers/mealDataHelpers"
import { ExcelUploadComponent } from "./excel-upload-component"
import { ExportMealDataForm } from "./ExportMealDataForm"

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
  const [showExportMealDataForm, setShowExportMealDataForm] = useState(false)
  const [newMealDate, setNewMealDate] = useState("")
  const [exportStartDate,setExportStartDate]=useState("")
  const [exportEndDate,setExportEndDate]=useState("")



  // Filter states
  const [monthFilter, setMonthFilter] = useState("")

  const fetchMeals = (month: string = monthFilter) =>
    fetchMealsHelper(selectedSchoolId, month, setLoading, setMeals)

  const addMealItem = (mealId: number) =>
    addMealItemHelper(mealId, permissions, newItem, setOperationLoading, setNewItem, setEditingItem, fetchMeals, monthFilter)
const exportMealData = () => {
  if (!selectedSchoolId || !exportStartDate || !exportEndDate) return;

  setOperationLoading(true);

  // Build the URL
  const url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/meals/export?schoolId=${selectedSchoolId}&startDate=${exportStartDate}&endDate=${exportEndDate}`;

  // Redirect browser → triggers file download
  window.location.href = url;

  // Reset UI
  setExportStartDate("");
  setExportEndDate("");
  setShowExportMealDataForm(false);

  setOperationLoading(false);
};


  const deleteMealItem = async (itemId: number) => {
    if (!permissions.canDelete) return

    setOperationLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/meal-items/delete`, {
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/meals/create`, {
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

  const deleteMeal = async (mealId: number) => {
    if (!permissions.canDelete) return

    if (!confirm("Are you sure you want to delete this meal day? This will also delete all meal items.")) {
      return
    }

    setOperationLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/meals/delete?mealId=${mealId}`, {
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

  const updateMealItem = async (meal: any, itemId: number, mealId: number) => {
    console.log("🚀 updateMealItem called with:", { itemId, mealId })

    //@ts-ignore
    const item = meal?.meal_items?.find((i) => i.id == itemId)
    console.log(meals)
    if (!item) {
      console.warn("⚠️ No item found with that ID in meals")
      return
    }

    console.log("✅ Found item to update:", item)

    const updatedItem = {
      item_name: newItem.item_name || item.item_name,
      unit_price: newItem.unit_price || item.unit_price.toString(),
      quantity: newItem.quantity || item.quantity.toString(),
    }

    console.log("📦 Final item values being submitted:", updatedItem)

    const payload = {
      itemId,
      meal_id: mealId,
      item_name: updatedItem.item_name,
      unit_price: parseFloat(updatedItem.unit_price), // Already in PKR now
      quantity: parseInt(updatedItem.quantity),
    }

    console.log("📤 Payload to be sent to backend:", payload)

    setOperationLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/meal-items/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      console.log("📡 Fetch response status:", res.status)

      if (!res.ok) {
        const errorText = await res.text()
        console.error("❌ Backend returned error:", errorText)
        throw new Error("Failed to update meal item")
      }

      console.log("✅ Meal item updated successfully!")

      // Reset state
      setNewItem({ item_name: "", unit_price: "", quantity: "" })
      setEditingItem(null)

      console.log("🔁 Fetching meals again to update UI")
      fetchMeals()
    } catch (err) {
      console.error("🔥 Error updating meal item:", err)
    } finally {
      setOperationLoading(false)
    }
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
      {operationLoading && <LoadingOverlay />}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-[#A2BD9D]">Meal Data</CardTitle>
           <div className="flex flex-row items-center space-x-4 justify-center">
            {permissions.canCreate && monthFilter && (
              <Button
                onClick={() => {
                  setShowExportMealDataForm(false)
                  setShowNewMealForm(true)}}
                className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add New Day
              </Button>
            )}
            <Button
                onClick={() => {
                  setShowNewMealForm(false)
                  setShowExportMealDataForm(true)
                  }
                }
                className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
              >
                
                <FileText className="h-4 w-4 mr-2" />
                Export Data
              </Button>
              </div>
          </div>
          {/* Month/Year Selector */}
          <MonthFilter
            monthFilter={monthFilter}
            setMonthFilter={setMonthFilter}
            setMeals={setMeals}
            selectedSchoolId={selectedSchoolId}
            fetchMeals={fetchMeals}
          />
        </CardHeader>
        <CardContent>
          {showNewMealForm && permissions.canCreate && (
            <AddMealDayForm
              newMealDate={newMealDate}
              setNewMealDate={setNewMealDate}
              onCreate={createNewMeal}
              onCancel={() => {
                setShowNewMealForm(false)
                setNewMealDate("")
              }}
              disabled={operationLoading}
            />
          )}
          {showExportMealDataForm && (
            <ExportMealDataForm
           startDate={exportStartDate}
           endDate={exportEndDate}
           setStartDate={setExportStartDate}
           setEndDate={setExportEndDate}
           onExport={exportMealData}
           onCancel={() => {
                setShowExportMealDataForm(false)
                setExportEndDate("")
                setExportStartDate("")
              }}
              disabled={operationLoading}
            />
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
            <MealDayList
              meals={filteredMeals}
              permissions={permissions}
              calculateMealTotal={calculateMealTotal}
              setEditingItem={setEditingItem}
              setNewItem={setNewItem}
              deleteMeal={deleteMeal}
              editingItem={editingItem}
              newItem={newItem}
              updateMealItem={updateMealItem}
              deleteMealItem={deleteMealItem}
              addMealItem={addMealItem}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

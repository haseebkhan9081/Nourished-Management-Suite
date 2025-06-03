"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { supabase } from "@/lib/supabase"

interface BillingSectionProps {
  selectedSchoolId: number | null
}

interface BillingItem {
  item_name: string
  unit_price: number
  total_quantity: number
  total_cost: number
  meal_date: string
}

export function BillingSection({ selectedSchoolId }: BillingSectionProps) {
  const [selectedMonth, setSelectedMonth] = useState("")
  const [billingData, setBillingData] = useState<BillingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [totalAmount, setTotalAmount] = useState(0)

  useEffect(() => {
    if (selectedSchoolId && selectedMonth) {
      fetchBillingData()
    }
  }, [selectedSchoolId, selectedMonth])

  const fetchBillingData = async () => {
    if (!selectedSchoolId || !selectedMonth) return

    setLoading(true)
    try {
      // Get start and end dates for the selected month
      const startDate = `${selectedMonth}-01`
      const endDate = new Date(selectedMonth + "-01")
      endDate.setMonth(endDate.getMonth() + 1)
      endDate.setDate(0) // Last day of the month
      const endDateStr = endDate.toISOString().split("T")[0]

      const { data, error } = await supabase
        .from("meals")
        .select(`
          date,
          meal_items (
            item_name,
            unit_price,
            quantity
          )
        `)
        .eq("school_id", selectedSchoolId)
        .gte("date", startDate)
        .lte("date", endDateStr)
        .order("date", { ascending: true })

      if (error) throw error

      // Process the data to create billing items
      const itemMap = new Map<string, BillingItem>()
      let total = 0

      data?.forEach((meal) => {
        meal.meal_items?.forEach((item) => {
          const key = `${item.item_name}-${item.unit_price}`
          const itemTotal = item.unit_price * item.quantity
          total += itemTotal

          if (itemMap.has(key)) {
            const existing = itemMap.get(key)!
            existing.total_quantity += item.quantity
            existing.total_cost += itemTotal
          } else {
            itemMap.set(key, {
              item_name: item.item_name,
              unit_price: item.unit_price,
              total_quantity: item.quantity,
              total_cost: itemTotal,
              meal_date: meal.date,
            })
          }
        })
      })

      setBillingData(Array.from(itemMap.values()))
      setTotalAmount(total)
    } catch (error) {
      console.error("Error fetching billing data:", error)
    } finally {
      setLoading(false)
    }
  }

  // Generate month options for the current year and next year
  const generateMonthOptions = () => {
    const options = []
    const currentYear = new Date().getFullYear()

    for (let year = currentYear; year <= currentYear + 1; year++) {
      for (let month = 1; month <= 12; month++) {
        const monthStr = month.toString().padStart(2, "0")
        const value = `${year}-${monthStr}`
        const label = new Date(year, month - 1).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
        })
        options.push({ value, label })
      }
    }

    return options
  }

  if (!selectedSchoolId) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">Please select a school to view billing data</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-[#A2BD9D]">Monthly Billing</CardTitle>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium">Select Month:</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-48 border-[#A2BD9D] focus:ring-[#A2BD9D]">
                <SelectValue placeholder="Select month..." />
              </SelectTrigger>
              <SelectContent>
                {generateMonthOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!selectedMonth ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Please select a month to view billing details</p>
          </div>
        ) : loading ? (
          <div className="text-center py-8">Loading billing data...</div>
        ) : billingData.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No meal data found for the selected month</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Total Quantity</TableHead>
                  <TableHead>Total Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {billingData.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.item_name}</TableCell>
                    <TableCell>${item.unit_price.toFixed(2)}</TableCell>
                    <TableCell>{item.total_quantity}</TableCell>
                    <TableCell>${item.total_cost.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-6 flex justify-end">
              <div className="bg-[#A2BD9D] text-white p-4 rounded-lg">
                <div className="text-lg font-semibold">Monthly Total: ${totalAmount.toFixed(2)}</div>
                <div className="text-sm opacity-90">
                  {new Date(selectedMonth + "-01").toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

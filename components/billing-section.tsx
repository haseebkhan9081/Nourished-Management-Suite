"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"

interface BillingSectionProps {
  selectedSchoolId: number | null
}

interface BillingItem {
  item_name: string
  unit_price: number
  quantity: number
  total_cost: number
  date: string
}

interface GroupedBillingData {
  [date: string]: {
    items: BillingItem[]
    subtotal: number
  }
}

export function BillingSection({ selectedSchoolId }: BillingSectionProps) {
  const [selectedMonth, setSelectedMonth] = useState("")
  const [groupedBillingData, setGroupedBillingData] = useState<GroupedBillingData>({})
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

      // Group data by date
      const grouped: GroupedBillingData = {}
      let total = 0

      data?.forEach((meal) => {
        const mealDate = meal.date
        if (!grouped[mealDate]) {
          grouped[mealDate] = {
            items: [],
            subtotal: 0,
          }
        }

        meal.meal_items?.forEach((item) => {
          const itemTotal = item.unit_price * item.quantity
          total += itemTotal

          grouped[mealDate].items.push({
            item_name: item.item_name,
            unit_price: item.unit_price,
            quantity: item.quantity,
            total_cost: itemTotal,
            date: mealDate,
          })

          grouped[mealDate].subtotal += itemTotal
        })
      })

      setGroupedBillingData(grouped)
      setTotalAmount(total)
    } catch (error) {
      console.error("Error fetching billing data:", error)
    } finally {
      setLoading(false)
    }
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <CardTitle className="text-[#A2BD9D]">Monthly Billing</CardTitle>
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
            <p className="text-gray-500">Please select a month to view billing details</p>
          </div>
        ) : loading ? (
          <div className="text-center py-8">Loading billing data...</div>
        ) : Object.keys(groupedBillingData).length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No meal data found for the selected month</p>
          </div>
        ) : (
          <>
            <div className="space-y-6">
              {Object.entries(groupedBillingData)
                .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                .map(([date, data]) => (
                  <div key={date} className="border rounded-lg p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">
                        {new Date(date).toLocaleDateString("en-US", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </h3>
                      <Badge variant="outline" className="text-sm">
                        Subtotal: ${data.subtotal.toFixed(2)}
                      </Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item Name</TableHead>
                            <TableHead>Unit Price</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Total Cost</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.items.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{item.item_name}</TableCell>
                              <TableCell>${item.unit_price.toFixed(2)}</TableCell>
                              <TableCell>{item.quantity}</TableCell>
                              <TableCell>${item.total_cost.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
            </div>
            <div className="mt-6 flex justify-end">
              <div className="bg-[#A2BD9D] text-white p-4 rounded-lg w-full sm:w-auto">
                <div className="text-lg font-semibold text-center sm:text-left">
                  Monthly Total: ${totalAmount.toFixed(2)}
                </div>
                <div className="text-sm opacity-90 text-center sm:text-left">
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

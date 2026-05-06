"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { LoadingOverlay } from "@/components/LoadingOverlay"
import { BillingMonthSelector } from "@/components/BillingMonthSelector"
import { BillingTable } from "@/components/BillingTable"
import { BillingPDFDialog } from "@/components/BillingPDFDialog"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Download } from "lucide-react"
import { useSchoolPermissions } from "@/hooks/use-school-permissions"

interface BillingSectionProps {
  selectedSchoolId: number | null
  schoolNamep:string|null

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

// Helper to format YYYY-MM-DD as readable string without Date object


export function BillingSection({ selectedSchoolId, schoolNamep }: BillingSectionProps) {
  const EXCHANGE_RATE = 300 // USD to PKR
  const { permissions, loading: loadingPermissions } = useSchoolPermissions(selectedSchoolId)
  const [selectedMonth, setSelectedMonth] = useState("")
  const [groupedBillingData, setGroupedBillingData] = useState<GroupedBillingData>({})
  const [loading, setLoading] = useState(false)
  const [totalAmount, setTotalAmount] = useState(0)
  const [schoolName, setSchoolName] = useState(schoolNamep)
  const [showProviderDialog, setShowProviderDialog] = useState(false)
  const [mealProviderName, setMealProviderName] = useState("")
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("en-PK", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  }

  useEffect(() => {
    if (selectedSchoolId && selectedMonth) {
      fetchBillingData()
    }
  }, [selectedSchoolId, selectedMonth])

  const fetchBillingData = async () => {
    if (!selectedSchoolId || !selectedMonth) return

    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/billing/${selectedSchoolId}?month=${selectedMonth}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Unknown error")

      // Group data by date
      const grouped: GroupedBillingData = {}
      let total = 0
console.log("billing meal data ",data)
      data.forEach((meal: any) => {
        const mealDate = meal.date
        if (!grouped[mealDate]) {
          grouped[mealDate] = {
            items: [],
            subtotal: 0,
          }
        }

        meal.meal_items.forEach((item: any) => {
          // Convert USD to PKR for display
          const unitPricePKR = item.unit_price 
          const itemTotal = unitPricePKR * item.quantity
          total += itemTotal

          grouped[mealDate].items.push({
            item_name: item.item_name,
            unit_price: unitPricePKR,
            quantity: item.quantity,
            total_cost: itemTotal,
            date: mealDate,
          })

          grouped[mealDate].subtotal += itemTotal
        })
      })

      setGroupedBillingData(grouped)
      setTotalAmount(total)

      // Fetch school name if needed
      if (data.length > 0 && data[0].school_name) {
        setSchoolName(data[0].school_name)
      }
    } catch (error) {
      console.error("Error fetching billing data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadClick = () => {
    setInvoiceError(null)
    setShowProviderDialog(true)
  }

  const handleDialogOpenChange = (open: boolean) => {
    if (generatingInvoice) return
    if (!open) {
      setMealProviderName("")
      setInvoiceError(null)
    }
    setShowProviderDialog(open)
  }

  const generatePDF = async () => {
    if (!mealProviderName.trim() || !selectedSchoolId || !selectedMonth) return

    setGeneratingInvoice(true)
    setInvoiceError(null)

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/billing/invoice/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schoolId: selectedSchoolId,
            month: selectedMonth,
            mealProviderName: mealProviderName.trim(),
          }),
        },
      )

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate invoice")
      }
      if (!data.downloadUrl) {
        throw new Error("Backend did not return a download URL")
      }

      window.location.href = data.downloadUrl

      setShowProviderDialog(false)
      setMealProviderName("")
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : "Failed to generate invoice")
    } finally {
      setGeneratingInvoice(false)
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
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-white p-1 rounded-md shadow-sm">
                <img src="/images/nourished-logo.png" alt="Nourished Welfare Trust" className="h-8 w-auto" />
              </div>
              <CardTitle className="text-[#A2BD9D]">Monthly Billing</CardTitle>
            </div>
            <BillingMonthSelector
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
            />
          </div>
        </CardHeader>
        <CardContent>
          {!selectedMonth ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Please select a month to view billing details</p>
            </div>
          ) : loading ? (
            <LoadingOverlay />
          ) : Object.keys(groupedBillingData).length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No meal data found for the selected month</p>
            </div>
          ) : (
            <>
              <BillingTable
                groupedBillingData={groupedBillingData}
              />
              <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                <Button
                  onClick={handleDownloadClick}
                  className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white flex items-center gap-2 w-full sm:w-auto shadow-sm"
                >
                  <Download className="h-4 w-4" />
                  Download PDF Invoice
                </Button>
                <div className="bg-gradient-to-r from-[#A2BD9D] to-[#8FA889] text-white p-4 rounded-lg w-full sm:w-auto shadow-sm">
                  <div className="text-lg font-semibold text-center sm:text-left">
                    Monthly Total: ₨{formatCurrency(totalAmount)}
                  </div>
                  <div className="text-sm opacity-90 text-center sm:text-left">
                    {schoolNamep} •{" "}
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

      {/* Meal Provider Dialog */}
      <BillingPDFDialog
        open={showProviderDialog}
        onOpenChange={handleDialogOpenChange}
        mealProviderName={mealProviderName}
        setMealProviderName={setMealProviderName}
        schoolName={schoolNamep}
        selectedMonth={selectedMonth}
        onGeneratePDF={generatePDF}
        isGenerating={generatingInvoice}
        errorMessage={invoiceError}
      />
    </>
  );
}

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
    setShowProviderDialog(true)
  }

  const generatePDF = async () => {
    if (!mealProviderName.trim()) {
      alert("Please enter the meal provider's name")
      return
    }

    try {
      // Dynamic import to avoid SSR issues
      const jsPDF = (await import("jspdf")).default
      const doc = new jsPDF()

      // PDF styling constants
      const pageWidth = doc.internal.pageSize.width
      const pageHeight = doc.internal.pageSize.height
      const margin = 20
      const contentWidth = pageWidth - margin * 2
      let yPosition = margin

      // Helper function to check if we need a new page
      const checkPageBreak = (requiredHeight: number) => {
        if (yPosition + requiredHeight > pageHeight - margin) {
          doc.addPage()
          yPosition = margin
          return true
        }
        return false
      }

      // Load and add logo
      try {
        const logoImg = new Image()
        logoImg.crossOrigin = "anonymous"

        await new Promise((resolve, reject) => {
          logoImg.onload = resolve
          logoImg.onerror = reject
          logoImg.src = "/images/nourished-logo.png"
        })

        // Clean white header
        doc.setFillColor(255, 255, 255) // White background
        doc.rect(0, 0, pageWidth, 50, "F")

        // Add subtle border at bottom of header
        doc.setDrawColor(162, 189, 157)
        doc.setLineWidth(2)
        doc.line(0, 50, pageWidth, 50)

        // Add logo to header
        const logoWidth = 35
        const logoHeight = 20
        const logoX = margin
        const logoY = 10

        doc.addImage(logoImg, "PNG", logoX, logoY, logoWidth, logoHeight)

        // Company name next to logo
        doc.setFontSize(20)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(162, 189, 157) // Primary color for text
        doc.text("Nourished Welfare Trust", logoX + logoWidth + 10, 20)

        // Invoice title
        doc.setFontSize(26)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(40, 40, 40) // Dark gray
        doc.text("MEAL SERVICE INVOICE", pageWidth / 2, 35, { align: "center" })

        doc.setFontSize(11)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(100, 100, 100) // Light gray
        doc.text("Payment Confirmation & Cross-Check", pageWidth / 2, 43, { align: "center" })

        yPosition = 65
      } catch (logoError) {
        console.warn("Could not load logo, proceeding without it:", logoError)

        // Fallback header without logo - also white
        doc.setFillColor(255, 255, 255)
        doc.rect(0, 0, pageWidth, 40, "F")

        // Add subtle border
        doc.setDrawColor(162, 189, 157)
        doc.setLineWidth(2)
        doc.line(0, 40, pageWidth, 40)

        doc.setFontSize(26)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(40, 40, 40)
        doc.text("MEAL SERVICE INVOICE", pageWidth / 2, 22, { align: "center" })

        doc.setFontSize(11)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(100, 100, 100)
        doc.text("Payment Confirmation & Cross-Check", pageWidth / 2, 30, { align: "center" })
        yPosition = 55
      }

      // Invoice details section
      const invoiceDate = new Date().toLocaleDateString("en-PK", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
      const monthYear = new Date(selectedMonth + "-01").toLocaleDateString("en-PK", {
        year: "numeric",
        month: "long",
      })

      // Organization details (Payer)
      doc.setFontSize(14)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(162, 189, 157)
      doc.text("PAYING ENTITY", margin, yPosition)
      yPosition += 8

      doc.setFont("helvetica", "bold")
      doc.setFontSize(12)
      doc.setTextColor(40, 40, 40)
      doc.text("Nourished Welfare Trust", margin, yPosition)
      yPosition += 6

      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      doc.text("Email: info@nourishedusa.org", margin, yPosition)
      yPosition += 6
      doc.text(`School: ${schoolNamep}`, margin, yPosition)
      yPosition += 15

      // Service provider details
      doc.setFontSize(14)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(162, 189, 157)
      doc.text("SERVICE PROVIDER", margin, yPosition)
      yPosition += 8

      doc.setFont("helvetica", "bold")
      doc.setFontSize(12)
      doc.setTextColor(40, 40, 40)
      doc.text(mealProviderName, margin, yPosition)
      yPosition += 15

      // Invoice info box
      doc.setFillColor(248, 249, 250)
      doc.rect(margin, yPosition, contentWidth, 25, "F")
      doc.setDrawColor(162, 189, 157)
      doc.setLineWidth(1)
      doc.rect(margin, yPosition, contentWidth, 25, "S")

      doc.setFont("helvetica", "bold")
      doc.setFontSize(10)
      doc.setTextColor(40, 40, 40)
      doc.text("INVOICE DATE:", margin + 5, yPosition + 8)
      doc.text("SERVICE PERIOD:", margin + 5, yPosition + 16)
      doc.text("TOTAL AMOUNT:", margin + 100, yPosition + 12)

      doc.setFont("helvetica", "normal")
      doc.text(invoiceDate, margin + 35, yPosition + 8)
      doc.text(monthYear, margin + 40, yPosition + 16)

      doc.setFont("helvetica", "bold")
      doc.setFontSize(12)
      doc.setTextColor(162, 189, 157)
      doc.text(`PKR ${formatCurrency(totalAmount)}`, margin + 135, yPosition + 12)
      yPosition += 35

      // Table header
      checkPageBreak(50)
      doc.setFillColor(162, 189, 157)
      doc.rect(margin, yPosition, contentWidth, 12, "F")

      doc.setFont("helvetica", "bold")
      doc.setFontSize(10)
      doc.setTextColor(255, 255, 255)
      doc.text("DATE", margin + 3, yPosition + 8)
      doc.text("ITEM DESCRIPTION", margin + 35, yPosition + 8)
      doc.text("UNIT PRICE", margin + 110, yPosition + 8)
      doc.text("QTY", margin + 140, yPosition + 8)
      doc.text("TOTAL", margin + 160, yPosition + 8)
      yPosition += 15

      // Table content - Show ALL items for each day
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      doc.setTextColor(40, 40, 40)

      const sortedDates = Object.entries(groupedBillingData).sort(
        ([a], [b]) => a.localeCompare(b)
      );

      let rowIndex = 0
      for (const [date, data] of sortedDates) {
        // Use string formatting only, never Date object
        // Use:
const formattedDate = new Date(date).toLocaleDateString("en-PK", { month: "short", day: "numeric" })
        // Show each item for this date
        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i]
          checkPageBreak(10)

          // Alternating row background
          if (rowIndex % 2 === 0) {
            doc.setFillColor(252, 252, 252)
            doc.rect(margin, yPosition - 2, contentWidth, 10, "F")
          }

          // Show date only for first item of each day
          if (i === 0) {
            doc.setFont("helvetica", "bold")
            doc.text(formattedDate, margin + 3, yPosition + 6)
            doc.setFont("helvetica", "normal")
          }

          // Item details
          doc.text(item.item_name, margin + 35, yPosition + 6)
          doc.text(`PKR ${formatCurrency(item.unit_price)}`, margin + 110, yPosition + 6)
          doc.text(item.quantity.toString(), margin + 143, yPosition + 6)
          doc.text(`PKR ${formatCurrency(item.total_cost)}`, margin + 160, yPosition + 6)

          // Draw row separator
          doc.setDrawColor(230, 230, 230)
          doc.setLineWidth(0.3)
          doc.line(margin, yPosition + 8, pageWidth - margin, yPosition + 8)

          yPosition += 10
          rowIndex++
        }

        
      }

      // Final total section
      checkPageBreak(30)
      yPosition += 10
      doc.setFillColor(162, 189, 157)
      doc.rect(margin, yPosition, contentWidth, 20, "F")

      doc.setFont("helvetica", "bold")
      doc.setFontSize(16)
      doc.setTextColor(255, 255, 255)
      doc.text("TOTAL AMOUNT DUE", margin + 10, yPosition + 8)
      doc.text(`PKR ${formatCurrency(totalAmount)}`, pageWidth - margin - 10, yPosition + 8, { align: "right" })

      doc.setFontSize(10)
      doc.text(`Service Period: ${monthYear}`, margin + 10, yPosition + 16)
      doc.text(`Total Days: ${Object.keys(groupedBillingData).length}`, pageWidth - margin - 10, yPosition + 16, {
        align: "right",
      })

      // Footer with logo reference
      yPosition = pageHeight - 25
      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100, 100, 100)
      doc.text(
        "This invoice serves as payment confirmation and cross-check for meal services provided to our school.",
        pageWidth / 2,
        yPosition,
        { align: "center" },
      )
      doc.text("Nourished Education Inc. | info@nourishedusa.org", pageWidth / 2, yPosition + 6, {
        align: "center",
      })

      // Save the PDF
      const fileName = `meal-invoice-${mealProviderName.replace(/\s+/g, "-")}-${selectedMonth}.pdf`
      doc.save(fileName)

      // Close dialog and reset
      setShowProviderDialog(false)
      setMealProviderName("")
    } catch (error) {
      console.error("Error generating PDF:", error)
      alert("Error generating PDF. Please try again.")
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
                <img src="/images/nourished-logo.png" alt="Nourished Education" className="h-8 w-auto" />
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
        onOpenChange={setShowProviderDialog}
        mealProviderName={mealProviderName}
        setMealProviderName={setMealProviderName}
        schoolName={schoolNamep}
        selectedMonth={selectedMonth}
        onGeneratePDF={generatePDF}
      />
    </>
  );
}

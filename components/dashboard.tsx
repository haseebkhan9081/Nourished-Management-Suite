"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SchoolSelector } from "./school-selector"
import { MealDataSection } from "./meal-data-section"
import { AttendanceDataSection } from "./attendance-data-section"
import { BillingSection } from "./billing-section"
import { ExpensesSection } from "./expenses-section"
import { SchoolManagementSection } from "./school-management-section"

// Add the useSchoolPermissions hook import
import { useSchoolPermissions } from "@/hooks/use-school-permissions"

// Update the Dashboard component to include role information
export function Dashboard() {
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null)
  const { role } = useSchoolPermissions(selectedSchoolId)
  const [selectedSchoolName,setSelectedSchoolName] = useState<string | null>("")

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="w-full sm:w-auto flex flex-col items-center sm:items-start text-center sm:text-left">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h2>
          {selectedSchoolId && (
            <p className="text-sm text-gray-500">
              Your role: <span className="font-medium capitalize">{role}</span>
            </p>
          )}
        </div>
        <div className="w-full sm:w-auto flex justify-center sm:justify-end">
          <SchoolSelector 
            setSelectedSchoolName={setSelectedSchoolName}
            selectedSchoolId={selectedSchoolId} 
            onSchoolChange={setSelectedSchoolId}
          />
        </div>
      </div>

      <Tabs defaultValue="meals" className="space-y-4 sm:space-y-6">
        <TabsList className="flex flex-row gap-2 w-full overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-[#A2BD9D]/40 scrollbar-track-transparent px-1 py-2 sm:grid sm:grid-cols-6 sm:gap-0 sm:px-0 sm:py-0 h-auto">
          <TabsTrigger
            value="meals"
            className="min-w-[90px] data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white text-xs sm:text-sm px-3 py-2 sm:p-3 rounded-md sm:rounded-none"
          >
            Meals
          </TabsTrigger>
          <TabsTrigger
            value="attendance"
            className="min-w-[90px] data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white text-xs sm:text-sm px-3 py-2 sm:p-3 rounded-md sm:rounded-none"
          >
            Attendance
          </TabsTrigger>
          <TabsTrigger
            value="billing"
            className="min-w-[90px] data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white text-xs sm:text-sm px-3 py-2 sm:p-3 rounded-md sm:rounded-none"
          >
            Billing
          </TabsTrigger>
          <TabsTrigger
            value="expenses"
            className="min-w-[90px] data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white text-xs sm:text-sm px-3 py-2 sm:p-3 rounded-md sm:rounded-none"
          >
            Expenses
          </TabsTrigger>
          <TabsTrigger
            value="schools"
            className="min-w-[90px] data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white text-xs sm:text-sm px-3 py-2 sm:p-3 rounded-md sm:rounded-none"
          >
            Schools
          </TabsTrigger>
        </TabsList>

        <TabsContent value="meals">
          <MealDataSection selectedSchoolId={selectedSchoolId} />
        </TabsContent>

        <TabsContent value="attendance">
          <AttendanceDataSection selectedSchoolId={selectedSchoolId} />
        </TabsContent>

        <TabsContent value="billing">
          <BillingSection 
          schoolNamep={selectedSchoolName}
          selectedSchoolId={selectedSchoolId} />
        </TabsContent>

        <TabsContent value="expenses">
          <ExpensesSection selectedSchoolId={selectedSchoolId} />
        </TabsContent>

        <TabsContent value="schools">
          <SchoolManagementSection />
        </TabsContent>

       
      </Tabs>
    </div>
  )
}

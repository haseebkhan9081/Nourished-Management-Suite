"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SchoolSelector } from "./school-selector"
import { MealDataSection } from "./meal-data-section"
import { AttendanceDataSection } from "./attendance-data-section"
import { BillingSection } from "./billing-section"

export function Dashboard() {
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <SchoolSelector selectedSchoolId={selectedSchoolId} onSchoolChange={setSelectedSchoolId} />
      </div>

      <Tabs defaultValue="meals" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="meals" className="data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white">
            Meal Data
          </TabsTrigger>
          <TabsTrigger value="attendance" className="data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white">
            Attendance Data
          </TabsTrigger>
          <TabsTrigger value="billing" className="data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white">
            Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="meals">
          <MealDataSection selectedSchoolId={selectedSchoolId} />
        </TabsContent>

        <TabsContent value="attendance">
          <AttendanceDataSection selectedSchoolId={selectedSchoolId} />
        </TabsContent>

        <TabsContent value="billing">
          <BillingSection selectedSchoolId={selectedSchoolId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

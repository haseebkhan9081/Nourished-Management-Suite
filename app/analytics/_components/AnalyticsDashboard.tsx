"use client"

import React from "react"
import { useSearchParams } from "next/navigation"
import MetricsDisplay from "./MetricsDisplay"
import SelectInstitute from "./SelectInstitute"
import SelectMonth from "./SelectMonth"
import Analytics from "./Analytics"

const AnalyticsDashboard: React.FC = () => {
  const params = useSearchParams()
  const programId = params.get("programId")
  const month = params.get("month")

  const isParamsAvailable = programId !== null && month !== null

  return (
    <div className="space-y-4 sm:space-y-6 px-3 md:px-6 py-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="w-full sm:w-auto flex flex-col items-center sm:items-start text-center sm:text-left">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Analytics</h2>
          <p className="text-sm text-gray-500">Operational dashboard for partner schools</p>
        </div>
        <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-3 sm:items-end justify-center sm:justify-end">
          <SelectInstitute />
          <SelectMonth />
        </div>
      </div>

      <div className="flex justify-center">
        <MetricsDisplay />
      </div>

      {isParamsAvailable ? (
        <Analytics />
      ) : (
        <div className="text-center mt-4 p-4 bg-yellow-100 border border-yellow-300 text-yellow-800 rounded-lg shadow-sm">
          <p className="text-sm md:text-base">
            Please select the relevant Program & Month to view the analytics.
          </p>
        </div>
      )}
    </div>
  )
}

export default AnalyticsDashboard

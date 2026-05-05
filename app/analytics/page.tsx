import { Suspense } from "react"
import { AuthWrapper } from "@/components/auth-wrapper"
import { QueryProvider } from "./QueryProvider"
import AnalyticsDashboard from "./_components/AnalyticsDashboard"

export default function AnalyticsPage() {
  return (
    <AuthWrapper>
      <QueryProvider>
        <div className="analytics-scope">
          <Suspense
            fallback={
              <div className="text-center py-8 text-gray-500">Loading analytics…</div>
            }
          >
            <AnalyticsDashboard />
          </Suspense>
        </div>
      </QueryProvider>
    </AuthWrapper>
  )
}

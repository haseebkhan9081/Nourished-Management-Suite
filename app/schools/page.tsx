import { AuthWrapper } from "@/components/auth-wrapper"
import { Dashboard } from "@/components/dashboard"

export default function SchoolsPage() {
  return (
    <AuthWrapper>
      <Dashboard />
    </AuthWrapper>
  )
}

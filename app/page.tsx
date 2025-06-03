import { AuthWrapper } from "@/components/auth-wrapper"
import { Dashboard } from "@/components/dashboard"

export default function Home() {
  return (
    <AuthWrapper>
      <Dashboard />
    </AuthWrapper>
  )
}

import { AuthWrapper } from "@/components/auth-wrapper"
import { ModuleLanding } from "@/components/module-landing"

export default function Home() {
  return (
    <AuthWrapper>
      <ModuleLanding />
    </AuthWrapper>
  )
}

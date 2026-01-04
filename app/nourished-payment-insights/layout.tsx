"use client"

import { useEffect, useState } from "react"
import { signOut, useSession } from "next-auth/react"
import { fetchUserPermissions } from "@/lib/fetchPermissions"
import { Loader2, UserPlus, UserPlus2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { User, Settings, LogOut } from "lucide-react"
import { ManageAccessModal } from "./components/ManageAccessModal"
interface PaymentInsightsLayoutProps {
  children: React.ReactNode
}

export default function PaymentInsightsLayout({ children }: PaymentInsightsLayoutProps) {
    const [open, setOpen] = useState(false)
  const { data: session, status } = useSession()
  const [permissions, setPermissions] = useState<string[] | null>(null)

  useEffect(() => {
    if (session?.user?.email) {
      fetchUserPermissions(session.user.email).then(setPermissions)
    }
  }, [session?.user?.email])

  // Loading state
  if (status === "loading" || permissions === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
      </div>
    )
  }

  // Guard: no view permission
  if (!permissions.includes("payment_insights:view")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 sm:p-8 text-center">
            <p className="text-red-500 font-medium text-lg">
              You do not have permission to view this page.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Main content
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            {/* Left: Logo and Title */}
            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
              <div className="w-8 h-8 sm:w-12 sm:h-12 relative">
                <img
                  src="/images/nourished-logo.png"
                  alt="Nourished Logo"
                  className="object-contain w-full h-full"
                />
              </div>
              <h1 className="text-sm sm:text-xl font-semibold text-gray-900 truncate">
                Nourished Payment Insights
              </h1>
            </div>

            {/* Right: Welcome Text, Manage Access, Sign Out */}
<div className="flex items-center gap-2 sm:gap-3">
  {/* Welcome text (desktop only) */}
  <span className="hidden md:block text-sm text-gray-600 truncate max-w-xs">
    Welcome, {session?.user?.name || session?.user?.email}
  </span>

  {/* Manage Access (admin only) */}
  {permissions.includes("payment_insights:manage_users") && (
     <>
    <Button
      size="sm"
      className="flex items-center gap-1.5 bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-9 px-3"
       onClick={() => setOpen(true)}
    >
      <UserPlus2 size={16} />
      <span className="hidden sm:inline">Manage Access</span>
    </Button>
     <ManageAccessModal open={open} onClose={() => setOpen(false)} />
     </>
  )}

  {/* Sign Out */}
  <Button
    variant="outline"
    size="sm"
    onClick={() => signOut({ callbackUrl: "/login" })}
    className="flex items-center gap-1.5 h-9 px-3"
  >
    <LogOut size={16} />
    <span className="hidden sm:inline">Sign out</span>
  </Button>
</div>

          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Card className="w-full">
          <CardContent className="p-6 sm:p-8">
            {/* Use permissions to show/hide buttons, charts, tables */}
            {children}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

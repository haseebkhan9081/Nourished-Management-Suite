"use client"

import { useEffect, useState } from "react"
import { signOut, useSession } from "next-auth/react"
import { fetchUserPermissions } from "@/lib/fetchPermissions"
import { Loader2, UserPlus, UserPlus2, Menu, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { User, Settings, LogOut,DatabaseZap, Heart } from "lucide-react"
import { UploadTransactionModal } from "./components/UploadTransactionModal"
import { UploadBenevityModal } from "./components/UploadBenevityModal"
import { ManageAccessModal } from "./components/ManageAccessModal"
import { ModuleSwitcher } from "@/components/module-switcher"
import Link from "next/link"
interface PaymentInsightsLayoutProps {
  children: React.ReactNode
}

export default function PaymentInsightsLayout({ children }: PaymentInsightsLayoutProps) {
    const [open, setOpen] = useState(false)
    const [uploadOpen, setUploadOpen] = useState(false)
    const [benevityOpen, setBenevityOpen] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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
            {/* Left: Brand + Module Switcher */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Link href="/" aria-label="Go to home" className="flex items-center gap-2 flex-shrink-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10">
                  <img
                    src="/images/nourished-logo.png"
                    alt="Nourished Logo"
                    className="object-contain w-full h-full"
                  />
                </div>
                <span className="hidden sm:inline text-sm font-semibold text-gray-700">Nourished</span>
              </Link>
              <span className="hidden sm:inline text-gray-300 select-none">/</span>
              <ModuleSwitcher fallbackLabel="Payment Insights" />
            </div>

            {/* Right: Desktop menu (hidden on mobile) + Mobile menu icon */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Desktop buttons (visible on sm and up) */}
              <div className="hidden sm:flex items-center gap-2 sm:gap-3">
                {/* Welcome text (md and up) */}
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

                {permissions.includes("payment_insights:manage_users") && (
                  <>
                    <Button
                      size="sm"
                      className="flex items-center gap-1.5 bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-9 px-3"
                      onClick={() => setUploadOpen(true)}
                    >
                      <DatabaseZap size={16} />
                      <span className="hidden sm:inline">Add Transaction Data</span>
                    </Button>
                    <UploadTransactionModal open={uploadOpen} onClose={() => setUploadOpen(false)} />

                    <Button
                      size="sm"
                      variant="outline"
                      className="flex items-center gap-1.5 h-9 px-3 border-[#A2BD9D] text-[#5a7a55] hover:bg-[#A2BD9D]/10"
                      onClick={() => setBenevityOpen(true)}
                    >
                      <Heart size={16} />
                      <span className="hidden sm:inline">Upload Corporate</span>
                    </Button>
                    <UploadBenevityModal open={benevityOpen} onClose={() => setBenevityOpen(false)} />
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

              {/* Mobile sign out button (visible on sm and down) */}
              <div className="flex sm:hidden items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="h-9 w-9"
                  title="Sign out"
                >
                  <LogOut size={16} />
                </Button>

                {/* Mobile menu button */}
                {permissions.includes("payment_insights:manage_users") && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="h-9 w-9"
                  >
                    {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Mobile menu dropdown */}
          {mobileMenuOpen && permissions.includes("payment_insights:manage_users") && (
            <div className="sm:hidden border-t bg-white pb-4 px-4 space-y-2 pt-3">
              <Button
                size="sm"
                className="w-full flex items-center gap-2 bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-10"
                onClick={() => {
                  setOpen(true)
                  setMobileMenuOpen(false)
                }}
              >
                <UserPlus2 size={16} />
                Manage Access
              </Button>
              <ManageAccessModal open={open} onClose={() => setOpen(false)} />

              <Button
                size="sm"
                className="w-full flex items-center gap-2 bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-10"
                onClick={() => {
                  setUploadOpen(true)
                  setMobileMenuOpen(false)
                }}
              >
                <DatabaseZap size={16} />
                Add Transaction Data
              </Button>
              <UploadTransactionModal open={uploadOpen} onClose={() => setUploadOpen(false)} />

              <Button
                size="sm"
                variant="outline"
                className="w-full flex items-center gap-2 h-10 border-[#A2BD9D] text-[#5a7a55] hover:bg-[#A2BD9D]/10"
                onClick={() => {
                  setBenevityOpen(true)
                  setMobileMenuOpen(false)
                }}
              >
                <Heart size={16} />
                Upload Corporate
              </Button>
              <UploadBenevityModal open={benevityOpen} onClose={() => setBenevityOpen(false)} />
            </div>
          )}
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

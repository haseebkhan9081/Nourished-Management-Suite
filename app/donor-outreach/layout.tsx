"use client"

import { useSession, signOut } from "next-auth/react"
import { Loader2, LogOut } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ModuleSwitcher } from "@/components/module-switcher"
import Link from "next/link"
import Image from "next/image"

export default function DonorOutreachLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, status } = useSession()

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 sm:p-8 text-center">
            <p className="text-red-500 font-medium">
              You must be logged in to access this page.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Link href="/" aria-label="Home" className="flex items-center gap-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 relative">
                  <Image
                    src="/images/nourished-logo.png"
                    alt="Nourished"
                    fill
                    style={{ objectFit: "contain" }}
                  />
                </div>
                <span className="hidden sm:inline text-sm font-semibold text-gray-700">
                  Nourished
                </span>
              </Link>
              <span className="hidden sm:inline text-gray-300 select-none">/</span>
              <ModuleSwitcher fallbackLabel="Donor Outreach" />
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden md:block text-sm text-gray-600">
                {session.user?.name || session.user?.email}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}

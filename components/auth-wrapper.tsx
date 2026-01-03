"use client"

import React from "react"
import { useSession, signIn, signOut } from "next-auth/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import Image from "next/image"

interface AuthWrapperProps {
  children: React.ReactNode
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { data: session, status } = useSession()
  const loading = status === "loading"

  if (loading) {
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
            <div className="mb-6">
              <div className="w-20 h-20 sm:w-28 sm:h-28 mx-auto relative mb-4">
                <Image
                  src="/images/nourished-logo.png"
                  alt="Nourished Logo"
                  fill
                  style={{ objectFit: "contain" }}
                />
              </div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 mb-2">
                Nourished Management Suite
              </h1>
              <p className="text-sm sm:text-base text-gray-600">
                Sign in to access your dashboard
              </p>
            </div>
            <Button
              className="w-full bg-[#A2BD9D] hover:bg-[#8FA889] text-white"
              size="lg"
              onClick={() => signIn("google", { callbackUrl: "/" })}
            >
              Sign in with Google
            </Button>
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
            {/* Left: Logo and Title */}
            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
              <div className="w-8 h-8 sm:w-12 sm:h-12 relative">
                <Image
                  src="/images/nourished-logo.png"
                  alt="Nourished Logo"
                  fill
                  style={{ objectFit: "contain" }}
                />
              </div>
              <h1 className="text-sm sm:text-xl font-semibold text-gray-900 truncate">
                Nourished Management Suite
              </h1>
            </div>

            {/* Right: Welcome Text & Sign Out */}
            <div className="flex items-center space-x-2 sm:space-x-4">
              <span className="hidden sm:block text-sm text-gray-600 truncate max-w-xs">
                Welcome, {session.user?.name || session.user?.email}
              </span>
              <Button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-2 py-1 rounded"
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {children}
      </main>
    </div>
  )
}

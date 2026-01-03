//@ts-nocheck
"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { signIn } from "next-auth/react"
import Image from "next/image"


export default function LoginPage() {
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

import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Nourished Management Suite",
  description: "Nourished Management Suite for internal use",
  generator: "v0.dev",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

  if (!publishableKey) {
    return (
      <html lang="en">
        <body className={inter.className}>
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center p-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">Configuration Required</h1>
              <p className="text-gray-600 mb-4">Please add your Clerk environment variables to continue.</p>
              <div className="bg-gray-100 p-4 rounded-lg text-left text-sm">
                <p className="font-mono">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</p>
                <p className="font-mono">CLERK_SECRET_KEY</p>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                Get your keys at{" "}
                <a
                  href="https://dashboard.clerk.com"
                  className="text-[#A2BD9D] hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  dashboard.clerk.com
                </a>
              </p>
            </div>
          </div>
        </body>
      </html>
    )
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        elements: {
          formButtonPrimary: "bg-[#A2BD9D] hover:bg-[#8FA889]",
        },
      }}
    >
      <html lang="en">
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  )
}

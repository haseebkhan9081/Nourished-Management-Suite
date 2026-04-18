"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import {
  School,
  CreditCard,
  Receipt,
  Mail,
  ArrowRight,
  LucideIcon,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { fetchUserPermissions } from "@/lib/fetchPermissions"

type Module = {
  label: string
  href: string
  icon: LucideIcon
  tagline: string
  description: string
  bullets: string[]
  accent: string
  requiresPermission?: string
}

const MODULES: Module[] = [
  {
    label: "Schools Management",
    href: "/schools",
    icon: School,
    tagline: "Day-to-day operations across partner schools",
    description:
      "Track attendance, plan meals, manage student rosters, and monitor billing and expenses for every school we serve.",
    bullets: [
      "Attendance tracking & reports",
      "Meal planning and daily service logs",
      "Student rosters and class groups",
      "Per-school billing & expense tracking",
      "User & role management",
    ],
    accent: "from-[#A2BD9D] to-[#8FA889]",
  },
  {
    label: "Financial Insights",
    href: "/nourished-payment-insights",
    icon: CreditCard,
    tagline: "Where the money comes from and where it goes",
    description:
      "Unified view across Stripe, Benevity, CyberGrants, and bank deposits. Donor pivots, cash runway, and reconciliation tools.",
    bullets: [
      "Stripe, Benevity & CyberGrants overviews",
      "Donor pivot report (all sources, monthly)",
      "US Operations & Cash Runway",
      "Bank deposit reconciliation",
      "Donor detail & activity explorer",
    ],
    accent: "from-[#7FA088] to-[#5F8571]",
    requiresPermission: "payment_insights:view",
  },
  {
    label: "Donation Receipts",
    href: "/donation-receipt",
    icon: Receipt,
    tagline: "Issue and track tax receipts for every donation",
    description:
      "Search donors across Stripe, Benevity, and bank transfers. Send receipts with proof images, sync Stripe donations, and handle incomplete records.",
    bullets: [
      "Donor search across all sources",
      "Bank-transfer receipt attachments",
      "Stripe bulk sync & reconciliation",
      "Manual donation entry",
      "Incomplete-payment cleanup",
    ],
    accent: "from-[#C5DEC0] to-[#A2BD9D]",
  },
  {
    label: "Donor Outreach",
    href: "/donor-outreach",
    icon: Mail,
    tagline: "Send impact updates and campaigns to donors",
    description:
      "Compose rich HTML newsletters with images, pick donor segments, preview on desktop and mobile, and send via our Microsoft Graph mailbox.",
    bullets: [
      "Block-based email editor with live preview",
      "Image upload to Cloudinary",
      "Recipient segmentation across all donor sources",
      "Test sends before going out",
      "Send history & delivery tracking",
    ],
    accent: "from-[#D4A574] to-[#B8894F]",
  },
]

export function ModuleLanding() {
  const { data: session } = useSession()
  const [permissions, setPermissions] = useState<string[] | null>(null)

  useEffect(() => {
    if (!session?.user?.email) return
    fetchUserPermissions(session.user.email).then((p) =>
      setPermissions(p ?? []),
    )
  }, [session?.user?.email])

  const visible = MODULES.filter((m) => {
    if (!m.requiresPermission) return true
    if (permissions === null) return false
    return permissions.includes(m.requiresPermission)
  })

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Welcome{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mt-2">
          Choose where you want to work today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {visible.map((m) => {
          const Icon = m.icon
          return (
            <Link
              key={m.href}
              href={m.href}
              className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A2BD9D] rounded-xl"
            >
              <Card className="h-full border-gray-200 hover:border-[#A2BD9D] hover:shadow-lg transition-all overflow-hidden">
                <div
                  className={`h-1.5 bg-gradient-to-r ${m.accent}`}
                  aria-hidden
                />
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex-shrink-0 w-12 h-12 rounded-lg bg-gradient-to-br ${m.accent} flex items-center justify-center`}
                    >
                      <Icon size={24} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-lg font-semibold text-gray-900">
                          {m.label}
                        </h2>
                        <ArrowRight
                          size={18}
                          className="text-gray-400 group-hover:text-[#A2BD9D] group-hover:translate-x-0.5 transition-all flex-shrink-0"
                        />
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {m.tagline}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-700 mt-4 leading-relaxed">
                    {m.description}
                  </p>

                  <ul className="mt-4 space-y-1.5">
                    {m.bullets.map((b) => (
                      <li
                        key={b}
                        className="text-xs sm:text-sm text-gray-600 flex items-start gap-2"
                      >
                        <span
                          className="inline-block w-1 h-1 rounded-full bg-[#A2BD9D] mt-1.5 flex-shrink-0"
                          aria-hidden
                        />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

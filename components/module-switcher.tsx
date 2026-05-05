"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { ChevronDown, School, CreditCard, Receipt, Mail, Home, BarChart3, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { fetchUserPermissions } from "@/lib/fetchPermissions"

type ModuleEntry = {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  requiresPermission?: string
}

const MODULES: ModuleEntry[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Schools Dashboard", href: "/schools", icon: School },
  {
    label: "Payment Insights",
    href: "/nourished-payment-insights",
    icon: CreditCard,
    requiresPermission: "payment_insights:view",
  },
  { label: "Donation Receipts", href: "/donation-receipt", icon: Receipt },
  { label: "Donor Outreach", href: "/donor-outreach", icon: Mail },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
]

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function ModuleSwitcher({ fallbackLabel }: { fallbackLabel?: string }) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [permissions, setPermissions] = useState<string[]>([])

  useEffect(() => {
    if (session?.user?.email) {
      fetchUserPermissions(session.user.email).then((p) =>
        setPermissions(p ?? []),
      )
    }
  }, [session?.user?.email])

  const visible = MODULES.filter(
    (m) => !m.requiresPermission || permissions.includes(m.requiresPermission),
  )

  const current = visible.find((m) => isActive(pathname, m.href))
  const CurrentIcon = current?.icon ?? School
  const label = current?.label ?? fallbackLabel ?? "Home"

  if (visible.length <= 1) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 h-9 text-sm font-medium text-gray-800">
        <CurrentIcon size={16} className="text-[#A2BD9D]" />
        <span className="truncate max-w-[200px]">{label}</span>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 pl-2.5 pr-2 border-gray-300 bg-white hover:bg-gray-50 text-gray-900 data-[state=open]:bg-gray-50 data-[state=open]:ring-2 data-[state=open]:ring-[#A2BD9D]/40"
          aria-label="Switch module"
        >
          <CurrentIcon size={16} className="text-[#A2BD9D]" />
          <span className="text-sm font-medium truncate max-w-[140px] sm:max-w-[200px]">
            {label}
          </span>
          <ChevronDown size={16} className="text-gray-500 ml-0.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-gray-500">
          Switch module
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visible.map((m) => {
          const Icon = m.icon
          const active = isActive(pathname, m.href)
          return (
            <DropdownMenuItem key={m.href} asChild>
              <Link
                href={m.href}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Icon size={16} className="text-gray-500" />
                <span className="flex-1">{m.label}</span>
                {active && <Check size={14} className="text-[#A2BD9D]" />}
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

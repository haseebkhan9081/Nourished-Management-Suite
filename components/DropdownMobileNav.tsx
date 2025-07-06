"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface DropdownMobileNavProps {
  value: string
  onChange: (value: string) => void
}

export function DropdownMobileNav({ value, onChange }: DropdownMobileNavProps) {
  return (
    <div className="w-full max-w-xs mx-auto mb-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="border-[#A2BD9D] focus:ring-[#A2BD9D]">
          <SelectValue placeholder="Select section" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="meals">Meals</SelectItem>
          <SelectItem value="attendance">Attendance</SelectItem>
          <SelectItem value="billing">Billing</SelectItem>
          <SelectItem value="expenses">Expenses</SelectItem>
          <SelectItem value="schools">Schools</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
import { Input } from "@/components/ui/input";

interface BillingMonthSelectorProps {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
}

export function BillingMonthSelector({ selectedMonth, setSelectedMonth }: BillingMonthSelectorProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
      <label className="text-sm font-medium whitespace-nowrap">Select Month/Year:</label>
      <Input
        type="month"
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
        className="w-full sm:w-48 border-[#A2BD9D] focus:ring-[#A2BD9D]"
        placeholder="Select month..."
      />
    </div>
  );
}

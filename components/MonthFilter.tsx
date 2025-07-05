import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface MonthFilterProps {
  monthFilter: string;
  setMonthFilter: (val: string) => void;
  setMeals: (meals: any[]) => void;
  selectedSchoolId: number | null;
  fetchMeals: (month: string) => void;
}

export function MonthFilter({ monthFilter, setMonthFilter, setMeals, selectedSchoolId, fetchMeals }: MonthFilterProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4 p-3 bg-gray-50 rounded-lg border">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Filter by Month:</label>
        <Input
          type="month"
          value={monthFilter}
          onChange={(e) => {
            setMonthFilter(e.target.value);
            if (e.target.value && selectedSchoolId) {
              fetchMeals(e.target.value);
            }
          }}
          className="w-full sm:w-44 h-9 text-sm border-gray-300 focus:border-[#A2BD9D] focus:ring-[#A2BD9D]"
          placeholder="Select month..."
        />
      </div>
      {monthFilter && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setMonthFilter("");
            setMeals([]);
          }}
          className="h-9 px-2 text-xs flex items-center gap-1 whitespace-nowrap self-start sm:self-auto"
        >
          <X className="h-3 w-3 flex-shrink-0" />
          <span className="hidden sm:inline">Clear</span>
        </Button>
      )}
    </div>
  );
}

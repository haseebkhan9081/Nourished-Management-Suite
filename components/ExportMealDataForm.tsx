import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { start } from "node:repl";

interface AddMealDayFormProps {
  startDate: string;
  endDate: string;
  setStartDate: (val: string) => void;
  setEndDate: (val: string) => void;
  onExport: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function ExportMealDataForm({ startDate, endDate, setStartDate, setEndDate, onExport,onCancel,disabled }: AddMealDayFormProps) {
  return (
    <Card className="mb-4 border-[#A2BD9D]">
      <CardContent className="p-4">
        <h3 className="font-semibold mb-4">Export Meal Data</h3>
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
  <div className="flex flex-col w-full sm:w-48">
    <label className="text-sm font-medium mb-1">Start Date</label>
    <Input
      type="date"
      value={startDate}
      onChange={(e) => setStartDate(e.target.value)}
      className="w-full"
    />
  </div>
  <div className="flex flex-col w-full sm:w-48">
    <label className="text-sm font-medium mb-1">End Date</label>
    <Input
      type="date"
      value={endDate}
      onChange={(e) => setEndDate(e.target.value)}
      className="w-full"
    />
  </div>
  <Button
    onClick={onExport}
    className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
    disabled={disabled || !startDate || !endDate}
  >
    Export Data
  </Button>
  <Button
    variant="outline"
    onClick={onCancel}
    className="w-full sm:w-auto"
  >
    Cancel
  </Button>
</div>

      </CardContent>
    </Card>
  );
}

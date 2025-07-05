import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AddMealDayFormProps {
  newMealDate: string;
  setNewMealDate: (val: string) => void;
  onCreate: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function AddMealDayForm({ newMealDate, setNewMealDate, onCreate, onCancel, disabled }: AddMealDayFormProps) {
  return (
    <Card className="mb-4 border-[#A2BD9D]">
      <CardContent className="p-4">
        <h3 className="font-semibold mb-4">Add New Meal Day</h3>
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
          <Input
            type="date"
            value={newMealDate}
            onChange={(e) => setNewMealDate(e.target.value)}
            className="w-full sm:w-48"
          />
          <Button
            onClick={onCreate}
            className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
            disabled={disabled || !newMealDate}
          >
            Create Meal Day
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

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface BillingPDFDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealProviderName: string;
  setMealProviderName: (name: string) => void;
  onGeneratePDF: () => void;
  schoolName: string | null;
  selectedMonth: string;
}

export function BillingPDFDialog({
  open,
  onOpenChange,
  mealProviderName,
  setMealProviderName,
  onGeneratePDF,
  schoolName,
  selectedMonth,
}: BillingPDFDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="bg-white p-1 rounded-md shadow-sm border border-gray-100">
              <img src="/images/nourished-logo.png" alt="Nourished Welfare Trust" className="h-6 w-auto" />
            </div>
            <DialogTitle className="text-[#A2BD9D]">Generate Invoice</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mealProvider" className="text-sm font-medium">
              Meal Provider Name
            </Label>
            <Input
              id="mealProvider"
              placeholder="Enter the meal service provider's name"
              value={mealProviderName}
              onChange={(e) => setMealProviderName(e.target.value)}
              className="w-full border-[#A2BD9D]/30 focus:border-[#A2BD9D] focus:ring-[#A2BD9D]/20"
            />
            <p className="text-xs text-gray-500">
              This is the name of the company or individual providing meal services.
            </p>
          </div>
          <div className="bg-[#A2BD9D]/5 border border-[#A2BD9D]/20 p-3 rounded-lg">
            <p className="text-xs text-gray-700">
              <strong className="text-[#A2BD9D]">Invoice Details:</strong>
              <br />• Paying Entity: Nourished Welfare Trust
              <br />• School: {schoolName}
              <br />• Period: {selectedMonth ? new Date(selectedMonth + "-01").toLocaleDateString("en-US", { year: "numeric", month: "long" }) : "N/A"}
              <br />• Purpose: Payment confirmation & cross-check
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onGeneratePDF}
            className="bg-[#A2BD9D] hover:bg-[#8FA889]"
            disabled={!mealProviderName.trim()}
          >
            Generate PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

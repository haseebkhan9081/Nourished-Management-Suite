import { Loader2 } from "lucide-react";

export function LoadingOverlay() {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-4 rounded-lg shadow-lg flex items-center gap-3">
        <Loader2 className="h-6 w-6 text-[#A2BD9D] animate-spin" />
        <p className="text-gray-700 font-medium">Processing...</p>
      </div>
    </div>
  );
}

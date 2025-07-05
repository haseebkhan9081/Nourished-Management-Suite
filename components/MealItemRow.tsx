import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface MealItemRowProps {
  item: any;
  isEditing: boolean;
  newItem: any;
  setNewItem: (item: any) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canDelete: boolean;
  inputClassName?: string;
}

export function MealItemRow({
  item,
  isEditing,
  newItem,
  setNewItem,
  onSave,
  onCancel,
  onEdit,
  onDelete,
  canDelete,
  inputClassName = "",
}: MealItemRowProps) {
  if (isEditing) {
    return (
      <>
        <td className="px-2 py-1 sm:px-4 sm:py-2 align-top w-[120px] sm:w-auto">
          <Input
            placeholder="Item name"
            value={newItem.item_name}
            onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
            className={inputClassName + " border-none focus:border-none focus:ring-0 shadow-none outline-none text-xs sm:text-sm"}
          />
        </td>
        <td className="px-2 py-1 sm:px-4 sm:py-2 align-top w-[90px] sm:w-auto">
          <Input
            type="number"
            step="0.01"
            placeholder="0.00 PKR"
            value={newItem.unit_price}
            onChange={(e) => setNewItem({ ...newItem, unit_price: e.target.value })}
            className={inputClassName + " border-none focus:border-none focus:ring-0 shadow-none outline-none text-xs sm:text-sm"}
          />
        </td>
        <td className="px-2 py-1 sm:px-4 sm:py-2 align-top w-[70px] sm:w-auto">
          <Input
            type="number"
            placeholder="0"
            value={newItem.quantity}
            onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
            className={inputClassName + " border-none focus:border-none focus:ring-0 shadow-none outline-none text-xs sm:text-sm"}
          />
        </td>
        <td className="px-2 py-1 sm:px-4 sm:py-2 align-top w-[80px] sm:w-auto">
          ₨{(Number.parseFloat(newItem.unit_price || "0") * Number.parseInt(newItem.quantity || "0")).toFixed(0)}
        </td>
        <td className="px-2 py-1 sm:px-4 sm:py-2 align-top w-[120px] sm:w-auto">
          <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2 w-full">
            <Button size="sm" onClick={onSave} className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto text-xs sm:text-sm">
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel} className="w-full sm:w-auto text-xs sm:text-sm">
              Cancel
            </Button>
          </div>
        </td>
      </>
    );
  }
  return (
    <>
      <td className="px-2 py-1 sm:px-4 sm:py-2 align-top w-[120px] sm:w-auto text-xs sm:text-sm">{item?.item_name}</td>
      <td className="px-2 py-1 sm:px-4 sm:py-2 align-top w-[90px] sm:w-auto text-xs sm:text-sm">₨{Number(item?.unit_price).toFixed(0)}</td>
      <td className="px-2 py-1 sm:px-4 sm:py-2 align-top w-[70px] sm:w-auto text-xs sm:text-sm">{item?.quantity}</td>
      <td className="px-2 py-1 sm:px-4 sm:py-2 align-top w-[80px] sm:w-auto text-xs sm:text-sm">₨{(item?.unit_price * item?.quantity).toFixed(0)}</td>
      {canDelete && (
        <td className="px-2 py-1 sm:px-4 sm:py-2 align-top w-[120px] sm:w-auto">
          <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2 w-full">
            <Button size="sm" variant="outline" onClick={onEdit} className="w-full sm:w-auto text-xs sm:text-sm">
              Edit
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete} className="w-full sm:w-auto text-xs sm:text-sm">
              <span className="sm:hidden">Delete</span>
              <span className="hidden sm:inline">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            </Button>
          </div>
        </td>
      )}
    </>
  );
}

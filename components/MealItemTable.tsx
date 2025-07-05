import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MealItemRow } from "./MealItemRow";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface MealItemTableProps {
  meal: any;
  mealItems: any[];
  editingItem: any;
  newItem: any;
  setNewItem: (item: any) => void;
  setEditingItem: (item: any) => void;
  updateMealItem: (meal: any, itemId: number, mealId: number) => void;
  deleteMealItem: (itemId: number) => void;
  addMealItem: (mealId: number) => void;
  permissions: any;
}

export function MealItemTable({
  meal,
  mealItems,
  editingItem,
  newItem,
  setNewItem,
  setEditingItem,
  updateMealItem,
  deleteMealItem,
  addMealItem,
  permissions,
  inputClassName = "",
}: MealItemTableProps & { inputClassName?: string }) {
  return (
    <div className="overflow-x-auto w-full">
      <Table className="min-w-[600px] sm:min-w-0 w-full text-xs sm:text-sm">
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="px-2 py-1 sm:px-4 sm:py-2 whitespace-nowrap">Item Name</TableHead>
            <TableHead className="px-2 py-1 sm:px-4 sm:py-2 whitespace-nowrap">Unit Price (PKR)</TableHead>
            <TableHead className="px-2 py-1 sm:px-4 sm:py-2 whitespace-nowrap">Quantity</TableHead>
            <TableHead className="px-2 py-1 sm:px-4 sm:py-2 whitespace-nowrap">Total</TableHead>
            {permissions.canDelete && <TableHead className="px-2 py-1 sm:px-4 sm:py-2 whitespace-nowrap">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.isArray(mealItems) &&
            mealItems.filter((item) => item && item.item_name).length > 0 &&
            mealItems.map((item) => {
              const isEditing = editingItem?.itemId === item?.id;
              return (
                <TableRow key={item?.id} className="align-top">
                  <MealItemRow
                    item={item}
                    isEditing={isEditing}
                    newItem={newItem}
                    setNewItem={setNewItem}
                    onSave={() => updateMealItem(meal, item.id, meal.id)}
                    onCancel={() => setEditingItem(null)}
                    onEdit={() => {
                      setEditingItem({ mealId: meal?.id, itemId: item?.id });
                      setNewItem({
                        item_name: item.item_name,
                        unit_price: Number(item.unit_price).toFixed(2),
                        quantity: item.quantity.toString(),
                      });
                    }}
                    onDelete={() => deleteMealItem(item?.id)}
                    canDelete={permissions.canDelete}
                    inputClassName={inputClassName}
                  />
                </TableRow>
              );
            })}

          {/* Add New Meal Item Row (at bottom) */}
          {editingItem?.mealId === meal.id &&
            !editingItem?.itemId &&
            permissions.canEdit && (
              <TableRow className="align-top">
                <td className="px-2 py-1 sm:px-4 sm:py-2">
                  <Input
                    placeholder="Item name"
                    value={newItem.item_name}
                    onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                    className={inputClassName + " border-none focus:border-none focus:ring-0 shadow-none outline-none text-xs sm:text-sm"}
                  />
                </td>
                <td className="px-2 py-1 sm:px-4 sm:py-2">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00 PKR"
                    value={newItem.unit_price}
                    onChange={(e) => setNewItem({ ...newItem, unit_price: e.target.value })}
                    className={inputClassName + " border-none focus:border-none focus:ring-0 shadow-none outline-none text-xs sm:text-sm"}
                  />
                </td>
                <td className="px-2 py-1 sm:px-4 sm:py-2">
                  <Input
                    type="number"
                    placeholder="0"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                    className={inputClassName + " border-none focus:border-none focus:ring-0 shadow-none outline-none text-xs sm:text-sm"}
                  />
                </td>
                <td className="px-2 py-1 sm:px-4 sm:py-2">
                  ₨{(Number.parseFloat(newItem.unit_price || "0") * Number.parseInt(newItem.quantity || "0")).toFixed(0)}
                </td>
                <td className="px-2 py-1 sm:px-4 sm:py-2">
                  <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2 w-full">
                    <Button
                      size="sm"
                      onClick={() => addMealItem(meal.id)}
                      className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto text-xs sm:text-sm"
                    >
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingItem(null)}
                      className="w-full sm:w-auto text-xs sm:text-sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </td>
              </TableRow>
            )}
        </TableBody>
      </Table>
    </div>
  );
}

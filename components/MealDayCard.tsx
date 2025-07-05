import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { MealItemTable } from "./MealItemTable";
import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";

interface MealDayCardProps {
  meal: any;
  permissions: any;
  calculateMealTotal: (items: any[]) => number;
  setEditingItem: (item: any) => void;
  setNewItem: (item: any) => void;
  deleteMeal: (mealId: number) => void;
  editingItem: any;
  newItem: any;
  updateMealItem: (meal: any, itemId: number, mealId: number) => void;
  deleteMealItem: (itemId: number) => void;
  addMealItem: (mealId: number) => void;
}

export function MealDayCard({
  meal,
  permissions,
  calculateMealTotal,
  setEditingItem,
  setNewItem,
  deleteMeal,
  editingItem,
  newItem,
  updateMealItem,
  deleteMealItem,
  addMealItem,
}: MealDayCardProps) {
  const [noOfMeals, setNoOfMeals] = useState(meal.no_of_meals);
  const [updatingNoOfMeals, setUpdatingNoOfMeals] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const prevNoOfMeals = useRef(meal.no_of_meals);

  // Debounced update function
  const handleNoOfMealsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    setNoOfMeals(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (value !== String(prevNoOfMeals.current)) {
        setUpdatingNoOfMeals(true);
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_BASE_URL}/meals/update-no-of-meals`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                meal_id: meal.id,
                no_of_meals: Number(value),
                school_id: meal.school_id,
                date: meal.date,
              }),
            }
          );
          if (!res.ok) {
            // Optionally show error
            throw new Error("Failed to update number of meals");
          }
          prevNoOfMeals.current = value;
        } catch (err) {
          // Optionally show error
        } finally {
          setUpdatingNoOfMeals(false);
        }
      }
    }, 2000);
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div>
          <h3 className="font-semibold">
             {new Date(meal.date).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })} - {meal.day_of_week}
          </h3>
          {/* Editable no_of_meals */}
          <div className="mt-1 text-sm text-gray-600 font-medium flex items-center gap-2">
            Number of Meals:
            {permissions.canEdit ? (
              <>
                <Input
                  type="number"
                  min={0}
                  value={noOfMeals}
                  onChange={handleNoOfMealsChange}
                  className="w-20 h-7 text-sm px-2 py-1 border-none focus:ring-0 focus:border-none shadow-none outline-none"
                  disabled={updatingNoOfMeals}
                />
                {updatingNoOfMeals && (
                  <span className="ml-2 text-xs text-[#A2BD9D] animate-pulse">
                    Saving...
                  </span>
                )}
              </>
            ) : (
              <span className="font-bold">{noOfMeals}</span>
            )}
          </div>
          <div className="mt-1 space-y-1">
            <Badge variant="outline" className="text-base font-semibold">
              Total: ₨{calculateMealTotal(meal.meal_items)}
            </Badge>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {permissions.canEdit && (
            <Button
              size="sm"
              onClick={() => {
                setEditingItem({ mealId: meal.id });
                setNewItem({ item_name: "", unit_price: "0", quantity: "0" });
              }}
              className="bg-[#A2BD9D] hover:bg-[#8FA889] w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          )}
          {permissions.canDelete && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => deleteMeal(meal.id)}
              className="w-full sm:w-auto"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete Day
            </Button>
          )}
        </div>
      </div>
      <MealItemTable
        meal={meal}
        mealItems={meal.meal_items}
        editingItem={editingItem}
        newItem={newItem}
        setNewItem={setNewItem}
        setEditingItem={setEditingItem}
        updateMealItem={updateMealItem}
        deleteMealItem={deleteMealItem}
        addMealItem={addMealItem}
        permissions={permissions}
        inputClassName="border-none focus:ring-0 focus:border-none shadow-none outline-none"
      />
    </div>
  );
}

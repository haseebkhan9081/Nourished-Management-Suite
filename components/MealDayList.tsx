import { MealDayCard } from "./MealDayCard";

interface MealDayListProps {
  meals: any[];
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

export function MealDayList({
  meals,
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
}: MealDayListProps) {
  return (
    <div className="space-y-4">
      {meals.map((meal) => (
        //@ts-ignore
        <MealDayCard
          key={meal.id}
          meal={meal}
          permissions={permissions}
          calculateMealTotal={calculateMealTotal}
          setEditingItem={setEditingItem}
          setNewItem={setNewItem}
          deleteMeal={deleteMeal}
          editingItem={editingItem}
          newItem={newItem}
          updateMealItem={updateMealItem}
          deleteMealItem={deleteMealItem}
          addMealItem={addMealItem}
        >
          {/* Show no_of_meals if present */}
          {typeof meal.no_of_meals !== "undefined" && (
            <div className="mt-1 text-sm text-gray-600 font-medium">
              Number of Meals:{" "}
              <span className="font-bold">{meal.no_of_meals}</span>
            </div>
          )}
        </MealDayCard>
      ))}
    </div>
  );
}

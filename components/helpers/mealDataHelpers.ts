import type { Meal, MealItem } from "@/lib/supabase";

export const calculateMealTotal = (items: MealItem[]) => {
  return items?.reduce((sum, item) => {
    const price = Number(item?.unit_price) || 0;
    const quantity = Number(item?.quantity) || 0;
    return sum + price * quantity;
  }, 0);
};

export const fetchMeals = async (
  selectedSchoolId: number | null,
  monthFilter: string,
  setLoading: (b: boolean) => void,
  setMeals: (meals: (Meal & { meal_items: MealItem[] })[]) => void
) => {
  if (!selectedSchoolId || !monthFilter) return;
  setLoading(true);
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/meals?school_id=${selectedSchoolId}&month=${monthFilter}`);
    if (!res.ok) throw new Error("Failed to fetch meals");
    const data = await res.json();
    console.log("meal data section data ",data)
    setMeals(data || []);
  } catch (error) {
    console.error("Error fetching meals:", error);
  } finally {
    setLoading(false);
  }
};

export const addMealItem = async (
  mealId: number,
  permissions: any,
  newItem: any,
  setOperationLoading: (b: boolean) => void,
  setNewItem: (item: any) => void,
  setEditingItem: (item: any) => void,
  fetchMeals: (month?: string) => void,
  monthFilter: string
) => {
  if (!permissions.canEdit || !newItem.item_name || !newItem.unit_price || !newItem.quantity) return;
  setOperationLoading(true);
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/meal-items/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meal_id: mealId,
        item_name: newItem.item_name,
        unit_price: Number.parseFloat(newItem.unit_price).toString(),
        quantity: newItem.quantity,
      }),
    });
    if (!res.ok) throw new Error("Failed to add meal item");
    setNewItem({ item_name: "", unit_price: "", quantity: "" });
    setEditingItem(null);
    fetchMeals(monthFilter);
  } catch (error) {
    console.error("Error adding meal item:", error);
  } finally {
    setOperationLoading(false);
  }
};
// Add more helpers as needed for deleteMealItem, createNewMeal, updateMealItem, deleteMeal, etc.

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for our database
export interface School {
  id: number
  name: string
  address: string
  created_at: string
  updated_at: string
}

export interface Meal {
  id: number
  school_id: number
  date: string
  day_of_week: string
  total_cost: number
  created_at: string
  updated_at: string
  meal_items?: MealItem[]
}

export interface MealItem {
  id: number
  meal_id: number
  item_name: string
  unit_price: number
  quantity: number
  total: number
  created_at: string
}

export interface Student {
  id: number
  school_id: number
  student_id: string
  system_id: string
  name: string
  class_department: string
  created_at: string
  updated_at: string
}

export interface Attendance {
  id: number
  student_id: number
  date: string
  punch_times: string[]
  created_at: string
  updated_at: string
  students?: Student
}

export interface Expense {
  id: number
  school_id: number
  month_year: string
  expense_name: string
  amount: number
  created_at: string
  updated_at: string
}

export interface SchoolAccess {
  id: number
  school_id: number
  user_id: string
  role: string
  created_at: string
  updated_at: string
}

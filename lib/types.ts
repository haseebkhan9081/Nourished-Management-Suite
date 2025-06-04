// Type definitions for the application

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
  students: Student
}

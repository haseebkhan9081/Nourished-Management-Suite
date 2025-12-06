"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"


import type { Meal, MealItem } from "@/lib/supabase"
import { useSchoolPermissions } from "@/hooks/use-school-permissions"
import { LoadingOverlay } from "./LoadingOverlay"
import { GroupSelect } from "./GroupSelect"


interface MealDataSectionProps {
  selectedSchoolId: number | null
}

interface User {
  id: number;
  school_id: number;
  student_id: string;
  system_id: string;
  name: string;
  class_department: string;
  created_at: string; 
  updated_at: string; 
}
interface Group{
  id:number;
  value:string
}
export function UserManagementSection({ selectedSchoolId }: MealDataSectionProps) {

  const { permissions, loading: loadingPermissions } = useSchoolPermissions(selectedSchoolId)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [groups, setGroups] = useState<Group[]>([])

 
  const [loading, setLoading] = useState(false)
  
  const [operationLoading, setOperationLoading] = useState(false)
 
 
 const fetchUsers = async() =>{
       setLoading(true)
  
       try{
       const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/students/${selectedSchoolId}`);
      if (!res.ok) throw new Error("Failed to fetch users!");
      const data = await res.json()
      setUsers(data||[])
  
    }catch(error){
      console.error("Error fetching Users:", error);
    }finally{
     setLoading(false)
    }
  
  
    }


const fetchGroups = async() =>{
     setLoadingGroups(true)
     try{
     const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/groups/`);
    if (!res.ok) throw new Error("Failed to fetch groups!");
    const data = await res.json()
    setGroups(data||[])

  }catch(error){
    console.error("Error fetching Users:", error);
  }finally{
   setLoadingGroups(false)
  }


  }
     useEffect(()=>{
fetchGroups()
},[])    
  
useEffect(()=>{
fetchUsers()
},[selectedSchoolId])


  
    



 

  




 
 

  if (!selectedSchoolId) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">Please select a school to view Users</p>
        </CardContent>
      </Card>
    )
  }

  if (loadingPermissions) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">Loading permissions...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="relative">
      {/* Loading Overlay */}
      {(operationLoading||loading) && <LoadingOverlay />}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-[#A2BD9D]">Users</CardTitle>
           
          </div>
         
        </CardHeader>
        <CardContent>
         <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#A2BD9D]/5">
                        <TableHead className="text-[#A2BD9D] font-semibold">Student ID</TableHead>
                        
                        <TableHead className="text-[#A2BD9D] font-semibold">
                       
                              Name
                           
                        </TableHead>
                        <TableHead className="text-[#A2BD9D] font-semibold">
                           
                              Class/Department
                             
                        </TableHead>
                        
                        
                       
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((record:User, index) => (
                        <TableRow
                          key={record.id}
                          className="hover:bg-[#A2BD9D]/5"
                          
                        >
                          <TableCell className="font-medium">{record.student_id}</TableCell>
                          
                          <TableCell className="font-medium text-gray-800">{record.name}</TableCell>
                          <TableCell className="text-gray-600">
                            {permissions.canEdit?( <GroupSelect
                           fetchUsers={fetchUsers}
                           id={record.id}
                           selectedClass={record.class_department}
                           setLoading={setLoading}
                           groups={groups}
                           loadingGroup={loadingGroups}
                          
                           />):(
                            <span>{record.class_department||"Not Assigned"}</span>
                           )}
                          
                           
                          </TableCell>
                         
                          
                          
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>     
              </div>
           </CardContent>
      </Card>
    </div>
  )
}

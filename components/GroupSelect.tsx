import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Group{
  id:number;
  value:string
}
interface GroupSelectProps {
    selectedClass: string;
    id: number;
    setLoading: (value: boolean) => void;
    fetchUsers: () => void;
    groups:Group[];
    loadingGroup:boolean
}

export function GroupSelect({
  selectedClass,
  id,
  fetchUsers,
  groups,
  loadingGroup
}:GroupSelectProps){
const [loadingGroups, setLoadingGroups] = useState(loadingGroup)
const [selectedGroup,setSelectedGroup]= useState(selectedClass)


const updateUser = async (group: string, id: number) => {

  setSelectedGroup(group)
  setLoadingGroups(true)

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/students/update`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          group,
          id,
        }),
      }
    )

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || "Failed to update user")
    }

  } catch (error) {
    console.error("Error updating user:", error)
  } finally {
   
    setLoadingGroups(false)
  }
}
return (
    <div>
         {loadingGroups?(<Loader2 className="h-6 w-6 text-[#A2BD9D] animate-spin" />):(
                               <div className="w-full max-w-xs">
      <Select
        value={selectedGroup||""}
        onValueChange={(value) =>{ 
        updateUser(value,id)
        }
        }
        disabled={loadingGroups}
      >
        <SelectTrigger className="border-[#A2BD9D] focus:ring-[#A2BD9D]">
          <SelectValue placeholder="Assign a class/department..." />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group:Group) => (
            <SelectItem key={group.id} value={group.value}>
              {group.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
                            )}
    </div>
)

}
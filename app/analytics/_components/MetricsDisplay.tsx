import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import Decimal from 'decimal.js';
import Loading from './Loading';
import ErrorDisplay from './Error';
import NoDataFallback from './NoDataFallback';
const fetchTotalMealsServed = async (programId: string) => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/meals/totalMealsBySchool?schoolId=${programId}`
  );
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
};

const fetchAverageStudents = async (programId: string) => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/attendance/AverageAttendanceUntilNow?schoolId=${programId}`
  );
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
};

const MetricsDisplay: React.FC = () => {
  const params = useSearchParams();
  const programId = params.get("programId");

   const allParamsAvailable = programId != null;


  const {
    data: mealsData,
    error: mealsError,
    isLoading: mealsLoading,
  } = useQuery({
    queryKey: ["totalMealsServed", programId],
    queryFn: () => {
      if (allParamsAvailable) {

      return fetchTotalMealsServed(programId!)}
      else{
     return Promise.resolve({ formattedLatestDate: "", totalMealsServed: 0 });
      }},
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  const {
    data: studentsData,
    error: studentsError,
    isLoading: studentsLoading,
  } = useQuery({
    queryKey: ["averageStudents", programId],
    queryFn: () =>{
     if (allParamsAvailable) {

      return fetchAverageStudents(programId!)}
      else{
return Promise.resolve({
  averageAttendanceUntilNow: 0,
});
      }

    },
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  if (mealsLoading || studentsLoading) return <Loading/>;
  if (mealsError) return <ErrorDisplay message={(mealsError as Error).message}/>;
  if (studentsError) return <ErrorDisplay message= {(studentsError as Error).message}/>;

  return (
    <div className="flex flex-col w-full md:w-3/4 lg:w-1/2 space-y-4 mb-6">

     {mealsData?.totalMealsServed>0&&
<div className="bg-primary text-primary-foreground p-6 rounded-lg shadow-lg">
      <h2 className="text-xl font-semibold">
  Total Meals Served till <span className="text-2xl font-bold">{mealsData?.formattedLatestDate||'0'}</span>
</h2>

        <p className="text-3xl font-bold">{mealsData?.totalMealsServed?.toLocaleString() || '0'}</p>
      </div>
     }

    {studentsData?.averageAttendanceUntilNow===0?(
<NoDataFallback
message='Average Students'
/>
    ):(
<div className="bg-primary text-primary-foreground p-6 rounded-lg shadow-lg">
        <h2 className="text-xl font-semibold">Average Students</h2>
        <p className="text-3xl font-bold">
  {studentsData?.averageAttendanceUntilNow !== undefined
    ? Math.ceil(studentsData.averageAttendanceUntilNow)
    : '0'}
</p>


      </div>
    )}

    </div>
  );
};

export default MetricsDisplay;

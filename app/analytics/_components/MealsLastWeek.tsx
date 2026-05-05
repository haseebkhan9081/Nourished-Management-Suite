import { useSearchParams } from 'next/navigation';
import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parse, format } from 'date-fns';
import Loading from './Loading';
import ErrorDisplay from './Error';
import NoDataFallback from './NoDataFallback';

const mealsLast7Days = async (programId: string, month: string) => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/meals/MealsServedLast7days?schoolId=${programId}&month=${month}`
  );
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
};

const MealsLastWeek = () => {
  const params = useSearchParams();
  const programId = params.get("programId");
  const month = params.get("month");

  const allParamsAvailable = programId != null && month != null;

  const { data, error, isLoading } = useQuery({
    queryKey: ["mealsLast7Days", programId, month],
    queryFn: () => {
      if (allParamsAvailable) {
        return mealsLast7Days(programId!, month!);
      } else {
        return Promise.resolve([]);
      }
    },
    enabled: !!allParamsAvailable,
    retry: 3, // Number of retry attempts
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), // Exponential backoff
  });



  if (isLoading) return <Loading/>;
  if (error) return <ErrorDisplay message={(error as Error).message}/>;
 if (!data || data.length === 0) {
   return null;
 }
  const formatDate = (dateString: string) => {
    const date = parse(dateString, 'MM/dd/yyyy', new Date());
    return format(date, 'EEEE');
  };

  const formatDateFull = (dateString: string) => {
    const date = parse(dateString, 'MM/dd/yyyy', new Date());
    return format(date, 'MM/dd/yyyy');
  };

  return (
    <>
      {data?.last7DaysMeals?.length > 0 && (
        <div className="p-4 md:p-6 w-full">
          <h2 className="text-2xl font-bold mb-4 text-primary">
           Last 7 Meals
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-primary">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                    Day
                  </th>
                  <th className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                    Date
                  </th>
                  <th className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                    Meal Name
                  </th>
                  <th className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                    Meals
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.last7DaysMeals.map(
                  (meal: {
                    date: string;
                    mealName: string;
                    noOfMeals: string;
                  }) => (
                    <tr key={meal.date}>
                      <td className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                        {formatDate(meal.date)}
                      </td>
                      <td className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                        {formatDateFull(meal.date)}
                      </td>
                      <td className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                        {meal?.mealName}
                      </td>
                      <td className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                        {meal?.noOfMeals}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
            {data?.last7DaysMeals.length === 0 && (
              <NoDataFallback message=" Display" />
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default MealsLastWeek;

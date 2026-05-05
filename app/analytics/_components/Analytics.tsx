import React, { useState } from 'react';
import StudentVSNoofBoxes from './StudentVSNoofBoxes';
import Expenses from './Expenses';
import MealCost from './MealCost';
import AverageStudentVsBoxes from './AverageStudentVsBoxes';
import AverageStudentPerClass from './AverageStudentPerClass';
import MealsLastWeek from './MealsLastWeek';
import QuotationPerMeal from './QuotationPerMeal';
import { cn } from '@/lib/utils';
import TeachersAverageTime from './TeachersAverageTime';
import TeachersAttendanceSummary from './TeachersAttendanceSummary';

const Analytics: React.FC = () => {
  const [isExpensesAvailable,setisExpensesAvailable]=useState(true);
  const [isMealsLastWeekAvailable,setisMealsLastWeekAvailable]=useState(true);
  return (
    <div className="p-3 md:p-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <h2 className="text-3xl font-bold text-center text-primary mb-4 col-span-full">
        Comprehensive Analytics Dashboard
      </h2>

      <div className="col-span-full lg:col-span-2 xl:col-span-4 w-full">
        <StudentVSNoofBoxes />
      </div>

      <div className="col-span-full lg:col-span-2 xl:col-span-4 w-full">
        <MealCost />
      </div>

      <div className="col-span-full grid grid-cols-1 gap-6 md:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
        <AverageStudentVsBoxes />

        <AverageStudentPerClass />
      </div>

      <div className="col-span-full grid grid-cols-1 gap-6 md:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
        <Expenses />

        <MealsLastWeek />
      </div>
      <div className="col-span-full grid grid-cols-1 gap-6 md:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
        <QuotationPerMeal />

        <TeachersAverageTime />
      </div>
      <div className="col-span-full grid grid-cols-1 gap-6 md:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">

          <TeachersAttendanceSummary />

      </div>
    </div>
  );
};

export default Analytics;

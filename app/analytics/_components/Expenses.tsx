import { useSearchParams } from 'next/navigation';
import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend } from 'chart.js';
import { ChartData, ChartOptions } from 'chart.js';
import Loading from './Loading';
import ErrorDisplay from './Error';

ChartJS.register(BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

const fetchExpenses = async (
  programId: string,
  month: string
) => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/expenses/getExpensesByMonth?schoolId=${programId}&month=${month}`
  );
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
};

const Expenses= () => {
  const params = useSearchParams();
  const programId = params.get("programId");
  const month = params.get("month");
  const allParamsAvailable =
    programId != null &&
    month != null;

  const { data, error, isLoading } = useQuery({
    queryKey: ["fetchExpenses", programId, month ],
    queryFn: () => {
      if (allParamsAvailable) {
        return fetchExpenses(programId!, month!);
      } else {
        return Promise.resolve({});
      }
    },
    enabled: !!allParamsAvailable,
    retry: 3, // Number of retry attempts
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), // Exponential backoff
  });


  if (isLoading) return <Loading/>;
  if (error) return <ErrorDisplay message={(error as Error).message}/>;
  console.log("Data = > ", data);
  if (!data || data.length === 0) {
    return null;
  }
   // Prepare chart data
  const months = Object.keys(data);
  const salarySums = months.map(month => data[month].salarySum);
  const otherExpensesSums = months.map(month => data[month].otherExpensesSum);

  const chartData: ChartData<'bar'> = {
    labels: months,
    datasets: [
      {
        label: 'Salary',
        data: salarySums,
        backgroundColor: '#A2BD9D',
        borderColor: '#A2BD9D',
        borderWidth: 1,
        stack: 'stack1',
      },
      {
        label: 'Other Expenses',
        data: otherExpensesSums,
        backgroundColor: '#9B9B9B',
        borderColor: '#9B9B9B',
        borderWidth: 1,
        stack: 'stack2',
      },
    ],
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      datalabels: {
        display: true,
        color: 'black',
        font: {
          weight: 'bold',
          size: 12,
        },
      },
      legend: {
        position: 'top',
        labels: {
          font: {
            weight: 'bold',
            size: 14,
          },
          color: '#333',
        },
      },
      title: {
        display: true,
        font: {
          weight: 'bold',
          size: 16,
        },
        color: '#333',
        text: 'Monthly Salary and Other Expenses',
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: {
          font: {
            weight: 'bold',
            size: 12,
          },
          color: '#333',
        },
      },
      y: {
        stacked: true,
        ticks: {
          font: {
            weight: 'bold',
            size: 12,
          },
          color: '#333',
        },
        beginAtZero: true,
      },
    },
  };


  return (
    <div>
      {!(salarySums[0]==undefined&&otherExpensesSums[0]==undefined)&&<div className="h-[400px] p-4 md:p-6 w-full">
      <Bar data={chartData} options={options} />
    </div>}

    </div>
  );
};

export default Expenses;

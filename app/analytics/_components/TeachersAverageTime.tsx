import { useSearchParams } from 'next/navigation';
import React from 'react';
import { dataTagSymbol, useQuery } from '@tanstack/react-query';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, Title, Tooltip, Legend, CategoryScale, LinearScale } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { ChartData, ChartOptions } from 'chart.js';
import Loading from './Loading';
import ErrorDisplay from './Error';

ChartJS.register(BarElement, Title, Tooltip, Legend, CategoryScale, LinearScale, ChartDataLabels);

const getTeachersAverageTime = async (programId: string, month: string) => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/attendance/TeachersAverageTime?schoolId=${programId}&month=${month}`
  );
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
};

const TeachersAverageTime: React.FC = () => {
  const params = useSearchParams();
  const programId = params.get("programId");
  const month = params.get("month");


  const allParamsAvailable =
    programId != null &&
    month != null;

  const { data, error, isLoading } = useQuery({
    queryKey: ["TeachersAverageTime", programId, month],
    queryFn: () => {
      if (allParamsAvailable) {
        return getTeachersAverageTime(programId!, month!);
      } else {
        return Promise.resolve({});
      }
    },
    enabled: !!allParamsAvailable,
    retry: 3, // Number of retry attempts
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), // Exponential backoff
  });
  if (!data || data.length === 0) {
    return null;
  }
  if (isLoading) return <Loading/>;
  if (error) return <ErrorDisplay message={(error as Error).message}/>;
  // Early return if data is empty or undefined
  if (!Array.isArray(data) || data.length === 0) return null;

  //@ts-ignore
  const chartLabels = data?.map((entry) => entry.Name); // Names for the x-axis
  //@ts-ignore

  const timeData = data?.map((entry) => entry.timeValue); // Time values in minutes
  //@ts-ignore
  const timeLabels = data?.map((entry) => entry.timeLabel); // Formatted time labels for display
 //@ts-ignore
  const absentData = data?.map((entry) => parseInt(entry.Absent?.split(" ")[0])); // Absence count
  const maxTime = Math.max(...timeData);
  const maxAbsent = Math.max(...absentData);



  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Weekly Average Time Worked (Minutes)',
        data: timeData,
        backgroundColor: '#A2BD9D',
        borderColor: '#A2BD9D',
        borderWidth: 1,
        yAxisID: 'y-time',
        barPercentage: 1,
        categoryPercentage: 0.8,
      },
      // Remove the absent data from the chart display, but keep it for tooltip
      // {
      //   label: 'Days Absent',
      //   data: absentData,
      //   backgroundColor: '#9B9B9B',
      //   borderColor: '#9B9B9B',
      //   borderWidth: 1,
      //   yAxisID: 'y-absent',
      //   barPercentage: 0.8,
      //   categoryPercentage: 0.6,
      // },
    ],
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        ticks: {
          font: {
            weight: 'bold',
            size: 12,
          },
          color: '#333',
        },
        grid: {
          display: false,
        },
      },
      'y-time': {
        beginAtZero: true,
        max: maxTime * 1.15,
        type: 'linear',
        position: 'left',
        title: {
          display: true,
          text: 'Average Time Worked (Minutes)',
          font: {
            weight: 'bold',
          },
        },
      },

    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: {
            weight: 'bold',
            size: 14,
          },
        },
      },
      title: {
        display: true,
        text: 'Weekly Teachers Attendance and Work Time',
        font: {
          weight: 'bold',
          size: 16,
        },
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            const datasetIndex = context.datasetIndex;
            const dataIndex = context.dataIndex;

            if (datasetIndex === 0) {
              // Use `timeLabels` for the first dataset (time worked)
              return `Time Worked: ${timeLabels[dataIndex]} `;
            }
            return "";
          },
        },
      },
      datalabels: {
        display: true,
        color: 'black',
        font: {
          weight: 'bold',
          size: 10,
        },
        anchor: 'center',
        align: 'top',
        formatter: (value, context) => {
          if (context.dataset.label === 'Weekly Average Time Worked (Minutes)') {
            return timeLabels[context.dataIndex];
          } else {
            return `${value}`;
          }
        },
      },
    },
  };

  return (
    <div className="overflow-x-auto">
      <div className="w-[1000px] h-[350px]">
        {(data&&data?.length>0)&&<Bar data={chartData} options={options} />}

      </div>
    </div>
  );
};

export default TeachersAverageTime;

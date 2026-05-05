import { useSearchParams } from 'next/navigation';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, Title, Tooltip, Legend, CategoryScale, LinearScale } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { ChartData, ChartOptions } from 'chart.js';
import Loading from './Loading';
import ErrorDisplay from './Error';

ChartJS.register(BarElement, Title, Tooltip, Legend, CategoryScale, LinearScale, ChartDataLabels);

const fetchAllFiles = async (programId: string, month: string) => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/meals/MealCost?schoolId=${programId}&month=${month}`
  );
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
};

const MealCost: React.FC = () => {
  const params = useSearchParams();
  const programId = params.get("programId");
  const month = params.get("month");


  const allParamsAvailable =
    programId != null &&
    month != null

  const { data, error, isLoading } = useQuery({
    queryKey: ["worksheets", programId, month],
    queryFn: () => {
      if (allParamsAvailable) {
        return fetchAllFiles(programId!, month!);
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

  // Convert the data into a format suitable for the bar chart
  const exchangeRate = 280; // PKR to USD exchange rate
  const chartLabels = Object.keys(data); // Sort months alphabetically
  const pkrData = chartLabels.map(month => data[month]);
  const usdData = pkrData.map(cost => cost / exchangeRate);

  const maxPKR = Math.max(...pkrData) * 1.2; // Adjust this multiplier to add extra space
  const maxUSD = Math.max(...usdData) * 1.2; // Adjust this multiplier to add extra space
  const getFontSize = () => window.innerWidth < 640 ? 10 : 12;
  const chartData: ChartData<'bar'> = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Total Cost (PKR)',
        data: pkrData,
        backgroundColor: '#A2BD9D', // Primary color
        borderColor: '#A2BD9D', // Primary color
        borderWidth: 1,
        yAxisID: 'y-pkr',
        barPercentage:0.9, // Adjust this value to create more space between bars
        categoryPercentage: 0.8, // Adjust this to control space between groups of bars (if there are multiple datasets)
      },
      {
        label: 'Total Cost (USD)',
        data: usdData,
        backgroundColor: '#9B9B9B', // Neutral color
        borderColor: '#9B9B9B', // Neutral color
        borderWidth: 1,
        yAxisID: 'y-usd',
        barPercentage: 0.9, // Adjust this value to create more space between bars
        categoryPercentage: 0.8, // Adjust this to control space between groups of bars (if there are multiple datasets)
      },
    ],
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 10,
        right: 10,
        bottom: 20, // Add padding to the bottom
        left: 10,
      },
    },
    scales: {
      x: {
        ticks: {
          font: {
            weight: 'bold',
            size: getFontSize(), // Reduce font size for mobile
          },
          color: '#333',
          autoSkip: true, // Automatically skip labels if there are too many
        },
        grid: {
          display: false, // Hide x-axis grid lines if not needed
        },
      },
      'y-pkr': {
        beginAtZero: true,
        type: 'linear',
        position: 'left',
        min: 0,
        max: maxPKR,
        ticks: {
          callback: function (value) {
            return value.toLocaleString();
          }
        },
        title: {
          display: false,
        },
      },
      'y-usd': {
        beginAtZero: true,
        type: 'linear',
        position: 'right',
        min: 0,
        max: maxUSD,
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          callback: function (value) {
            return value.toLocaleString();
          }
        },
        title: {
          display: false,
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
        text: 'Total Cost Paid to Vendor (PKR vs USD)',
      },
      datalabels: {
        display: true,
        color: 'black',
        font: {
          weight: 'bold',
          size: 10,
        },
        anchor: 'center',
        align: 'center',
        formatter: function (value, context) {
          if (context.dataset.label === 'Total Cost (USD)') {
            return `$${value.toFixed(2)}`;
          } else {
            return value.toLocaleString();
          }
        },
        clamp: true,
        padding: {
          top: 4,
        },
        clip: true,
        rotation: 90,
      }
    },
  };



  return (
    <div className="h-[400px] p-4 md:p-6 w-full ">
      <Bar data={chartData} options={options} />
    </div>
  );
};

export default MealCost;

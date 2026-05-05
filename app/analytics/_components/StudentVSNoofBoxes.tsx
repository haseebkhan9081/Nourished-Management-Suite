import { useSearchParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { ChartData, ChartOptions } from "chart.js";
import Loading from "./Loading";
import ErrorDisplay from "./Error";

// Chart.js setup
ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend
);

// Each daily record
export type StudentsVsBoxesRow = {
  Date: string;
  NoOfBoxes: number;
  NoOfPresents: number;
};

// Full API response
export type StudentsVsBoxesResponse = {
  results: StudentsVsBoxesRow[];
  minValue: number;
  maxValue:number;
};

// Fetch function
const fetchStudentsVsBoxes = async (
  programId: string,
  month: string
): Promise<StudentsVsBoxesResponse> => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/meals/StudentsVsBoxes?schoolId=${programId}&month=${month}`
  );
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
};

const StudentVSNoofBoxes: React.FC = () => {
  const params = useSearchParams();
  const programId = params.get("programId");
  const month = params.get("month");

  const allParamsAvailable = programId && month;

  // ✅ Corrected type here
  const { data, error, isLoading } = useQuery<StudentsVsBoxesResponse>({
    queryKey: ["students-vs-boxes", programId, month],
    queryFn: () => fetchStudentsVsBoxes(programId!, month!),
    enabled: !!allParamsAvailable, // Only fetch if params exist
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleResize = () => {
        setIsMobile(window.innerWidth < 768);
      };
      window.addEventListener("resize", handleResize);
      handleResize();
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);

  if (isLoading) return <Loading />;
  if (error) return <ErrorDisplay message={(error as Error).message} />;

  // ✅ Access results correctly
  const cleanedData = (data?.results ?? [])
    .filter(
      (item) =>
        item.Date &&
        !item.Date.includes("TOTAL") &&
        !item.Date.includes("Sunday Excluded") &&
        (item.NoOfBoxes !== 0 || item.NoOfPresents !== 0)
    )
    .map((item) => ({
      Date: new Date(item.Date).toLocaleDateString("en-PK", {
        timeZone: "Asia/Karachi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
      NoOfBoxes: item.NoOfBoxes,
      NoOfPresents: item.NoOfPresents,
    }));


  const chartData: ChartData<"line"> = {
    labels: cleanedData.map((entry) => entry.Date),
    datasets: [
      {
        label: "Number of Meals",
        data: cleanedData.map((entry) => entry.NoOfBoxes),
        borderColor: "#A2BD9D",
        backgroundColor: "rgba(162, 189, 157, 0.2)",
        fill: true,
      },
      {
        label: "Number of Students",
        data: cleanedData.map((entry) => entry.NoOfPresents),
        borderColor: "#9B9B9B",
        backgroundColor: "rgba(155, 155, 155, 0.2)",
        fill: true,
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: {
          font: { weight: "bold", size: 14 },
          color: "#333",
        },
      },
      title: {
        display: true,
        text: "Number of Meals vs Number of Students",
        font: { weight: "bold", size: 16 },
        color: "#333",
      },
      tooltip: {
        callbacks: {
          label: (tooltipItem) =>
            tooltipItem.dataset.label + ": " + tooltipItem.formattedValue,
        },
      },
      datalabels: {
        display: isMobile,
      },
    },
    scales: {
      x: {

        ticks: {
          font: { weight: "bold", size: 12 },
          color: "#333",
          maxRotation: 90,
          minRotation: 90,
        },
      },
      y: {
        min:(data?.minValue  || 0)-10,
        max:(data?.maxValue  || 0)+10,
        ticks: {
          font: { weight: "bold", size: 12 },
          color: "#333",
          callback: (value) => value.toLocaleString(),
        },
      },
    },
  };

  return (
    <div>
      {chartData.datasets[0].data.length > 0 ? (
        <div className="h-[400px] p-4 md:p-6 w-full">
          <Line data={chartData} options={options} />
        </div>
      ) : (
        <div>No Data Found</div>
      )}
    </div>
  );
};

export default StudentVSNoofBoxes;

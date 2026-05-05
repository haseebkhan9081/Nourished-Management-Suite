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
export interface TeacherAttendanceRecord {
  acNo: string;
  Name: string;
  Present: string; // e.g., "24 days"
  Absent: string; // e.g., "2 days"
}

export interface TeachersAttendanceSummaryResponse {
  month: string; // e.g., "2025-08"
  data: TeacherAttendanceRecord[];
}

const getTeachersAttendanceSummary = async (
  programId: string,
  month: string
):Promise<TeachersAttendanceSummaryResponse> => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/attendance/TeachersAttendanceSummary?schoolId=${programId}&month=${month}`
  );
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
};

const TeachersAttendanceSummary: React.FC = () => {
  const params = useSearchParams();
  const programId = params.get("programId");
  const month = params.get("month");

  const allParamsAvailable =
    programId != null &&
    month != null;

  const { data, error, isLoading } =
    useQuery<TeachersAttendanceSummaryResponse>({
      queryKey: ["getTeachersAttendanceSummary", programId, month],
      queryFn: () => {
        if (allParamsAvailable) {
          return getTeachersAttendanceSummary(programId!, month!);
        } else {
          return Promise.resolve({ month: "", data: [] });
        }
      },
      enabled: !!allParamsAvailable,
      retry: 3, // Number of retry attempts
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), // Exponential backoff
    });
  console.log("TeachersAttendanceSummary in this commponenet: ", data?.data);
if (!data || data?.data.length === 0) {
  return null;
}
  if (isLoading) return <Loading/>;
  if (error) return <ErrorDisplay message={(error as Error).message}/>;
  // Early return if data is empty or undefined





  return (
    <>
      {data?.data && data?.data?.length > 0 && (
        <div className="p-4 md:p-6 w-full">
          <h2 className="text-2xl font-bold mb-4 text-primary">
            Staff Attendance Summary
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-primary">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                    Name
                  </th>
                  <th className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                    Presents
                  </th>
                  <th className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                    Absents
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.data?.map(
                  (
                    Attendance: {
                      acNo: string;
                      Name: string;
                      Present: string;
                      Absent: string;
                    },
                    index: number
                  ) => (
                    <tr key={index}>
                      <td className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                        {Attendance.Name}
                      </td>
                      <td className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                        {Attendance.Present}
                      </td>
                      <td className="border border-primary px-2 py-1 text-sm md:px-4 md:py-2">
                        {Attendance.Absent}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

export default TeachersAttendanceSummary;

"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";

const SelectMonth = () => {
  const searchParams = useSearchParams();

  // Get initial month from URL (format: YYYY-MM)
  const initialMonth = searchParams.get("month") || "";

  const [selectedMonth, setSelectedMonth] = React.useState(initialMonth);

  React.useEffect(() => {
    // Sync month selection back to URL
    const url = new URL(window.location.href);
    if (selectedMonth) {
      url.searchParams.set("month", selectedMonth);
    } else {
      url.searchParams.delete("month");
    }
    window.history.pushState({}, "", url.toString());
  }, [selectedMonth]);

  return (
    <div className="w-full justify-center items-center flex space-y-4 flex-col">
      <h3 className="text-slate-500">Month:</h3>
      <input
        type="month"
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
        className="w-[280px] sm:w-48 border-[#A2BD9D] focus:ring-[#A2BD9D] rounded-xl px-3 py-2"
        placeholder="Select month..."
      />
    </div>
  );
};

export default SelectMonth;

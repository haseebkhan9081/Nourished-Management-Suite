"use client"
//@ts-nocheck
import { Line, Doughnut, Bar } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

export default function NourishedPaymentInsightsPage() {
  // Line chart: Transactions over time by source
  const lineData = {
    labels: ["Jan 1", "Jan 2", "Jan 3", "Jan 4", "Jan 5", "Jan 6", "Jan 7"],
    datasets: [
      {
        label: "Stripe",
        data: [80, 110, 150, 100, 130, 140, 160],
        borderColor: "#A2BD9D",
        backgroundColor: "#A2BD9D33",
        tension: 0.3,
        fill: true,
        pointRadius: 4,
      },
      {
        label: "Wells Fargo",
        data: [40, 50, 30, 40, 70, 30, 50],
        borderColor: "#8FA889",
        backgroundColor: "#8FA88933",
        tension: 0.3,
        fill: true,
        pointRadius: 4,
      },
    ],
  }

  // Doughnut: Total volume by source
  const doughnutData = {
    labels: ["Stripe", "Wells Fargo"],
    datasets: [
      {
        data: [61540, 22780],
        backgroundColor: ["#A2BD9D", "#8FA889"],
        hoverOffset: 10,
      },
    ],
  }

  // Bar chart: Daily volume by source
  const barData = {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    datasets: [
      {
        label: "Stripe",
        data: [8000, 10000, 12000, 9000, 11000, 13000, 14000],
        backgroundColor: "#A2BD9D",
        borderRadius: 4,
      },
      {
        label: "Wells Fargo",
        data: [4000, 5000, 3000, 4000, 6000, 5000, 7000],
        backgroundColor: "#8FA889",
        borderRadius: 4,
      },
    ],
  }

  const options = {
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: { color: "#374151", font: { weight: "500" } },
      },
      tooltip: {
        bodyColor: "#374151",
        titleColor: "#111827",
      },
    },
    scales: {
      x: {
        ticks: { color: "#6B7280" },
        grid: { color: "#E5E7EB" },
      },
      y: {
        ticks: { color: "#6B7280" },
        grid: { color: "#E5E7EB" },
      },
    },
    responsive: true,
    maintainAspectRatio: false,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-gray-600">
          Overview of transactions from Stripe and Wells Fargo
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Transactions</p>
          <p className="text-2xl font-semibold">1,248</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Volume</p>
          <p className="text-2xl font-semibold">$84,320</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Stripe</p>
          <p className="text-2xl font-semibold">$61,540</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Wells Fargo</p>
          <p className="text-2xl font-semibold">$22,780</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-4 shadow-sm h-72">
          <h3 className="text-gray-700 font-medium mb-2">Transactions Over Time</h3>
          <div className="h-56">
            <Line data={lineData} options={options} />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm h-72">
          <h3 className="text-gray-700 font-medium mb-2">Total Volume by Source</h3>
          <div className="h-56 flex items-center justify-center">
            <Doughnut data={doughnutData} options={options} />
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-white rounded-lg p-4 shadow-sm h-72">
        <h3 className="text-gray-700 font-medium mb-2">Daily Transaction Volume</h3>
        <div className="h-56">
          <Bar data={barData} options={options} />
        </div>
      </div>

      {/* Table placeholder */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <p className="text-gray-400 text-center">
          Transactions table (coming soon)
        </p>
      </div>
    </div>
  )
}

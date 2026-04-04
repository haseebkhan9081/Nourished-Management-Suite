//@ts-nocheck
"use client"

import { useEffect, useState } from "react"
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Transaction {
  id: number
  date: string
  amount: number
  flag: string | null
  check_number: string | null
  details: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function groupByDate(transactions: Transaction[]) {
  const map: Record<string, number> = {}
  transactions.forEach(tx => {
    const d = tx.date.split("T")[0] // "2026-02-17"
    map[d] = (map[d] || 0) + Math.abs(tx.amount)
  })
  return map
}

function groupByDayOfWeek(transactions: Transaction[]) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const map: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 }
  transactions.forEach(tx => {
    const day = days[new Date(tx.date).getDay()]
    map[day] += Math.abs(tx.amount)
  })
  return days.map(d => map[d])
}

function formatCurrency(value: number) {
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 0 })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function NourishedPaymentInsightsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/transactions`
        )
        if (!res.ok) throw new Error("Failed to fetch transactions")
        const data = await res.json()
        setTransactions(data.transactions)
      } catch (err: any) {
        setError(err.message || "Something went wrong")
      } finally {
        setLoading(false)
      }
      

    }

    fetchTransactions()
  }, [])

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalVolume = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  const totalCount  = transactions.length

  // Credits (positive amounts) vs Debits (negative amounts)
  const credits = transactions.filter(tx => tx.amount > 0)
  const debits  = transactions.filter(tx => tx.amount < 0)
  const totalCredits = credits.reduce((sum, tx) => sum + parseFloat(tx.amount), 0)
  const totalDebits  = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

  // ── Line chart: volume per date ────────────────────────────────────────────
  const byDate     = groupByDate(transactions)
  const dateLabels = Object.keys(byDate).sort().slice(-14) // last 14 days
  const dateValues = dateLabels.map(d => byDate[d])

  const lineData = {
    labels: dateLabels,
    datasets: [
      {
        label: "Daily Volume",
        data: dateValues,
        borderColor: "#A2BD9D",
        backgroundColor: "#A2BD9D33",
        tension: 0.3,
        fill: true,
        pointRadius: 4,
      },
    ],
  }

  // ── Doughnut: credits vs debits ────────────────────────────────────────────
  const doughnutData = {
    labels: ["Credits (In)", "Debits (Out)"],
    datasets: [
      {
        data: [totalCredits, totalDebits],
        backgroundColor: ["#A2BD9D", "#8FA889"],
        hoverOffset: 10,
      },
    ],
  }

  // ── Bar chart: volume by day of week ──────────────────────────────────────
  const barData = {
    labels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    datasets: [
      {
        label: "Volume by Day",
        data: groupByDayOfWeek(transactions),
        backgroundColor: "#A2BD9D",
        borderRadius: 4,
      },
    ],
  }

  const chartOptions = {
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: { color: "#374151", font: { weight: "500" } },
      },
      tooltip: {
        bodyColor: "#374151",
        titleColor: "#111827",
        callbacks: {
          label: (ctx: any) => ` $${ctx.parsed.y?.toLocaleString() ?? ctx.parsed.toLocaleString()}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: "#6B7280" }, grid: { color: "#E5E7EB" } },
      y: { ticks: { color: "#6B7280" }, grid: { color: "#E5E7EB" } },
    },
    responsive: true,
    maintainAspectRatio: false,
  }

  const doughnutOptions = {
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: { color: "#374151", font: { weight: "500" } },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` $${ctx.parsed.toLocaleString()}`,
        },
      },
    },
    responsive: true,
    maintainAspectRatio: false,
  }

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Loading transactions…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-gray-600">
          Overview of transactions from your payment exports
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Transactions</p>
          <p className="text-2xl font-semibold">{totalCount.toLocaleString()}</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Volume</p>
          <p className="text-2xl font-semibold">{formatCurrency(totalVolume)}</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Credits (In)</p>
          <p className="text-2xl font-semibold text-[#A2BD9D]">
            {formatCurrency(totalCredits)}
          </p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Debits (Out)</p>
          <p className="text-2xl font-semibold text-red-400">
            {formatCurrency(totalDebits)}
          </p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-4 shadow-sm h-72">
          <h3 className="text-gray-700 font-medium mb-2">Volume Over Time</h3>
          <div className="h-56">
            <Line data={lineData} options={chartOptions} />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm h-72">
          <h3 className="text-gray-700 font-medium mb-2">Credits vs Debits</h3>
          <div className="h-56 flex items-center justify-center">
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-lg p-4 shadow-sm h-72">
        <h3 className="text-gray-700 font-medium mb-2">Volume by Day of Week</h3>
        <div className="h-56">
          <Bar data={barData} options={chartOptions} />
        </div>
      </div>

      {/* Transactions table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="text-gray-700 font-medium">Recent Transactions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Flag</th>
                <th className="px-4 py-3 text-left">Check #</th>
                <th className="px-4 py-3 text-left">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.slice(0, 20).map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {tx.date.split("T")[0]}
                  </td>
                  <td className={`px-4 py-3 font-medium whitespace-nowrap ${
                    tx.amount < 0 ? "text-red-500" : "text-[#A2BD9D]"
                  }`}>
                    {tx.amount < 0 ? "-" : "+"}
                    {formatCurrency(Math.abs(tx.amount))}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{tx.flag ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{tx.check_number ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                    {tx.details ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {transactions.length > 20 && (
          <div className="px-4 py-3 border-t bg-gray-50 text-center">
            <p className="text-xs text-gray-400">
              Showing 20 of {transactions.length} transactions
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
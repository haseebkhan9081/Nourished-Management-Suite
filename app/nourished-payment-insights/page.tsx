// app/nourished-payment-insights/page.tsx

export default function NourishedPaymentInsightsPage() {
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

      {/* Charts placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm h-72 flex items-center justify-center text-gray-400">
          Transactions Over Time (Chart)
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm h-72 flex items-center justify-center text-gray-400">
          Payment Provider Split (Chart)
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

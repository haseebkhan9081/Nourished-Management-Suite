//@ts-nocheck
"use client"

import { useState } from "react"
import Link from "next/link"
import * as XLSX from "xlsx-js-style"
import { ArrowLeft, Download, Loader2, Calendar } from "lucide-react"

interface DonorRow {
  id: string
  name: string
  email: string | null
  monthly: Record<string, number>
  total: number
}

interface Section {
  name: string
  note?: string
  donors: DonorRow[]
  sectionTotals: Record<string, number>
  sectionTotal: number
}

interface ReportData {
  start: string
  end: string
  months: string[]
  sections: Section[]
  grandTotals: Record<string, number>
  grandTotal: number
}

function formatCurrency(value: number) {
  if (value === 0) return "—"
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatMonthLabel(ym: string) {
  const [y, m] = ym.split("-")
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" })
}

// Default range: last 6 months through current month
function defaultRange() {
  const now = new Date()
  const endY = now.getFullYear()
  const endM = now.getMonth() + 1
  const start = new Date(endY, endM - 6, 1)
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`
  const endStr = `${endY}-${String(endM).padStart(2, "0")}`
  return { start: startStr, end: endStr }
}

export default function DonorReportPage() {
  const defaults = defaultRange()
  const [start, setStart] = useState<string>(defaults.start)
  const [end, setEnd] = useState<string>(defaults.end)
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch(`/api/reports/donor-pivot?start=${start}&end=${end}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Failed to load report")
      setData(j)
    } catch (err: any) {
      setError(err.message || "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const downloadExcel = () => {
    if (!data) return

    // ── Style library ──────────────────────────────────────────────────────
    const CURRENCY_FMT = '"$"#,##0;[Red]-"$"#,##0;"—"'
    const border = { top: { style: "thin", color: { rgb: "E5E7EB" } },
                     bottom: { style: "thin", color: { rgb: "E5E7EB" } },
                     left: { style: "thin", color: { rgb: "E5E7EB" } },
                     right: { style: "thin", color: { rgb: "E5E7EB" } } }

    const titleStyle = {
      font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "A2BD9D" } },
      alignment: { horizontal: "left", vertical: "center" },
    }
    const metaStyle = {
      font: { sz: 10, color: { rgb: "6B7280" } },
      alignment: { horizontal: "left", vertical: "center" },
    }
    const headerStyle = {
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "5A7A55" } },
      alignment: { horizontal: "center", vertical: "center" },
      border,
    }
    const headerLeftStyle = { ...headerStyle, alignment: { horizontal: "left", vertical: "center" } }
    const sectionHeaderStyle = {
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "8FA889" } },
      alignment: { horizontal: "left", vertical: "center" },
    }
    const donorNameStyle = {
      font: { sz: 10, color: { rgb: "1F2937" } },
      alignment: { horizontal: "left", vertical: "center" },
      border,
    }
    const donorEmailStyle = {
      font: { sz: 9, color: { rgb: "6B7280" } },
      alignment: { horizontal: "left", vertical: "center" },
      border,
    }
    const donorAmountStyle = {
      font: { sz: 10, color: { rgb: "1F2937" } },
      alignment: { horizontal: "right", vertical: "center" },
      numFmt: CURRENCY_FMT,
      border,
    }
    const donorTotalStyle = {
      font: { bold: true, sz: 10, color: { rgb: "5A7A55" } },
      alignment: { horizontal: "right", vertical: "center" },
      numFmt: CURRENCY_FMT,
      fill: { fgColor: { rgb: "F5F9F3" } },
      border,
    }
    const sectionTotalLabelStyle = {
      font: { bold: true, sz: 10, color: { rgb: "1F2937" } },
      alignment: { horizontal: "left", vertical: "center" },
      fill: { fgColor: { rgb: "F3F4F6" } },
      border,
    }
    const sectionTotalAmountStyle = {
      font: { bold: true, sz: 10, color: { rgb: "1F2937" } },
      alignment: { horizontal: "right", vertical: "center" },
      numFmt: CURRENCY_FMT,
      fill: { fgColor: { rgb: "F3F4F6" } },
      border,
    }
    const grandTotalLabelStyle = {
      font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "left", vertical: "center" },
      fill: { fgColor: { rgb: "111827" } },
      border,
    }
    const grandTotalAmountStyle = {
      font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "right", vertical: "center" },
      numFmt: CURRENCY_FMT,
      fill: { fgColor: { rgb: "111827" } },
      border,
    }
    const noteStyle = {
      font: { italic: true, sz: 9, color: { rgb: "9CA3AF" } },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
    }

    // ── Build sheet cell-by-cell so each cell can carry its own style ──────
    const totalCols = data.months.length + 3 // Donor + Email + months + Total
    const ws: Record<string, any> = {}
    const merges: XLSX.Range[] = []
    let r = 0 // current row index

    const setCell = (row: number, col: number, value: any, style?: any) => {
      const ref = XLSX.utils.encode_cell({ r: row, c: col })
      const isNum = typeof value === "number"
      ws[ref] = { t: isNum ? "n" : "s", v: value, s: style }
    }

    // Row 0: Title (merged across all columns)
    setCell(r, 0, "Donor Report", titleStyle)
    for (let c = 1; c < totalCols; c++) setCell(r, c, "", titleStyle)
    merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } })
    r++

    // Row 1: Period
    setCell(r, 0, `Period: ${formatMonthLabel(data.start)} – ${formatMonthLabel(data.end)}`, metaStyle)
    for (let c = 1; c < totalCols; c++) setCell(r, c, "", metaStyle)
    merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } })
    r++

    // Row 2: Generated timestamp
    setCell(r, 0, `Generated: ${new Date().toLocaleString("en-US")}`, metaStyle)
    for (let c = 1; c < totalCols; c++) setCell(r, c, "", metaStyle)
    merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } })
    r++

    // Row 3: Summary line
    const totalDonors = data.sections.reduce((n, s) => n + s.donors.length, 0)
    setCell(r, 0, `${totalDonors} unique donors · ${data.months.length} month${data.months.length !== 1 ? "s" : ""} · grand total $${Math.round(data.grandTotal).toLocaleString()}`, metaStyle)
    for (let c = 1; c < totalCols; c++) setCell(r, c, "", metaStyle)
    merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } })
    r++

    // Spacer row
    r++

    // Column header row
    const headerRow = r
    setCell(r, 0, "Donor", headerLeftStyle)
    setCell(r, 1, "Email", headerLeftStyle)
    data.months.forEach((m, i) => setCell(r, 2 + i, formatMonthLabel(m), headerStyle))
    setCell(r, totalCols - 1, "Total", headerStyle)
    r++

    // Sections
    for (const section of data.sections) {
      // Section header row (merged)
      const donorCount = section.donors.length
      const sectionLabel = `${section.name}  ·  ${donorCount} donor${donorCount !== 1 ? "s" : ""}`
      setCell(r, 0, sectionLabel, sectionHeaderStyle)
      for (let c = 1; c < totalCols; c++) setCell(r, c, "", sectionHeaderStyle)
      merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } })
      r++

      // Section note (optional)
      if (section.note) {
        setCell(r, 0, section.note, noteStyle)
        for (let c = 1; c < totalCols; c++) setCell(r, c, "", noteStyle)
        merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } })
        r++
      }

      // Donor rows
      for (const d of section.donors) {
        setCell(r, 0, d.name, donorNameStyle)
        setCell(r, 1, d.email ?? "", donorEmailStyle)
        data.months.forEach((m, i) => {
          const amt = d.monthly[m] ?? 0
          setCell(r, 2 + i, amt === 0 ? "" : amt, donorAmountStyle)
        })
        setCell(r, totalCols - 1, d.total, donorTotalStyle)
        r++
      }

      // Section subtotal row
      setCell(r, 0, `${section.name} — Subtotal`, sectionTotalLabelStyle)
      setCell(r, 1, "", sectionTotalLabelStyle)
      data.months.forEach((m, i) => {
        const amt = section.sectionTotals[m] ?? 0
        setCell(r, 2 + i, amt === 0 ? "" : amt, sectionTotalAmountStyle)
      })
      setCell(r, totalCols - 1, section.sectionTotal, sectionTotalAmountStyle)
      r++

      // Spacer between sections
      r++
    }

    // Grand total row
    setCell(r, 0, "GRAND TOTAL", grandTotalLabelStyle)
    setCell(r, 1, "", grandTotalLabelStyle)
    data.months.forEach((m, i) => {
      const amt = data.grandTotals[m] ?? 0
      setCell(r, 2 + i, amt === 0 ? "" : amt, grandTotalAmountStyle)
    })
    setCell(r, totalCols - 1, data.grandTotal, grandTotalAmountStyle)
    const grandTotalRow = r
    r++

    // Sheet bounds
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: totalCols - 1 } })
    ws["!merges"] = merges

    // Column widths (auto-ish: donor + email wider, months + total fixed)
    ws["!cols"] = [
      { wch: 32 },        // Donor
      { wch: 30 },        // Email
      ...data.months.map(() => ({ wch: 14 })), // Months
      { wch: 16 },        // Total
    ]

    // Row heights
    ws["!rows"] = []
    ws["!rows"][0] = { hpt: 28 }   // title row taller
    ws["!rows"][headerRow] = { hpt: 22 }
    ws["!rows"][grandTotalRow] = { hpt: 24 }

    // Freeze header row and first 2 columns
    ws["!freeze"] = { xSplit: 2, ySplit: headerRow + 1 }
    ;(ws as any)["!views"] = [{ state: "frozen", ySplit: headerRow + 1, xSplit: 2 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Donor Report")
    const filename = `donor-report-${data.start}-to-${data.end}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        href="/nourished-payment-insights"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 shadow-sm transition w-fit"
      >
        <ArrowLeft size={14} /> Back to Payment Insights
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Donor Report (Monthly Pivot)</h1>
        <p className="text-xs text-gray-400 mt-1">
          Unique donors per section, amounts per month. Stripe section is live from the Stripe API. Wells Fargo named donors come from "ONLINE TRANSFER FROM X" patterns in the bank CSV. Checks are pooled as "Unknown Check Donor" until manually tagged. Benevity batches show as lump sums until you upload a Benevity CSV.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg p-4 shadow-sm flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1 max-w-xs">
          <label className="block text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Start Month</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="month"
              value={start}
              onChange={e => setStart(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#A2BD9D]"
            />
          </div>
        </div>
        <div className="flex-1 max-w-xs">
          <label className="block text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">End Month</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="month"
              value={end}
              onChange={e => setEnd(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#A2BD9D]"
            />
          </div>
        </div>
        <button
          onClick={generate}
          disabled={loading || !start || !end}
          className="px-4 py-2 bg-[#A2BD9D] hover:bg-[#8FA889] text-white font-medium rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? "Generating…" : "Generate Report"}
        </button>
        {data && !loading && (
          <button
            onClick={downloadExcel}
            className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-lg text-sm flex items-center gap-2"
          >
            <Download size={14} />
            Download Excel
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#A2BD9D]" />
          <p className="text-sm text-gray-500">Pulling donor data from Stripe + bank transactions…</p>
        </div>
      )}

      {/* Report */}
      {data && !loading && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div>
              <h3 className="text-gray-800 font-semibold">
                {formatMonthLabel(data.start)} – {formatMonthLabel(data.end)}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {data.sections.reduce((n, s) => n + s.donors.length, 0)} unique donors · {data.months.length} month{data.months.length !== 1 ? "s" : ""} · Grand total {formatCurrency(data.grandTotal)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Donor</th>
                  <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Email</th>
                  {data.months.map(m => (
                    <th key={m} className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatMonthLabel(m)}</th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold bg-gray-100">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.sections.length === 0 && (
                  <tr>
                    <td colSpan={data.months.length + 3} className="px-4 py-8 text-center text-gray-400 text-sm">
                      No donors found in this date range
                    </td>
                  </tr>
                )}
                {data.sections.map(section => (
                  <SectionRows key={section.name} section={section} months={data.months} />
                ))}

                {/* Grand total row */}
                <tr className="bg-gray-900 text-white font-bold">
                  <td className="px-4 py-3" colSpan={2}>GRAND TOTAL</td>
                  {data.months.map(m => (
                    <td key={m} className="px-4 py-3 text-right whitespace-nowrap">
                      {formatCurrency(data.grandTotals[m] ?? 0)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatCurrency(data.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionRows({ section, months }: { section: Section; months: string[] }) {
  return (
    <>
      {/* Section header */}
      <tr className="bg-[#A2BD9D]/10">
        <td colSpan={months.length + 3} className="px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5a7a55] uppercase tracking-wide">{section.name}</span>
            <span className="text-xs text-gray-500">{section.donors.length} donor{section.donors.length !== 1 ? "s" : ""}</span>
          </div>
          {section.note && (
            <p className="text-[11px] text-gray-500 mt-0.5">{section.note}</p>
          )}
        </td>
      </tr>
      {section.donors.length === 0 ? (
        <tr>
          <td colSpan={months.length + 3} className="px-4 py-3 text-center text-gray-400 text-xs italic">
            No donors in this section for the selected range
          </td>
        </tr>
      ) : (
        section.donors.map(donor => (
          <tr key={donor.id} className="hover:bg-gray-50/50">
            <td className="px-4 py-2 text-gray-800">{donor.name}</td>
            <td className="px-4 py-2 text-gray-500 text-xs">{donor.email ?? "—"}</td>
            {months.map(m => (
              <td key={m} className="px-4 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                {formatCurrency(donor.monthly[m] ?? 0)}
              </td>
            ))}
            <td className="px-4 py-2 text-right font-semibold text-[#A2BD9D] whitespace-nowrap tabular-nums">
              {formatCurrency(donor.total)}
            </td>
          </tr>
        ))
      )}
      {/* Section total */}
      <tr className="bg-gray-50 font-semibold">
        <td className="px-4 py-2 text-gray-700 text-xs uppercase" colSpan={2}>{section.name} — Total</td>
        {months.map(m => (
          <td key={m} className="px-4 py-2 text-right text-gray-900 whitespace-nowrap tabular-nums">
            {formatCurrency(section.sectionTotals[m] ?? 0)}
          </td>
        ))}
        <td className="px-4 py-2 text-right text-[#5a7a55] whitespace-nowrap tabular-nums">
          {formatCurrency(section.sectionTotal)}
        </td>
      </tr>
    </>
  )
}

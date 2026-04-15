// Parser for Benevity Causes Portal "Detailed Donation Report" CSVs.
//
// Structure:
//   1. Metadata header (key,value rows): Charity Name, Disbursement ID, etc.
//   2. Separator line: "#-------------------------------------------"
//   3. Blank line
//   4. Column header row starting with "Company,Project,Donation Date,..."
//   5. Data rows — one per donor
//   6. "Totals,,,,,,..." row — skip
//   7. Trailer: "Total Donations (Gross),X" / "Check Fee,Y" / "Net Total Payment,Z"

export interface BenevityDonation {
  disbursementId: string
  transactionId: string         // Benevity's unique ID per donation — dedupe key
  donationDate: string          // ISO date
  company: string | null        // employer code/name (e.g. "N1234")
  project: string | null
  donorFirstName: string | null
  donorLastName: string | null
  donorEmail: string | null
  city: string | null
  stateProvince: string | null
  postalCode: string | null
  donationFrequency: string | null  // "One-time" / "Recurring" / "Payroll"
  donationAmount: number        // donor personal contribution
  matchAmount: number           // employer match
  causeSupportFee: number
  merchantFee: number
  currency: string
  comment: string | null
}

export interface BenevityParsedFile {
  charityName: string
  charityId: string
  disbursementId: string
  periodEnding: string | null
  currency: string
  paymentMethod: string | null
  grossTotal: number
  checkFee: number
  netTotal: number
  donations: BenevityDonation[]
  errors: string[]
}

// ---------------------------------------------------------------------------
// CSV line parser — respects quoted fields and escaped quotes
// ---------------------------------------------------------------------------
function parseCsvLine(line: string): string[] {
  const cols: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      cols.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  cols.push(current)
  return cols
}

function toNumber(s: string | undefined): number {
  if (!s) return 0
  const cleaned = s.trim().replace(/[,$]/g, "")
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------
export function parseBenevityCsv(text: string): BenevityParsedFile {
  const errors: string[] = []
  const lines = text.split(/\r?\n/).map(l => l)

  let charityName = ""
  let charityId = ""
  let disbursementId = ""
  let periodEnding: string | null = null
  let currency = "USD"
  let paymentMethod: string | null = null
  let grossTotal = 0
  let checkFee = 0
  let netTotal = 0

  // Phase 1: parse metadata header until we hit the column header row
  let columnHeaderIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const row = parseCsvLine(lines[i])
    const key = (row[0] ?? "").trim()
    const val = (row[1] ?? "").trim()

    if (key.startsWith("Company") && row.some(c => c.trim() === "Transaction ID")) {
      columnHeaderIdx = i
      break
    }

    if (!key) continue
    if (key === "Donations Report") continue
    if (key.startsWith("#---")) continue

    switch (key) {
      case "Charity Name":     charityName = val; break
      case "Charity ID":       charityId = val; break
      case "Disbursement ID":  disbursementId = val; break
      case "Period Ending":    periodEnding = val; break
      case "Currency":         currency = val; break
      case "Payment Method":   paymentMethod = val; break
    }
  }

  if (columnHeaderIdx === -1) {
    errors.push("Column header row not found (expected row starting with 'Company,...,Transaction ID')")
    return {
      charityName, charityId, disbursementId, periodEnding, currency, paymentMethod,
      grossTotal: 0, checkFee: 0, netTotal: 0, donations: [], errors,
    }
  }

  if (!disbursementId) {
    errors.push("Disbursement ID missing from metadata header")
  }

  // Phase 2: parse column header row and build column index map
  const headerRow = parseCsvLine(lines[columnHeaderIdx]).map(c => c.trim())
  const col = (name: string) => headerRow.findIndex(c => c.toLowerCase() === name.toLowerCase())

  const idx = {
    company:           col("Company"),
    project:           col("Project"),
    donationDate:      col("Donation Date"),
    firstName:         col("Donor First Name"),
    lastName:          col("Donor Last Name"),
    email:             col("Email"),
    city:              col("City"),
    stateProvince:     col("State/Province"),
    postalCode:        col("Postal Code"),
    comment:           col("Comment"),
    transactionId:     col("Transaction ID"),
    donationFrequency: col("Donation Frequency"),
    currency:          col("Currency"),
    totalDonation:     col("Total Donation to be Acknowledged"),
    matchAmount:       col("Match Amount"),
    causeSupportFee:   col("Cause Support Fee"),
    merchantFee:       col("Merchant Fee"),
  }

  if (idx.transactionId < 0 || idx.totalDonation < 0) {
    errors.push("Required columns (Transaction ID, Total Donation to be Acknowledged) not found in header")
  }

  // Phase 3: parse data rows until we hit a "Totals" row or a trailer row
  const donations: BenevityDonation[] = []
  for (let i = columnHeaderIdx + 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i])
    const firstCell = (row[0] ?? "").trim()

    if (!firstCell && row.every(c => !c.trim())) continue

    // End of data section
    if (firstCell === "Totals") break
    if (firstCell === "Total Donations (Gross)") {
      grossTotal = toNumber(row[1])
      continue
    }
    if (firstCell === "Check Fee") {
      checkFee = toNumber(row[1])
      continue
    }
    if (firstCell === "Net Total Payment") {
      netTotal = toNumber(row[1])
      continue
    }

    // Must have a Transaction ID to be a donation row
    const txnId = (row[idx.transactionId] ?? "").trim()
    if (!txnId) continue

    donations.push({
      disbursementId,
      transactionId:     txnId,
      donationDate:      (row[idx.donationDate] ?? "").trim(),
      company:           (row[idx.company] ?? "").trim() || null,
      project:           (row[idx.project] ?? "").trim() || null,
      donorFirstName:    (row[idx.firstName] ?? "").trim() || null,
      donorLastName:     (row[idx.lastName] ?? "").trim() || null,
      donorEmail:        (row[idx.email] ?? "").trim() || null,
      city:              (row[idx.city] ?? "").trim() || null,
      stateProvince:     (row[idx.stateProvince] ?? "").trim() || null,
      postalCode:        (row[idx.postalCode] ?? "").trim() || null,
      donationFrequency: (row[idx.donationFrequency] ?? "").trim() || null,
      currency:          ((row[idx.currency] ?? "").trim() || currency) as string,
      donationAmount:    toNumber(row[idx.totalDonation]),
      matchAmount:       toNumber(row[idx.matchAmount]),
      causeSupportFee:   toNumber(row[idx.causeSupportFee]),
      merchantFee:       toNumber(row[idx.merchantFee]),
      comment:           (row[idx.comment] ?? "").trim() || null,
    })
  }

  return {
    charityName, charityId, disbursementId, periodEnding, currency, paymentMethod,
    grossTotal, checkFee, netTotal, donations, errors,
  }
}

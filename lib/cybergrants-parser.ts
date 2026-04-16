// Parser for CyberGrants "Payment Detail" CSVs.
//
// Structure (single flat table, tab or comma delimited):
//   Row 0: header — Company Name, Pass-through Agent, CyberGrants Donation ID,
//          Program Name, Donation Start Date, Donation End Date,
//          Donation Designation, Donation Frequency, Donation Amount,
//          Donation Amount (Currency Code), Match Amount, Match Amount (Currency Code),
//          Payment Funding Source, Payment Gross Amount, Payment Gross Amount (Currency Code),
//          Merchant Fee, Merchant Fee (Currency Code), Processing Fee, Processing Fee (Currency Code),
//          Payment Net Amount, Payment Net Amount (Currency Code), Payment Number, Payment Date,
//          Payment Method, Donor First Name, Donor Last Name, Donor Address, Donor City,
//          Donor State, Donor Province, Donor ZIP/Postal Code, Donor Country,
//          Donor Email Address, Donor Telephone
//   Row 1+: data rows (one donation per row)
//
// One file can contain donations spanning multiple Payment Numbers, so a single
// CSV maps to one-or-more disbursements. We normalize output to the same shape
// as BenevityDonation so the existing /benevity/upload endpoint ingests both
// sources transparently (transaction IDs prefixed with "CG_" to prevent
// collisions with Benevity's alphanumeric IDs).

export interface CyberGrantsDonation {
  disbursementId: string
  transactionId: string
  donationDate: string
  company: string | null
  project: string | null
  donorFirstName: string | null
  donorLastName: string | null
  donorEmail: string | null
  city: string | null
  stateProvince: string | null
  postalCode: string | null
  donationFrequency: string | null
  donationAmount: number
  matchAmount: number
  causeSupportFee: number
  merchantFee: number
  currency: string
  comment: string | null
}

export interface CyberGrantsParsedFile {
  source: "cybergrants"
  disbursementIds: string[]
  donations: CyberGrantsDonation[]
  grossTotal: number
  netTotal: number
  errors: string[]
}

function parseCsvLine(line: string, delimiter: string): string[] {
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
    } else if (ch === delimiter && !inQuotes) {
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

function toIsoDate(s: string | undefined): string {
  if (!s) return ""
  const t = s.trim()
  // Format: M/D/YY or MM/DD/YYYY
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const [, mo, day, yr] = m
    let y = parseInt(yr, 10)
    if (y < 100) y += 2000
    return `${y}-${mo.padStart(2, "0")}-${day.padStart(2, "0")}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return t
}

export function isCyberGrantsCsv(text: string): boolean {
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) ?? ""
  const lower = firstLine.toLowerCase()
  return lower.includes("cybergrants donation id") || lower.includes("pass-through agent")
}

export function parseCyberGrantsCsv(text: string): CyberGrantsParsedFile {
  const errors: string[] = []
  const lines = text.split(/\r?\n/).filter(l => l.length > 0)

  if (lines.length === 0) {
    errors.push("Empty file")
    return { source: "cybergrants", disbursementIds: [], donations: [], grossTotal: 0, netTotal: 0, errors }
  }

  const header = lines[0]
  const delimiter = header.includes("\t") ? "\t" : ","
  const cols = parseCsvLine(header, delimiter).map(s => s.trim())

  const idx = (name: string): number => cols.findIndex(c => c.toLowerCase() === name.toLowerCase())

  const iCompany        = idx("Company Name")
  const iAgent          = idx("Pass-through Agent")
  const iDonationId     = idx("CyberGrants Donation ID")
  const iProgram        = idx("Program Name")
  const iDesignation    = idx("Donation Designation")
  const iFrequency      = idx("Donation Frequency")
  const iMerchantFee    = idx("Merchant Fee")
  const iProcessFee     = idx("Processing Fee")
  const iGross          = idx("Payment Gross Amount")
  const iNet            = idx("Payment Net Amount")
  const iFundingSource  = idx("Payment Funding Source")
  const iCurrency       = idx("Payment Net Amount (Currency Code)")
  const iPaymentNumber  = idx("Payment Number")
  const iPaymentDate    = idx("Payment Date")
  const iFirstName      = idx("Donor First Name")
  const iLastName       = idx("Donor Last Name")
  const iEmail          = idx("Donor Email Address")
  const iCity           = idx("Donor City")
  const iState          = idx("Donor State")
  const iZip            = idx("Donor ZIP/Postal Code")

  if (iDonationId === -1 || iPaymentNumber === -1 || iPaymentDate === -1 || iGross === -1) {
    errors.push("Missing required CyberGrants columns (CyberGrants Donation ID / Payment Number / Payment Date / Payment Gross Amount)")
    return { source: "cybergrants", disbursementIds: [], donations: [], grossTotal: 0, netTotal: 0, errors }
  }

  const donations: CyberGrantsDonation[] = []
  const disbursementSet = new Set<string>()
  let grossTotal = 0
  let netTotal = 0

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i], delimiter)
    if (row.length === 0 || row.every(c => !c.trim())) continue

    const donationId = (row[iDonationId] ?? "").trim()
    if (!donationId) continue

    const paymentNumber = (row[iPaymentNumber] ?? "").trim()
    if (!paymentNumber) {
      errors.push(`Row ${i + 1}: missing Payment Number`)
      continue
    }
    const paymentDate = toIsoDate(row[iPaymentDate])
    if (!paymentDate) {
      errors.push(`Row ${i + 1}: missing or invalid Payment Date`)
      continue
    }

    // Normalize to the same shape the bank's extractDisbursementId emits
    // ("ACH_11528523") so reconciliation ties out without extra mapping.
    const disbursementId = paymentNumber.toUpperCase().replace(/^ACH[\s_-]*/i, "ACH_")
    disbursementSet.add(disbursementId)

    // CyberGrants semantics: each CSV row is ONE payment. "Donation Amount"
    // and "Match Amount" are metadata about the original pledge — NOT the
    // per-row paid split. The actual money moving for this row is Payment
    // Gross Amount, and "Payment Funding Source" tells us whether it came
    // from the donor or the company. Summing Donation+Match double-counts.
    const gross = toNumber(row[iGross])
    const net = iNet >= 0 ? toNumber(row[iNet]) : gross
    grossTotal += gross
    netTotal += net

    const fundingSourceRaw = iFundingSource >= 0 ? (row[iFundingSource] ?? "").trim().toLowerCase() : ""
    const isCompanyFunded = /company|corporate|employer|match/i.test(fundingSourceRaw)
    const donationAmount = isCompanyFunded ? 0 : gross
    const matchAmount    = isCompanyFunded ? gross : 0

    const merchantFee   = iMerchantFee >= 0 ? toNumber(row[iMerchantFee]) : 0
    const processingFee = iProcessFee  >= 0 ? toNumber(row[iProcessFee])  : 0

    const frequencyRaw = (row[iFrequency] ?? "").trim().toLowerCase()
    const frequency = frequencyRaw === "one_time"  ? "One-time"
                    : frequencyRaw === "recurring" ? "Recurring"
                    : frequencyRaw || null

    const program     = iProgram     >= 0 ? ((row[iProgram]     ?? "").trim() || null) : null
    const designation = iDesignation >= 0 ? ((row[iDesignation] ?? "").trim() || null) : null
    const agent       = iAgent       >= 0 ? ((row[iAgent]       ?? "").trim() || null) : null

    const commentParts: string[] = []
    if (program) commentParts.push(program)
    if (designation && designation !== program) commentParts.push(designation)
    if (agent) commentParts.push(`via ${agent}`)
    commentParts.push(`CyberGrants (${isCompanyFunded ? "company match" : "donor gift"})`)

    donations.push({
      disbursementId,
      // Prefix donation id so it cannot collide with Benevity's Transaction IDs
      // inside the shared benevity_donation table's UNIQUE(transaction_id).
      transactionId: `CG_${donationId}`,
      donationDate: paymentDate,
      company: iCompany >= 0 ? ((row[iCompany] ?? "").trim() || null) : null,
      project: program || designation || null,
      donorFirstName: iFirstName >= 0 ? ((row[iFirstName] ?? "").trim() || null) : null,
      donorLastName:  iLastName  >= 0 ? ((row[iLastName]  ?? "").trim() || null) : null,
      donorEmail:     iEmail     >= 0 ? ((row[iEmail]     ?? "").trim() || null) : null,
      city:           iCity      >= 0 ? ((row[iCity]      ?? "").trim() || null) : null,
      stateProvince:  iState     >= 0 ? ((row[iState]     ?? "").trim() || null) : null,
      postalCode:     iZip       >= 0 ? ((row[iZip]       ?? "").trim() || null) : null,
      donationFrequency: frequency,
      donationAmount,
      matchAmount,
      causeSupportFee: processingFee,
      merchantFee,
      currency: iCurrency >= 0 ? ((row[iCurrency] ?? "").trim() || "USD") : "USD",
      comment: commentParts.join(" · "),
    })
  }

  return {
    source: "cybergrants",
    disbursementIds: Array.from(disbursementSet),
    donations,
    grossTotal,
    netTotal,
    errors,
  }
}

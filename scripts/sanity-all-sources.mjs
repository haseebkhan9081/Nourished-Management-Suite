#!/usr/bin/env node
// Cross-source sanity: Bank × Benevity × Stripe (via bank transfers).
// Calls the Express backend only (unauthenticated). Replicates the
// Next.js /api/reports/benevity-reconciliation logic in-process so it
// works without a signed-in session.
// Usage: node scripts/sanity-all-sources.mjs

const BACKEND = 'http://localhost:80/api'
const BANK_CURRENT = 256898.70  // WF online balance 04/15/26

const money = n => '$' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const section = t => `\n${'═'.repeat(72)}\n  ${t}\n${'═'.repeat(72)}`
const padL = (s, n) => String(s).padStart(n)
const iso = d => (d ? new Date(d).toISOString().slice(0, 10) : null)
const ym  = d => iso(d).slice(0, 7)
const n2  = x => Math.round(Number(x || 0) * 100) / 100

async function j(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`)
  return r.json()
}

console.log('Fetching from Express backend (port 80)...')
const [txRes, disRes] = await Promise.all([
  j(`${BACKEND}/transactions`),
  j(`${BACKEND}/benevity/disbursements`),
])
const bank = (txRes.transactions ?? []).map(r => ({ ...r, amount: Number(r.amount) }))
const disbursements = disRes.disbursements ?? []

// ---------------------------------------------------------------------------
// 1. BANK
// ---------------------------------------------------------------------------
console.log(section('1. BANK — transaction table (Postgres via Express)'))
const bankTotal = bank.reduce((s, r) => s + r.amount, 0)
const credits = bank.filter(r => r.amount > 0)
const debits  = bank.filter(r => r.amount < 0)
const dates   = bank.map(r => iso(r.date)).sort()

console.log(`Row count:                 ${bank.length}`)
console.log(`Date range:                ${dates[0]} → ${dates.at(-1)}`)
console.log(`Credits:                   ${padL(credits.length,4)} rows  ${padL(money(credits.reduce((s,r)=>s+r.amount,0)),16)}`)
console.log(`Debits:                    ${padL(debits.length,4)} rows  ${padL(money(debits.reduce((s,r)=>s+r.amount,0)),16)}`)
console.log(`Net (dashboard total):                        ${padL(money(bankTotal),16)}`)
console.log(`Bank balance (WF online):                     ${padL(money(BANK_CURRENT),16)}`)
const gap = BANK_CURRENT - bankTotal
console.log(`Gap:                                          ${padL(money(gap),16)}  ${Math.abs(gap) < 0.01 ? '✓ reconciled' : '✗'}`)

// Confirm the 20 backfill rows landed
const spotChecks = [
  { date: '2024-03-27', amount: 2000, mustContain: 'Etransfer' },
  { date: '2024-08-09', amount: 10000, mustContain: 'Ismail K' },
  { date: '2024-09-20', amount: 10000, mustContain: '2nd Installement' },
  { date: '2024-10-15', amount: 9.41,  mustContain: 'Stripe' },
]
console.log('\nBackfill spot-checks:')
for (const sc of spotChecks) {
  const found = bank.find(r => iso(r.date) === sc.date && Math.abs(r.amount - sc.amount) < 0.01 && (r.details || '').toLowerCase().includes(sc.mustContain.toLowerCase()))
  console.log(`  ${found ? '✓' : '✗'} ${sc.date} ${money(sc.amount).padStart(12)} — ${sc.mustContain}${found ? '' : '  MISSING'}`)
}

// DB-internal duplicates (same date+amount+normalized details)
const seen = new Map()
for (const r of bank) {
  const k = `${iso(r.date)}|${r.amount.toFixed(2)}|${(r.details||'').trim().toUpperCase().replace(/\s+/g,' ')}`
  seen.set(k, (seen.get(k) ?? 0) + 1)
}
const dupes = [...seen.entries()].filter(([,c]) => c > 1)
console.log(`\nInternal duplicates:       ${dupes.length === 0 ? '✓ none' : `✗ ${dupes.length} duplicate keys`}`)

// Amount validity
const badAmounts = bank.filter(r => !Number.isFinite(r.amount) || r.amount === 0)
console.log(`Invalid amounts:           ${badAmounts.length === 0 ? '✓ all rows valid' : `✗ ${badAmounts.length} rows`}`)

// ---------------------------------------------------------------------------
// 2. BENEVITY (disbursements table)
// ---------------------------------------------------------------------------
console.log(section('2. BENEVITY — disbursements table'))
const dSum = k => disbursements.reduce((s, d) => s + Number(d[k] || 0), 0)
const firstD = disbursements.map(d => iso(d.first_donation_at)).filter(Boolean).sort()[0]
const lastD  = disbursements.map(d => iso(d.last_donation_at)).filter(Boolean).sort().at(-1)

console.log(`Disbursements:             ${disbursements.length}`)
console.log(`Total donations (rows):    ${dSum('donation_count')}`)
console.log(`Date range:                ${firstD} → ${lastD}`)
console.log(`Gross donations:           ${padL(money(dSum('total_donation')),16)}`)
console.log(`Match total:               ${padL(money(dSum('total_match')),16)}`)
console.log(`Fees total:                ${padL(money(dSum('total_fees')),16)}`)
console.log(`Net received (sum):        ${padL(money(dSum('net_received')),16)}`)

// Internal sanity: each disbursement's gross + match - fees should equal net
let mathOk = 0, mathBad = []
for (const d of disbursements) {
  const expected = n2(Number(d.total_donation) + Number(d.total_match) - Number(d.total_fees))
  const actual = n2(d.net_received)
  if (Math.abs(expected - actual) < 0.01) mathOk++
  else mathBad.push({ id: d.disbursement_id, expected, actual, diff: n2(actual - expected) })
}
console.log(`\nPer-disbursement math (gross + match - fees = net):  ${mathOk}/${disbursements.length} ${mathBad.length === 0 ? '✓' : '✗'}`)
for (const b of mathBad.slice(0, 5)) {
  console.log(`  ✗ ${b.id}  expected ${money(b.expected)}  actual ${money(b.actual)}  Δ ${money(b.diff)}`)
}

// ---------------------------------------------------------------------------
// 3. BENEVITY × BANK — in-process replica of reconciliation route
// ---------------------------------------------------------------------------
console.log(section('3. BENEVITY × BANK — reconciliation'))
function extractDisbursementId(details) {
  if (!details) return null
  const refTn = details.match(/REF\*TN\*([A-Z0-9]+)/i)
  if (refTn) return refTn[1].toUpperCase()
  const ach = details.match(/ACH_?(\d+)/i)
  if (ach) return `ACH_${ach[1]}`
  const aog = details.match(/AMER ONLINE GIV[^\s]*\s+\S+\s+\S+\s+\S+\s+([A-Z0-9]{8,})/i)
  if (aog) return aog[1].toUpperCase()
  return null
}
const platformRows = bank
  .filter(tx => tx.amount > 0 && /AMER ONLINE GIV|CYBERGRANT|REF\*TN\*|BENEV/i.test(tx.details || ''))
  .map(tx => ({
    date: iso(tx.date),
    amount: tx.amount,
    details: tx.details || '',
    disbursementId: extractDisbursementId(tx.details || ''),
    platform: /CYBERGRANT/i.test(tx.details || '') ? 'cybergrants' : 'aog',
  }))
const benMap = new Map(disbursements.map(d => [d.disbursement_id.toUpperCase(), d]))
const rows = []
const matched = new Set()
for (const b of platformRows) {
  if (b.disbursementId && benMap.has(b.disbursementId)) {
    const ben = benMap.get(b.disbursementId)
    const benNet = Number(ben.net_received) || 0
    const diff = n2(b.amount - benNet)
    rows.push({ status: Math.abs(diff) < 0.01 ? 'matched' : 'mismatch', ...b, benNet, diff })
    matched.add(b.disbursementId)
  } else {
    rows.push({ status: 'missing_benevity', ...b, benNet: null, diff: null })
  }
}
for (const d of disbursements) {
  if (matched.has(d.disbursement_id.toUpperCase())) continue
  rows.push({ status: 'missing_bank', date: null, amount: null, details: null, disbursementId: d.disbursement_id, benNet: Number(d.net_received) || 0 })
}
const byStatus = rows.reduce((a, r) => (a[r.status] = (a[r.status] ?? 0) + 1, a), {})
console.log(`Matched (bank ↔ Benevity):       ${byStatus.matched ?? 0}`)
console.log(`Amount mismatches:               ${byStatus.mismatch ?? 0}`)
console.log(`Bank rows w/o Benevity CSV:      ${byStatus.missing_benevity ?? 0}  ← upload those CSVs`)
console.log(`Benevity disbursements w/o bank: ${byStatus.missing_bank ?? 0}`)

if (byStatus.mismatch) {
  console.log('\nMismatches:')
  for (const r of rows.filter(x => x.status === 'mismatch')) {
    console.log(`  ${r.date}  bank ${money(r.amount)}  benevity ${money(r.benNet)}  Δ ${money(r.diff)}  [${r.disbursementId}]`)
  }
}
if (byStatus.missing_benevity) {
  console.log('\nBank rows missing Benevity CSV (first 10):')
  for (const r of rows.filter(x => x.status === 'missing_benevity').slice(0, 10)) {
    console.log(`  ${r.date}  ${money(r.amount)}  ${r.disbursementId ?? '(no id extracted)'}  | ${(r.details || '').slice(0, 50)}`)
  }
}

// ---------------------------------------------------------------------------
// 4. STRIPE — via bank transfer rows (no live Stripe API call; auth-gated)
// ---------------------------------------------------------------------------
console.log(section('4. STRIPE — bank STRIPE TRANSFER rows'))
const stripeRows = bank.filter(r => /STRIPE\s+TRANSFER/i.test(r.details || ''))
const stripeTotal = stripeRows.reduce((s, r) => s + r.amount, 0)
const stripeByMonth = new Map()
for (const r of stripeRows) {
  const m = ym(r.date)
  const b = stripeByMonth.get(m) ?? { count: 0, total: 0 }
  b.count++; b.total += r.amount
  stripeByMonth.set(m, b)
}
console.log(`Stripe transfers in bank:  ${stripeRows.length} rows, ${money(stripeTotal)}`)
console.log(`Stripe transfer months:    ${stripeByMonth.size}   (${[...stripeByMonth.keys()].sort()[0]} → ${[...stripeByMonth.keys()].sort().at(-1)})`)
console.log(`Note: live Stripe API (/api/stripe/overview) is auth-gated — skipped.`)
console.log(`      Cross-check against Stripe dashboard manually if needed.`)

// Monthly distribution (last 6 months)
const recentMonths = [...stripeByMonth.entries()].sort(([a],[b]) => b.localeCompare(a)).slice(0, 6)
console.log('\nRecent monthly Stripe transfer totals:')
for (const [m, b] of recentMonths) {
  console.log(`  ${m}  ${padL(b.count,3)} transfers  ${padL(money(b.total),16)}`)
}

// ---------------------------------------------------------------------------
// 5. FINAL SUMMARY
// ---------------------------------------------------------------------------
console.log(section('5. SUMMARY'))
const checks = [
  ['Bank balance matches WF online',               Math.abs(gap) < 0.01],
  ['All 4 backfill spot-checks present',           spotChecks.every(sc => bank.some(r => iso(r.date) === sc.date && Math.abs(r.amount - sc.amount) < 0.01))],
  ['No internal DB duplicates',                    dupes.length === 0],
  ['All bank amounts valid',                       badAmounts.length === 0],
  ['Per-disbursement math consistent',             mathBad.length === 0],
  ['No Benevity amount mismatches',                !byStatus.mismatch],
  ['No Benevity orphans (missing_bank)',           !byStatus.missing_bank],
  ['No bank platform rows missing Benevity CSV',   !byStatus.missing_benevity],
  ['Stripe transfers present in bank',             stripeRows.length > 0],
]
for (const [label, ok] of checks) console.log(`  ${ok ? '✓' : '✗'} ${label}`)
const failed = checks.filter(([,ok]) => !ok).length
console.log(failed === 0 ? '\n✓ All cross-source checks pass.' : `\n⚠ ${failed} check${failed === 1 ? '' : 's'} failed — see sections above.`)

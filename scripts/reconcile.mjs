#!/usr/bin/env node
// Reconciles WF bank current balance against DB snapshot + PDF backfill.
// Usage: node scripts/reconcile.mjs

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_CSV = path.join(__dirname, 'db-snapshot-20260413.csv')
const BACKFILL_CSV = path.join(__dirname, 'wf-backfill-032024-102024.csv')

const BANK_CURRENT = 256898.70  // from WF online screenshot 04/15/26

// Expected per-month totals per the Wells Fargo PDF statements
// (statement period activity summary). Used to sanity-check extracted data.
const PDF_MONTHLY = [
  { month: '2024-03', credits: 2000.00, debits: 0.00, endBalance: 2000.00 },
  { month: '2024-04', credits: 0.00,    debits: 0.00, endBalance: 2000.00 },
  { month: '2024-05', credits: 0.00,    debits: 0.00, endBalance: 2000.00 },
  { month: '2024-06', credits: 0.00,    debits: 0.00, endBalance: 2000.00 },
  { month: '2024-07', credits: 0.00,    debits: 0.00, endBalance: 2000.00 },
  { month: '2024-08', credits: 12286.40, debits: 4631.24, endBalance: 9655.16 },
  { month: '2024-09', credits: 11400.00, debits: 3740.17, endBalance: 17314.99 },
  { month: '2024-10', credits: 9.41,    debits: 3145.64, endBalance: 14178.76 },
]

// --- parsing ---------------------------------------------------------------
function parseCsv(text) {
  const rows = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const cols = []
    let cur = '', inQ = false
    for (let i = 0; i < t.length; i++) {
      const ch = t[i]
      if (ch === '"') inQ = !inQ
      else if (ch === ',' && !inQ) { cols.push(cur); cur = '' }
      else cur += ch
    }
    cols.push(cur)
    rows.push({
      date:    cols[0]?.trim() ?? '',
      amount:  Number((cols[1] ?? '').replace(/[\s,]/g, '')),
      flag:    cols[2]?.trim() ?? '',
      checkNo: cols[3]?.trim() ?? '',
      details: cols[4]?.trim() ?? '',
    })
  }
  return rows
}

// Mirror of backend normalizeDetails + canonicalizeDate (used for dedupe).
const normDetails = s => (s || '').trim().replace(/\s+/g, ' ').toUpperCase()
const canonDate = raw => {
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10)
}
const hash = (date, amount, details) =>
  crypto.createHash('sha256')
    .update(`${canonDate(date)}|${Number(amount).toFixed(2)}|${normDetails(details)}`)
    .digest('hex').slice(0, 16)

// --- helpers ---------------------------------------------------------------
const fmt = n => (n < 0 ? '-' : ' ') + '$' + Math.abs(n).toFixed(2).padStart(12, ' ')
const money = n => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const section = t => `\n${'═'.repeat(72)}\n  ${t}\n${'═'.repeat(72)}`

// --- load ------------------------------------------------------------------
const db = parseCsv(fs.readFileSync(DB_CSV, 'utf8'))
const bf = parseCsv(fs.readFileSync(BACKFILL_CSV, 'utf8'))

console.log(section('INPUT SUMMARY'))
console.log(`DB snapshot:     ${db.length} rows from ${DB_CSV.split('/').pop()}`)
console.log(`PDF backfill:    ${bf.length} rows from ${BACKFILL_CSV.split('/').pop()}`)
console.log(`Bank balance:    ${money(BANK_CURRENT)} (per WF online, 04/15/26)`)

// --- 1) Sanity: no NaN amounts, no blank dates, no zero amounts -----------
console.log(section('1. ROW-LEVEL SANITY'))
const badRows = [...db, ...bf].filter(r => !r.date || Number.isNaN(r.amount) || r.amount === 0)
console.log(badRows.length === 0
  ? '✓ all rows have valid date + non-zero numeric amount'
  : `✗ ${badRows.length} bad rows: ${JSON.stringify(badRows.slice(0,3))}`)

// --- 2) Backfill totals match each PDF's reported activity summary --------
console.log(section('2. PDF MONTHLY TOTALS (backfill vs statement)'))
const byMonth = new Map()
for (const r of bf) {
  const m = canonDate(r.date).slice(0, 7)
  const b = byMonth.get(m) ?? { credits: 0, debits: 0, count: 0 }
  if (r.amount > 0) b.credits += r.amount; else b.debits += Math.abs(r.amount)
  b.count++
  byMonth.set(m, b)
}
console.log('month     extracted credits  extracted debits  pdf credits    pdf debits     ok')
console.log('-'.repeat(88))
let allOk = true
for (const exp of PDF_MONTHLY) {
  const got = byMonth.get(exp.month) ?? { credits: 0, debits: 0 }
  const okC = Math.abs(got.credits - exp.credits) < 0.005
  const okD = Math.abs(got.debits - exp.debits) < 0.005
  const mark = okC && okD ? '✓' : '✗'
  if (!(okC && okD)) allOk = false
  console.log(`${exp.month}   ${fmt(got.credits)}   ${fmt(got.debits)}   ${fmt(exp.credits)}   ${fmt(exp.debits)}   ${mark}`)
}
console.log(allOk ? '\n✓ every month matches the PDF activity summary' : '\n✗ DISCREPANCY — extraction bug')

// --- 3) Per-PDF running balance reconstruction ----------------------------
console.log(section('3. RUNNING BALANCE (backfill only, starts at $0 on 2024-03-27)'))
const bfSorted = [...bf].sort((a, b) => canonDate(a.date).localeCompare(canonDate(b.date)))
let bal = 0
const endOfMonth = {}
for (const r of bfSorted) {
  bal += r.amount
  endOfMonth[canonDate(r.date).slice(0, 7)] = bal
}
for (const exp of PDF_MONTHLY) {
  const got = endOfMonth[exp.month] ?? (exp.month > '2024-03' ? endOfMonth[Object.keys(endOfMonth).filter(k => k < exp.month).pop()] : 0)
  const ok = Math.abs(got - exp.endBalance) < 0.005 ? '✓' : '✗'
  console.log(`${exp.month} end-of-month: reconstructed ${fmt(got)}   pdf ${fmt(exp.endBalance)}   ${ok}`)
}

// --- 4) Dedupe check between backfill and DB ------------------------------
console.log(section('4. DEDUPE OVERLAP (backfill rows that match DB hash)'))
const dbHashes = new Set(db.map(r => hash(r.date, r.amount, r.details)))
const overlap = bf.filter(r => dbHashes.has(hash(r.date, r.amount, r.details)))
const newRows = bf.filter(r => !dbHashes.has(hash(r.date, r.amount, r.details)))
console.log(`Overlap (deduped):  ${overlap.length} rows  (sum ${money(overlap.reduce((s,r)=>s+r.amount,0))})`)
for (const r of overlap) console.log(`  ~ ${canonDate(r.date)}  ${fmt(r.amount)}  ${r.details.slice(0, 60)}`)
console.log(`New to DB:          ${newRows.length} rows  (sum ${money(newRows.reduce((s,r)=>s+r.amount,0))})`)

// --- 5) Intra-DB duplicates check -----------------------------------------
console.log(section('5. DB INTERNAL DUPLICATES (same date+amount+details)'))
const dbCounts = new Map()
for (const r of db) {
  const h = hash(r.date, r.amount, r.details)
  dbCounts.set(h, (dbCounts.get(h) ?? 0) + 1)
}
const dbDupes = [...dbCounts.values()].filter(c => c > 1)
console.log(dbDupes.length === 0 ? '✓ no internal duplicates in DB snapshot' : `✗ ${dbDupes.length} duplicate hash groups in DB`)

// --- 6) Reversal pair detection (mirrors donor-pivot route.ts logic) ------
console.log(section('6. REVERSAL PAIRS (same-amount credit/debit within 3 days)'))
// Using combined DB + backfill-new-rows since reversals can span months.
const combined = [...db, ...newRows].map((r, i) => ({ ...r, id: i, t: new Date(canonDate(r.date)).getTime() }))
const credits = combined.filter(r => r.amount > 0)
const debits = combined.filter(r => r.amount < 0)
const DAY = 24 * 3600 * 1000
const excluded = new Set()
const pairs = []
for (const c of credits) {
  if (excluded.has(c.id)) continue
  const m = debits.find(d =>
    !excluded.has(d.id) &&
    Math.abs(d.amount) === c.amount &&
    Math.abs(d.t - c.t) <= 3 * DAY)
  if (m) { excluded.add(c.id); excluded.add(m.id); pairs.push([c, m]) }
}
console.log(`Detected ${pairs.length} reversal pair${pairs.length === 1 ? '' : 's'}:`)
for (const [c, d] of pairs) {
  console.log(`  ${canonDate(c.date)} +${c.amount.toFixed(2)} ↔ ${canonDate(d.date)} ${d.amount.toFixed(2)}  │  ${c.details.slice(0,40)}...`)
}

// --- 7) Final reconciliation ---------------------------------------------
console.log(section('7. FINAL RECONCILIATION'))
const dbSum = db.reduce((s, r) => s + r.amount, 0)
const newSum = newRows.reduce((s, r) => s + r.amount, 0)
const projected = dbSum + newSum
const gap = BANK_CURRENT - dbSum
const residual = BANK_CURRENT - projected

console.log(`Bank current balance (WF online):         ${money(BANK_CURRENT).padStart(16)}`)
console.log(`Current DB total (sum of ${db.length} rows):        ${money(dbSum).padStart(16)}`)
console.log(`Current gap (bank - dashboard):           ${money(gap).padStart(16)}`)
console.log('')
console.log(`Backfill new rows (${newRows.length} after dedupe):       ${money(newSum).padStart(16)}`)
console.log(`Projected DB total after upload:          ${money(projected).padStart(16)}`)
console.log(`Residual gap after upload:                ${money(residual).padStart(16)}`)
console.log('')
console.log(Math.abs(residual) < 0.01
  ? '✓ RECONCILED — uploading the backfill will bring dashboard to exact bank balance'
  : `✗ RESIDUAL OF ${money(residual)} — investigate: bank may have uncategorized tx`)

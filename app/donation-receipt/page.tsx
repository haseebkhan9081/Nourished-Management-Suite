//@ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Send,
  Loader2,
  Receipt,
  CalendarCheck,
  RefreshCw,
  ImagePlus,
  X,
  Download,
  Mail,
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
  Eye,
  Users,
  Plus,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

// ─── Image compression (unchanged from previous version) ──────────────────────
const MAX_DIM = 1600;
const JPEG_QUALITY = 0.75;
const MAX_UPLOAD_BYTES = 500 * 1024;

async function compressImage(file: File): Promise<{ dataUrl: string; sizeBytes: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not decode image"));
      i.src = objectUrl;
    });
    const longest = Math.max(img.width, img.height);
    const scale = longest > MAX_DIM ? MAX_DIM / longest : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas encode failed"))),
        "image/jpeg",
        JPEG_QUALITY,
      ),
    );
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("Failed to read compressed blob"));
      r.readAsDataURL(blob);
    });
    return { dataUrl, sizeBytes: blob.size };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

// All donation dates are formatted in UTC so the date shown here matches what
// Stripe shows in its dashboard (Stripe stamps charges with a UTC `created`
// timestamp). Rendering in local time was causing "off by one day" confusion
// for admins in Pacific / Eastern zones.
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Backend sometimes returns a "YYYY-MM-DD" gift date (already a calendar
  // date, no time component). Parsing that as ISO would imply UTC midnight
  // and drift a day in local display — so handle it as a literal calendar.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso ?? "—";
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso ?? "—";
  }
}

// Source badge tone — groups similar sources visually without relying on colour alone.
const SOURCE_TONES: Record<string, string> = {
  Stripe: "bg-violet-50 text-violet-700 border-violet-200",
  Website: "bg-blue-50 text-blue-700 border-blue-200",
  Cash: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cheque: "bg-amber-50 text-amber-700 border-amber-200",
  "Bank Transfer": "bg-sky-50 text-sky-700 border-sky-200",
  Wire: "bg-sky-50 text-sky-700 border-sky-200",
  Manual: "bg-gray-100 text-gray-700 border-gray-200",
  Combined: "bg-pink-50 text-pink-700 border-pink-200",
};

function sourceTone(source: string): string {
  return SOURCE_TONES[source] ?? "bg-gray-100 text-gray-600 border-gray-200";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Donation {
  donationId: number;
  amount: number;
  giftDate: string | null;
  paymentIntentId: string | null;
  source: string;
  // null = not applicable (Stripe — processor-verified).
  // true = matched a bank transaction with same amount within ±3 days.
  // false = no matching bank deposit found (likely manual/test entry).
  bankVerified: boolean | null;
  bankTransactionId: number | null;
  bankMatchDate: string | null;
}

interface ReceiptLog {
  id: number;
  donationId: number | null;
  type: "single" | "year-end" | "combined";
  year: number | null;
  amount: number | null;
  sentAt: string;
}

interface Donor {
  // Composite `email|name_key` — stable identity for donors that share a
  // placeholder email (e.g. DAFgiving360 + Fidelity Charitable both using
  // info@nourishedusa.org). Prefer this over `email` for keys/selection.
  donorKey: string;
  email: string;
  name: string;
  phone: string;
  city: string;
  country: string;
  postalCode: string;
  totalAmount: number;
  donationCount: number;
  donations: Donation[];
  receiptsSent: ReceiptLog[];
}

interface SingleFormData {
  donorName: string;
  email: string;
  phone: string;
  city: string;
  postalCode: string;
  country: string;
  amount: string;
  giftDate: string;
  donationId: string;
  donationSource: string;
}

const emptyForm: SingleFormData = {
  donorName: "",
  email: "",
  phone: "",
  city: "",
  postalCode: "",
  country: "",
  amount: "",
  giftDate: "",
  donationId: "",
  donationSource: "",
};

// ─── API calls ────────────────────────────────────────────────────────────────

async function searchDonors(q: string, signal?: AbortSignal): Promise<Donor[]> {
  const res = await fetch(
    `${API_BASE}/receipt/donors/search?q=${encodeURIComponent(q)}`,
    { signal },
  );
  if (!res.ok) throw new Error("Search failed");
  const data = await res.json();
  return data.donors ?? [];
}

async function fetchPreview(payload: {
  donorName: string;
  amount: string | number;
  giftDate: string;
  donationId?: string | number;
  metadata: Record<string, any>;
}): Promise<{ html: string; subject: string }> {
  const res = await fetch(`${API_BASE}/receipt/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Preview failed");
  return res.json();
}

async function sendSingleReceipt(payload: any): Promise<any> {
  const res = await fetch(`${API_BASE}/receipt/single`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Send failed");
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function sendCombinedReceipt(donationIds: number[]): Promise<any> {
  const res = await fetch(`${API_BASE}/receipt/combined`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ donationIds }),
  });
  if (!res.ok) throw new Error("Send failed");
  return res.json();
}

async function sendYearEndReceipt(email: string, year: string): Promise<any> {
  const res = await fetch(`${API_BASE}/receipt/year-end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, year }),
  });
  if (!res.ok) throw new Error("Send failed");
  return res.json();
}

async function fetchDonationByTransactionId(txId: string): Promise<Partial<SingleFormData>> {
  const res = await fetch(
    `${API_BASE}/receipt/transaction/${encodeURIComponent(txId)}`,
  );
  if (!res.ok) throw new Error("Not found");
  return res.json();
}

// Bank donor search — returns Wells Fargo transactions grouped by extracted name.
interface BankTxn {
  transactionId: number;
  amount: number;
  date: string | null;
  details: string;
  matched: boolean;
  matchedDonationId: number | null;
  matchedPaymentId: number | null;
  matchedEmail: string | null;
}
interface BankDonor {
  normalizedName: string;
  donorName: string;
  section: string;
  kind: string;
  savedEmail: string | null;
  totalAmount: number;
  transactionCount: number;
  unmatchedCount: number;
  transactions: BankTxn[];
  receiptsSent: ReceiptLog[];
}

async function searchBankDonors(q: string, signal?: AbortSignal): Promise<BankDonor[]> {
  const res = await fetch(
    `${API_BASE}/receipt/bank-donors/search?q=${encodeURIComponent(q)}`,
    { signal },
  );
  if (!res.ok) throw new Error("Bank search failed");
  const data = await res.json();
  return data.donors ?? [];
}

// Benevity / corporate-match donors. The foundation issues the tax receipt
// directly, so this tab is informational only — no send action.
interface BenevityDonor {
  email: string | null;
  name: string;
  city: string;
  state: string;
  postalCode: string;
  company: string;
  totalDonation: number;
  totalMatch: number;
  donationCount: number;
}

async function searchBenevityDonors(
  q: string,
  signal?: AbortSignal,
): Promise<BenevityDonor[]> {
  const res = await fetch(
    `${API_BASE}/receipt/benevity-donors/search?q=${encodeURIComponent(q)}`,
    { signal },
  );
  if (!res.ok) throw new Error("Benevity search failed");
  const data = await res.json();
  return data.donors ?? [];
}

interface IncompletePayment {
  paymentId: number;
  donationId: number | null;
  amount: number;
  date: string | null;
  paymentIntentId: string | null;
  subscriptionId: string | null;
  source: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  postalCode: string;
}

async function fetchIncompletePayments(): Promise<IncompletePayment[]> {
  const res = await fetch(`${API_BASE}/receipt/incomplete-payments`);
  if (!res.ok) throw new Error("Failed to load incomplete payments");
  const data = await res.json();
  return data.payments ?? [];
}

async function fillPaymentDonorInfo(
  paymentId: number,
  payload: {
    name: string;
    email: string;
    phone?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  },
): Promise<any> {
  const res = await fetch(`${API_BASE}/receipt/payment/${paymentId}/fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Save failed");
  }
  return res.json();
}

async function attachBankTransactions(payload: {
  transactionIds: number[];
  donorName: string;
  email: string;
  phone?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  saveEmailForFuture: boolean;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/receipt/bank-transaction/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Save failed");
  }
  return res.json();
}

// ─── Small shared UI bits ────────────────────────────────────────────────────

function StatusBadge({
  message,
  type,
}: {
  message: string;
  type: "success" | "error";
}) {
  return (
    <div
      className={`rounded-md px-4 py-3 text-sm font-medium border ${
        type === "success"
          ? "bg-[#f0f6ef] text-[#3d6b38] border-[#A2BD9D]"
          : "bg-red-50 text-red-700 border-red-200"
      }`}
    >
      {message}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  value,
  muted,
}: {
  icon: any;
  value: string;
  muted?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={`flex items-center gap-2 text-sm ${muted ? "text-gray-500" : "text-gray-700"}`}>
      <Icon size={14} className="text-gray-400 shrink-0" />
      <span className="truncate">{value}</span>
    </div>
  );
}

// ─── Search-driven flow ──────────────────────────────────────────────────────

function DonorSearchFlow() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Donor[]>([]);
  const [benevityResults, setBenevityResults] = useState<BenevityDonor[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedDonorKey, setSelectedDonorKey] = useState<string | null>(null);
  const [globalStatus, setGlobalStatus] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  // Debounced search — Stripe + Benevity in parallel so foundation-issued
  // donors show up alongside sendable ones in the same list.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setBenevityResults([]);
      setSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      try {
        const [donors, benevity] = await Promise.all([
          searchDonors(q, ctrl.signal).catch(() => []),
          searchBenevityDonors(q, ctrl.signal).catch(() => []),
        ]);
        setResults(donors);
        setBenevityResults(benevity);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setResults([]);
          setBenevityResults([]);
        }
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const selectedDonor = useMemo(
    () => results.find((d) => d.donorKey === selectedDonorKey) ?? null,
    [results, selectedDonorKey],
  );

  // Called after a successful send so the donor's receipt history refreshes.
  const refreshDonor = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    try {
      const [donors, benevity] = await Promise.all([
        searchDonors(q).catch(() => []),
        searchBenevityDonors(q).catch(() => []),
      ]);
      setResults(donors);
      setBenevityResults(benevity);
    } catch {
      /* keep stale results; user can retry */
    }
  }, [query]);

  return (
    <div className="space-y-5">
      {/* Search bar */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          size={16}
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search donors by name, email, or phone…"
          className="pl-9 h-10 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
        />
        {searching && (
          <Loader2
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin"
            size={16}
          />
        )}
      </div>

      {/* Results list */}
      {query.trim().length >= 2 && (
        <DonorResultsList
          results={results}
          benevityResults={benevityResults}
          searching={searching}
          selectedDonorKey={selectedDonorKey}
          onSelect={(key) => {
            setSelectedDonorKey(key);
            setGlobalStatus(null);
          }}
        />
      )}

      {globalStatus && <StatusBadge message={globalStatus.msg} type={globalStatus.type} />}

      {/* Selected donor detail */}
      {selectedDonor && (
        <DonorDetailPanel
          donor={selectedDonor}
          onSent={(msg) => {
            setGlobalStatus({ msg, type: "success" });
            refreshDonor();
          }}
          onError={(msg) => setGlobalStatus({ msg, type: "error" })}
          onRefresh={refreshDonor}
        />
      )}

      {/* Empty states */}
      {query.trim().length < 2 && (
        <div className="text-center py-10 text-sm text-gray-400">
          <Users size={28} className="mx-auto mb-2 opacity-40" />
          Type at least 2 characters to search donors.
        </div>
      )}
    </div>
  );
}

function DonorResultsList({
  results,
  benevityResults,
  searching,
  selectedDonorKey,
  onSelect,
}: {
  results: Donor[];
  benevityResults: BenevityDonor[];
  searching: boolean;
  selectedDonorKey: string | null;
  onSelect: (donorKey: string) => void;
}) {
  // Filter out Benevity duplicates that share an email with a Stripe donor —
  // the Stripe row already handles them (and is sendable).
  const stripeEmails = new Set(
    results.map((d) => (d.email ?? "").toLowerCase()).filter(Boolean),
  );
  const benevityOnly = benevityResults.filter((b) => {
    const em = (b.email ?? "").toLowerCase();
    return !em || !stripeEmails.has(em);
  });

  const hasAnyResults = results.length > 0 || benevityOnly.length > 0;

  if (searching && !hasAnyResults) {
    return (
      <div className="border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-400 bg-white">
        <Loader2 className="animate-spin mx-auto mb-2" size={18} />
        Searching…
      </div>
    );
  }

  if (!searching && !hasAnyResults) {
    return (
      <div className="border border-dashed border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500 bg-gray-50">
        No donors matched your search.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {results.length > 0 && (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white divide-y divide-gray-100">
      {results.map((d) => {
        const isActive = d.donorKey === selectedDonorKey;
        return (
          <button
            key={d.donorKey}
            onClick={() => onSelect(d.donorKey)}
            className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
              isActive ? "bg-[#f0f6ef]" : "hover:bg-gray-50"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {d.name || "(Unnamed)"}
                </p>
                {d.receiptsSent.length > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-normal bg-[#f0f6ef] text-[#3d6b38] border-[#A2BD9D]"
                  >
                    {d.receiptsSent.length} sent
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {(d.email ?? "").trim().toLowerCase() === "na" || !d.email
                  ? "NA — no email"
                  : d.email}
                {d.phone ? ` · ${d.phone}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-gray-800">
                {formatCurrency(d.totalAmount)}
              </p>
              <p className="text-[11px] text-gray-400">
                {d.donationCount} donation{d.donationCount === 1 ? "" : "s"}
              </p>
            </div>
          </button>
        );
      })}
    </div>
      )}

      {benevityOnly.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Benevity / CyberGrants
            </p>
            <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-medium">
              Receipt already issued by Benevity — no action needed
            </Badge>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white divide-y divide-gray-100">
            {benevityOnly.map((d, i) => (
              <BenevityDonorRow key={`${d.email ?? d.name}-${i}`} donor={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Donor Detail Panel ──────────────────────────────────────────────────────

type PendingSend =
  | {
      mode: "single";
      donation: Donation;
      donor: Donor;
    }
  | {
      mode: "combined";
      donations: Donation[];
      donor: Donor;
      totalAmount: number;
    }
  | {
      mode: "year-end";
      year: string;
      donor: Donor;
      yearTotal: number;
      yearCount: number;
    };

function DonorDetailPanel({
  donor,
  onSent,
  onError,
  onRefresh,
}: {
  donor: Donor;
  onSent: (msg: string) => void;
  onError: (msg: string) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [yearPick, setYearPick] = useState<string>(
    String(new Date().getFullYear() - 1),
  );
  const [pending, setPending] = useState<PendingSend | null>(null);

  // Email-less donors (e.g. migrated DAF / foundation rows) store "NA" in the
  // email column. Admins need to add a real address before a receipt can go
  // out. Treat any of the known placeholders the same way.
  const hasValidEmail = useMemo(() => {
    const e = (donor.email ?? "").trim().toLowerCase();
    return e.length > 0 && e !== "na" && e.includes("@");
  }, [donor.email]);

  const [emailEditOpen, setEmailEditOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  async function saveDonorEmail() {
    const trimmed = emailDraft.trim();
    if (!trimmed || !trimmed.includes("@")) {
      onError("Enter a valid email address.");
      return;
    }
    setEmailSaving(true);
    try {
      const res = await fetch(`${API_BASE}/receipt/donor/update-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentEmail: donor.email,
          name: donor.name,
          newEmail: trimmed,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update email");
      }
      setEmailEditOpen(false);
      setEmailDraft("");
      await onRefresh();
      onSent(`Email set to ${trimmed} for ${donor.name}.`);
    } catch (err: any) {
      onError(err?.message ?? "Failed to update email");
    } finally {
      setEmailSaving(false);
    }
  }

  // Reset selections when switching donor.
  useEffect(() => {
    setSelectedIds(new Set());
    setEmailEditOpen(false);
    setEmailDraft("");
  }, [donor.donorKey]);

  function toggleDonation(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedDonations = useMemo(
    () => donor.donations.filter((d) => selectedIds.has(d.donationId)),
    [donor.donations, selectedIds],
  );

  const selectedTotal = selectedDonations.reduce((sum, d) => sum + d.amount, 0);

  // Map of donationId → most recent receipt log for that donation.
  const sentByDonation = useMemo(() => {
    const m = new Map<number, ReceiptLog>();
    for (const r of donor.receiptsSent) {
      if (r.donationId != null && !m.has(r.donationId)) m.set(r.donationId, r);
    }
    return m;
  }, [donor.receiptsSent]);

  // Year-end history lookup.
  const yearEndByYear = useMemo(() => {
    const m = new Map<number, ReceiptLog>();
    for (const r of donor.receiptsSent) {
      if (r.type === "year-end" && r.year != null && !m.has(r.year)) m.set(r.year, r);
    }
    return m;
  }, [donor.receiptsSent]);

  // Years present in donation history.
  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const d of donor.donations) {
      if (d.giftDate) ys.add(new Date(d.giftDate).getFullYear());
    }
    return [...ys].sort((a, b) => b - a);
  }, [donor.donations]);

  // Aggregate donations by year for year-end preview.
  const yearTotals = useMemo(() => {
    const m = new Map<number, { total: number; count: number }>();
    for (const d of donor.donations) {
      if (!d.giftDate) continue;
      const y = new Date(d.giftDate).getFullYear();
      const cur = m.get(y) ?? { total: 0, count: 0 };
      cur.total += d.amount;
      cur.count += 1;
      m.set(y, cur);
    }
    return m;
  }, [donor.donations]);

  function startSingle(d: Donation) {
    setPending({ mode: "single", donation: d, donor });
  }

  function startCombined() {
    if (selectedDonations.length < 2) return;
    setPending({
      mode: "combined",
      donations: selectedDonations,
      donor,
      totalAmount: selectedTotal,
    });
  }

  function startYearEnd() {
    const y = parseInt(yearPick, 10);
    const t = yearTotals.get(y);
    setPending({
      mode: "year-end",
      year: yearPick,
      donor,
      yearTotal: t?.total ?? 0,
      yearCount: t?.count ?? 0,
    });
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Donor header */}
      <div className="p-5 border-b border-gray-100 bg-gradient-to-b from-[#f8faf8] to-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <User size={16} className="text-[#A2BD9D]" />
              <h2 className="text-base font-semibold text-gray-800 truncate">
                {donor.name || "(Unnamed donor)"}
              </h2>
            </div>
            <div className="space-y-1">
              {hasValidEmail ? (
                <InfoRow icon={Mail} value={donor.email} />
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Mail size={14} className="text-gray-400 shrink-0" />
                  <span className="font-medium text-gray-600">NA</span>
                  {!emailEditOpen && (
                    <button
                      onClick={() => {
                        setEmailEditOpen(true);
                        setEmailDraft("");
                      }}
                      className="text-xs text-[#3d6b38] hover:underline"
                    >
                      + Add email
                    </button>
                  )}
                </div>
              )}
              {emailEditOpen && (
                <div className="flex items-center gap-2 pl-5">
                  <Input
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    placeholder="donor@example.com"
                    className="h-8 text-xs flex-1 max-w-xs focus-visible:ring-[#A2BD9D]"
                    disabled={emailSaving}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveDonorEmail();
                      if (e.key === "Escape") {
                        setEmailEditOpen(false);
                        setEmailDraft("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={saveDonorEmail}
                    disabled={emailSaving}
                    className="h-8 px-3 bg-[#A2BD9D] hover:bg-[#8fad8a] text-white text-xs"
                  >
                    {emailSaving ? "Saving…" : "Save"}
                  </Button>
                  <button
                    onClick={() => {
                      setEmailEditOpen(false);
                      setEmailDraft("");
                    }}
                    disabled={emailSaving}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <InfoRow icon={Phone} value={donor.phone} />
              <InfoRow
                icon={MapPin}
                value={[donor.city, donor.country].filter(Boolean).join(", ")}
              />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
              Lifetime
            </p>
            <p className="text-xl font-semibold text-gray-800 mt-0.5">
              {formatCurrency(donor.totalAmount)}
            </p>
            <p className="text-xs text-gray-500">
              {donor.donationCount} donation{donor.donationCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      {/* Receipts sent history */}
      {donor.receiptsSent.length > 0 && (
        <div className="p-5 border-b border-gray-100">
          <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2 flex items-center gap-1.5">
            <Clock size={12} /> Receipts Sent
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {donor.receiptsSent.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded px-3 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 size={12} className="text-[#3d6b38] shrink-0" />
                  <span className="font-medium capitalize">{r.type}</span>
                  {r.year && <span className="text-gray-400">· {r.year}</span>}
                  {r.donationId && (
                    <span className="text-gray-400">· #{r.donationId}</span>
                  )}
                  {r.amount != null && (
                    <span className="text-gray-500">
                      · {formatCurrency(r.amount)}
                    </span>
                  )}
                </div>
                <span className="text-gray-400 shrink-0 ml-2">
                  {formatDateTime(r.sentAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Donations list */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
            Donations
          </p>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear selection
            </button>
          )}
        </div>

        {donor.donations.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No donation records.</p>
        ) : (
          <div className="border border-gray-100 rounded-md divide-y divide-gray-100 overflow-hidden">
            {donor.donations.map((d) => {
              const sentLog = sentByDonation.get(d.donationId);
              const isSelected = selectedIds.has(d.donationId);
              return (
                <div
                  key={d.donationId}
                  className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                    isSelected ? "bg-[#f0f6ef]" : "hover:bg-gray-50"
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleDonation(d.donationId)}
                    className="border-[#A2BD9D] data-[state=checked]:bg-[#A2BD9D] data-[state=checked]:border-[#A2BD9D]"
                  />
                  <div className="w-24 text-gray-600 text-xs">
                    {formatDate(d.giftDate)}
                  </div>
                  <div className="w-24 font-medium text-gray-800">
                    {formatCurrency(d.amount)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-normal ${sourceTone(d.source)}`}
                    >
                      {d.source}
                    </Badge>
                    {d.bankVerified === true && (
                      <span
                        className="ml-2 text-[10px] text-[#3d6b38] inline-flex items-center gap-1"
                        title={
                          d.bankMatchDate
                            ? `Matched bank deposit on ${formatDate(d.bankMatchDate)} (txn #${d.bankTransactionId})`
                            : "Matched a bank deposit"
                        }
                      >
                        <CheckCircle2 size={10} />
                        Bank verified
                      </span>
                    )}
                    {d.bankVerified === false && (
                      <span
                        className="ml-2 text-[10px] text-amber-700 inline-flex items-center gap-1"
                        title="No Wells Fargo deposit with the same amount was found within ±3 days of the gift date. Could be a test entry, a bank import gap, or a pending settlement."
                      >
                        <AlertTriangle size={10} />
                        Unverified
                      </span>
                    )}
                    {sentLog && (
                      <span className="ml-2 text-[11px] text-[#3d6b38] inline-flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        Sent {formatDate(sentLog.sentAt)}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 shrink-0">
                    #{d.donationId}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startSingle(d)}
                    disabled={!hasValidEmail}
                    title={!hasValidEmail ? "Add an email to this donor first" : undefined}
                    className="h-7 text-xs text-[#3d6b38] hover:bg-[#f0f6ef] disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    <Send size={12} className="mr-1" />
                    Send
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Combined send bar */}
        {selectedIds.size >= 2 && (
          <div className="mt-3 flex items-center justify-between gap-3 p-3 bg-[#f0f6ef] border border-[#A2BD9D] rounded-md">
            <div className="text-sm text-[#3d6b38]">
              <span className="font-semibold">{selectedIds.size} selected</span>
              <span className="text-gray-500">
                {" "}
                · Total {formatCurrency(selectedTotal)}
              </span>
            </div>
            <Button
              onClick={startCombined}
              disabled={!hasValidEmail}
              title={!hasValidEmail ? "Add an email to this donor first" : undefined}
              className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-8 px-4 text-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <Send size={13} className="mr-1.5" />
              Send combined receipt
            </Button>
          </div>
        )}
      </div>

      {/* Year-end section */}
      <div className="p-5 bg-gray-50">
        <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3 flex items-center gap-1.5">
          <CalendarCheck size={12} /> Year-End Receipt
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[140px]">
            <Label htmlFor="yePick" className="text-xs text-gray-600 mb-1 block">
              Tax year
            </Label>
            {availableYears.length > 0 ? (
              <select
                id="yePick"
                value={yearPick}
                onChange={(e) => setYearPick(e.target.value)}
                className="w-full h-9 text-sm rounded-md border border-gray-200 bg-white px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A2BD9D]"
              >
                {availableYears.map((y) => {
                  const alreadySent = yearEndByYear.has(y);
                  const t = yearTotals.get(y);
                  return (
                    <option key={y} value={String(y)}>
                      {y} — {formatCurrency(t?.total ?? 0)} ({t?.count ?? 0})
                      {alreadySent ? "  ✓ sent" : ""}
                    </option>
                  );
                })}
              </select>
            ) : (
              <Input
                id="yePick"
                type="number"
                value={yearPick}
                onChange={(e) => setYearPick(e.target.value)}
                className="h-9 text-sm"
              />
            )}
          </div>
          <Button
            onClick={startYearEnd}
            disabled={!hasValidEmail}
            title={!hasValidEmail ? "Add an email to this donor first" : undefined}
            className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-9 px-4 text-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <CalendarCheck size={14} className="mr-1.5" />
            Send year-end receipt
          </Button>
        </div>
      </div>

      {/* Confirmation / preview dialog */}
      {pending && (
        <PreviewDialog
          pending={pending}
          onClose={() => setPending(null)}
          onSuccess={(msg) => {
            onSent(msg);
            setPending(null);
            setSelectedIds(new Set());
          }}
          onFailure={(msg) => {
            onError(msg);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Preview + Confirm Dialog ────────────────────────────────────────────────

function PreviewDialog({
  pending,
  onClose,
  onSuccess,
  onFailure,
}: {
  pending: PendingSend;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onFailure: (msg: string) => void;
}) {
  const [preview, setPreview] = useState<{ html: string; subject: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Build the preview payload and resend-warning text for the current mode.
  const { previewPayload, summary, warning } = useMemo(() => {
    if (pending.mode === "single") {
      const { donation, donor } = pending;
      const alreadySent = donor.receiptsSent.find(
        (r) => r.donationId === donation.donationId,
      );
      return {
        previewPayload: {
          donorName: donor.name,
          amount: donation.amount.toFixed(2),
          giftDate: donation.giftDate ?? "",
          donationId: donation.donationId,
          metadata: {
            email: donor.email,
            phone: donor.phone,
            city: donor.city,
            postalCode: donor.postalCode,
            country: donor.country,
            productName: "Nourished Education Contribution",
          },
        },
        summary: `Single receipt · ${formatCurrency(donation.amount)} · donation #${donation.donationId} · ${donor.email}`,
        warning: alreadySent
          ? `Heads up: a receipt for this donation was already sent on ${formatDateTime(alreadySent.sentAt)}.`
          : null,
      };
    }

    if (pending.mode === "combined") {
      const { donations, donor, totalAmount } = pending;
      const firstDate = donations[0]?.giftDate ?? "";
      const lastDate = donations[donations.length - 1]?.giftDate ?? "";
      const giftDate =
        firstDate === lastDate ? firstDate : `${firstDate} to ${lastDate}`;
      const alreadySentIds = donations.filter((d) =>
        donor.receiptsSent.some((r) => r.donationId === d.donationId),
      );
      return {
        previewPayload: {
          donorName: donor.name,
          amount: totalAmount.toFixed(2),
          giftDate,
          donationId: donations.map((d) => d.donationId).join(","),
          metadata: {
            email: donor.email,
            phone: donor.phone,
            city: donor.city,
            postalCode: donor.postalCode,
            country: donor.country,
            productName: "Nourished Education Contribution",
          },
        },
        summary: `Combined receipt · ${formatCurrency(totalAmount)} across ${donations.length} donations · ${donor.email}`,
        warning:
          alreadySentIds.length > 0
            ? `Heads up: ${alreadySentIds.length} of the selected donations already had a receipt sent.`
            : null,
      };
    }

    // year-end
    const { year, donor, yearTotal, yearCount } = pending;
    const alreadySent = donor.receiptsSent.find(
      (r) => r.type === "year-end" && r.year === parseInt(year, 10),
    );
    return {
      previewPayload: {
        donorName: donor.name,
        amount: yearTotal.toFixed(2),
        giftDate: `Year ${year}`,
        metadata: {
          email: donor.email,
          phone: donor.phone,
          city: donor.city,
          postalCode: donor.postalCode,
          country: donor.country,
          productName: "Nourished Education Contribution",
        },
      },
      summary: `Year-end receipt · ${year} · ${formatCurrency(yearTotal)} across ${yearCount} donations · ${donor.email}`,
      warning: alreadySent
        ? `Heads up: a year-end receipt for ${year} was already sent on ${formatDateTime(alreadySent.sentAt)}.`
        : yearCount === 0
        ? `No donations found for ${year}. The backend will reject this send.`
        : null,
    };
  }, [pending]);

  // Load preview HTML from the backend on open.
  useEffect(() => {
    let cancelled = false;
    setLoadingPreview(true);
    setPreviewError(null);
    (async () => {
      try {
        const res = await fetchPreview(previewPayload);
        if (!cancelled) setPreview(res);
      } catch (err: any) {
        if (!cancelled) setPreviewError(err?.message ?? "Failed to render preview");
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewPayload]);

  async function handleSend() {
    setSending(true);
    try {
      if (pending.mode === "single") {
        const { donation, donor } = pending;
        await sendSingleReceipt({
          donorName: donor.name,
          amount: String(donation.amount),
          giftDate: donation.giftDate ?? "",
          donationId: String(donation.donationId),
          donationSource: donation.source,
          insertIntoDB: false,
          metadata: {
            email: donor.email,
            phone: donor.phone,
            city: donor.city,
            postalCode: donor.postalCode,
            country: donor.country,
            productName: "Nourished Education Contribution",
          },
        });
        onSuccess(`Receipt sent to ${donor.email}.`);
      } else if (pending.mode === "combined") {
        await sendCombinedReceipt(pending.donations.map((d) => d.donationId));
        onSuccess(
          `Combined receipt (${pending.donations.length} donations) sent to ${pending.donor.email}.`,
        );
      } else {
        await sendYearEndReceipt(pending.donor.email, pending.year);
        onSuccess(
          `Year-end receipt for ${pending.year} sent to ${pending.donor.email}.`,
        );
      }
    } catch (err: any) {
      onFailure(err?.message ?? "Failed to send receipt.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye size={16} className="text-[#A2BD9D]" />
            Preview & send receipt
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-hidden flex-1 flex flex-col">
          <p className="text-xs text-gray-500">{summary}</p>

          {warning && (
            <div className="flex items-start gap-2 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-md px-3 py-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{warning}</span>
            </div>
          )}

          <div className="border border-gray-200 rounded-md bg-white overflow-hidden flex-1 min-h-[300px]">
            {loadingPreview ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                <Loader2 className="animate-spin mr-2" size={16} />
                Rendering preview…
              </div>
            ) : previewError ? (
              <div className="p-4 text-sm text-red-600">{previewError}</div>
            ) : (
              <iframe
                srcDoc={preview?.html ?? ""}
                className="w-full h-full min-h-[400px] border-0 bg-white"
                title="Receipt preview"
                sandbox=""
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={sending}
            className="h-9 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || loadingPreview}
            className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-9 px-5 text-sm"
          >
            {sending ? (
              <Loader2 className="animate-spin mr-2" size={14} />
            ) : (
              <Send size={14} className="mr-2" />
            )}
            Confirm & send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bank Transactions tab ───────────────────────────────────────────────────
// Surfaces Wells Fargo bank rows that look like donor deposits. Each group
// shows the donor name the classifier extracted, every matching transaction,
// and whether each transaction is already in the `payment` table. Unmatched
// rows can be sent a receipt after the admin supplies name + email — which is
// persisted to donor_email_map for reuse.

function BankTransactionsTab() {
  const [query, setQuery] = useState("");
  const [showMatched, setShowMatched] = useState(false);
  const [results, setResults] = useState<BankDonor[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [globalStatus, setGlobalStatus] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Fetch on mount (empty query) and whenever the query changes. Debounced
  // only when the user is actively typing.
  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const donors = await searchBankDonors(q, ctrl.signal);
        setResults(donors);
      } catch (err: any) {
        if (err?.name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
        setInitialLoaded(true);
      }
    }, q.length === 0 ? 0 : 250);
    return () => clearTimeout(timer);
  }, [query]);

  const refresh = useCallback(async () => {
    try {
      const donors = await searchBankDonors(query.trim());
      setResults(donors);
    } catch {
      /* keep stale */
    }
  }, [query]);

  // Hide fully-matched groups unless admin flips the toggle.
  const visible = useMemo(() => {
    if (showMatched) return results;
    return results.filter((d) => d.unmatchedCount > 0);
  }, [results, showMatched]);

  const totalUnmatched = useMemo(
    () => results.reduce((sum, d) => sum + d.unmatchedCount, 0),
    [results],
  );

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">
        Wells Fargo bank deposits classified as donor transfers. Rows already in
        the donations table are marked with a green badge; unmatched rows need
        you to attach an email before a receipt can be sent.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Optional: filter by donor name or memo…"
            className="pl-9 h-10 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
          />
          {loading && (
            <Loader2
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin"
              size={16}
            />
          )}
        </div>
        {initialLoaded && (
          <p className="text-xs text-gray-500 shrink-0">
            <span className="font-semibold text-amber-600">{totalUnmatched}</span> unmatched ·{" "}
            {results.length} donor group{results.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {results.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
          <Checkbox
            checked={showMatched}
            onCheckedChange={(v) => setShowMatched(!!v)}
            className="border-[#A2BD9D] data-[state=checked]:bg-[#A2BD9D] data-[state=checked]:border-[#A2BD9D]"
          />
          Show groups where every transaction is already matched
        </label>
      )}

      {globalStatus && (
        <StatusBadge message={globalStatus.msg} type={globalStatus.type} />
      )}

      {loading && !initialLoaded && (
        <div className="border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-400 bg-white">
          <Loader2 className="animate-spin mx-auto mb-2" size={18} />
          Loading bank transactions…
        </div>
      )}

      {initialLoaded && !loading && results.length === 0 && (
        <div className="border border-dashed border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500 bg-gray-50">
          No named bank transfers found.
        </div>
      )}

      {initialLoaded && !loading && results.length > 0 && visible.length === 0 && (
        <div className="border border-dashed border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500 bg-gray-50">
          All transactions are already matched to donations. Toggle above to view them anyway.
        </div>
      )}

      <div className="space-y-4">
        {visible.map((donor) => (
          <BankDonorCard
            key={donor.normalizedName}
            donor={donor}
            onSent={(msg) => {
              setGlobalStatus({ msg, type: "success" });
              refresh();
            }}
            onError={(msg) => setGlobalStatus({ msg, type: "error" })}
          />
        ))}
      </div>
    </div>
  );
}

function BankDonorCard({
  donor,
  onSent,
  onError,
}: {
  donor: BankDonor;
  onSent: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(donor.donorName);
  const [email, setEmail] = useState(donor.savedEmail ?? "");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [saveForFuture, setSaveForFuture] = useState(!donor.savedEmail);
  const [pendingTxIds, setPendingTxIds] = useState<Set<number>>(new Set());

  const unmatchedTxns = donor.transactions.filter((t) => !t.matched);

  async function saveTransactions(txns: BankTxn[]) {
    if (txns.length === 0) return;
    if (!email.trim() || !name.trim()) {
      onError("Name and email are required.");
      return;
    }
    const ids = txns.map((t) => t.transactionId);
    setPendingTxIds(new Set(ids));
    try {
      const res = await attachBankTransactions({
        transactionIds: ids,
        donorName: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        country: country.trim() || undefined,
        saveEmailForFuture: saveForFuture,
      });
      const count = res?.attached?.length ?? ids.length;
      onSent(
        `Saved ${count} transaction${count === 1 ? "" : "s"} to ${name.trim()} (${email.trim()}). Go to Donor Search to send the receipt.`,
      );
    } catch (err: any) {
      onError(err?.message ?? "Failed to save.");
    } finally {
      setPendingTxIds(new Set());
    }
  }

  const canSave = email.trim().length > 0 && name.trim().length > 0;
  const bulkBusy = pendingTxIds.size > 1;

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <User size={14} className="text-[#A2BD9D]" />
            <p className="text-sm font-semibold text-gray-800 truncate">
              {donor.donorName}
            </p>
            {donor.savedEmail && (
              <Badge
                variant="outline"
                className="text-[10px] font-normal bg-[#f0f6ef] text-[#3d6b38] border-[#A2BD9D]"
              >
                Saved email
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {donor.section} ·{" "}
            {formatCurrency(donor.totalAmount)} across {donor.transactionCount} txn
            {donor.transactionCount === 1 ? "" : "s"} ·{" "}
            <span className={donor.unmatchedCount > 0 ? "text-amber-600" : "text-[#3d6b38]"}>
              {donor.unmatchedCount} unmatched
            </span>
          </p>
        </div>
        {unmatchedTxns.length > 1 && (
          <Button
            size="sm"
            disabled={!canSave || bulkBusy}
            onClick={() => saveTransactions(unmatchedTxns)}
            className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-8 text-xs disabled:opacity-40"
            title={
              !canSave
                ? "Enter a name and email below first."
                : "Save all unmatched transactions to this donor."
            }
          >
            {bulkBusy ? (
              <Loader2 size={12} className="mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 size={12} className="mr-1.5" />
            )}
            Save all {unmatchedTxns.length} unmatched
          </Button>
        )}
      </div>

      {/* Donor-level name + email editor */}
      <div className="px-4 py-3 border-b border-gray-100 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] text-gray-500 uppercase tracking-wider">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Donor full name"
              className="h-9 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
            />
          </div>
          <div>
            <Label className="text-[11px] text-gray-500 uppercase tracking-wider">
              Email {!donor.savedEmail && <span className="text-red-400">*</span>}
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="donor@example.com"
              className="h-9 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
            />
          </div>
          <div>
            <Label className="text-[11px] text-gray-500 uppercase tracking-wider">Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-9 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[11px] text-gray-500 uppercase tracking-wider">City</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="h-9 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
              />
            </div>
            <div>
              <Label className="text-[11px] text-gray-500 uppercase tracking-wider">Postal</Label>
              <Input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className="h-9 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
              />
            </div>
            <div>
              <Label className="text-[11px] text-gray-500 uppercase tracking-wider">Country</Label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="h-9 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
              />
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 mt-3 text-xs text-gray-600 cursor-pointer select-none">
          <Checkbox
            checked={saveForFuture}
            onCheckedChange={(v) => setSaveForFuture(!!v)}
            className="border-[#A2BD9D] data-[state=checked]:bg-[#A2BD9D] data-[state=checked]:border-[#A2BD9D]"
          />
          Save this name + email for future matches of "{donor.donorName}"
        </label>
      </div>

      {/* Transaction rows */}
      <div className="divide-y divide-gray-100">
        {donor.transactions.map((tx) => {
          const busy = pendingTxIds.has(tx.transactionId);
          return (
            <div
              key={tx.transactionId}
              className="px-4 py-3 flex items-center gap-3 text-sm"
            >
              <div className="w-24 text-gray-600 text-xs">
                {formatDate(tx.date)}
              </div>
              <div className="w-24 font-medium text-gray-800">
                {formatCurrency(tx.amount)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 truncate" title={tx.details}>
                  {tx.details}
                </p>
                {tx.matched && (
                  <p className="text-[11px] text-[#3d6b38] inline-flex items-center gap-1 mt-0.5">
                    <CheckCircle2 size={11} />
                    Already in DB · donation #{tx.matchedDonationId}
                    {tx.matchedEmail ? ` · ${tx.matchedEmail}` : ""}
                  </p>
                )}
              </div>
              <div className="text-[11px] text-gray-400 shrink-0">
                txn #{tx.transactionId}
              </div>
              <Button
                size="sm"
                disabled={busy || tx.matched || !canSave}
                onClick={() => saveTransactions([tx])}
                className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-7 text-xs disabled:opacity-40"
                title={
                  tx.matched
                    ? "Already in donations — visible in Donor Search."
                    : !canSave
                    ? "Enter a name and email above first."
                    : "Save this transaction as a donation record (doesn't send email)."
                }
              >
                {busy ? (
                  <Loader2 size={12} className="mr-1 animate-spin" />
                ) : tx.matched ? (
                  <CheckCircle2 size={12} className="mr-1" />
                ) : (
                  <Plus size={12} className="mr-1" />
                )}
                {tx.matched ? "Matched" : "Save to DB"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Incomplete Payments tab ─────────────────────────────────────────────────
// Lists succeeded donation payments whose donor info (name / email) is missing
// — typically Stripe charges the sync job inserted without the customer
// object. Each row has an inline form so the admin can fill the info, which
// promotes the row into Donor Search where a receipt can then be sent.

interface Reconciliation {
  window: { start: string; end: string };
  stripe: {
    totalCharges: number;
    succeededCharges: number;
    eligibleForSync: number;
    nonUsdSkipped: number;
    noPiSkipped: number;
    totalUsd: string;
    donorPaidUsd: string;
    payoutUsd: string;
    feesUsd: string;
  };
  db: {
    stripeIntentsInRange: number;
    withDonorInfo: number;
    missingDonorInfo: number;
  };
  gap: {
    missingFromDb: number;
    extraInDb: number;
    missingSample: string[];
    extraSample: string[];
  };
}

// Read-only row for Benevity / CyberGrants donors surfaced in Donor Search.
// The partner foundation already issued the tax receipt — shown for context
// so admins don't think the donor is missing.
function BenevityDonorRow({ donor }: { donor: BenevityDonor }) {
  const net = donor.totalDonation + donor.totalMatch;
  const location = [donor.city, donor.state, donor.postalCode]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="p-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800 truncate">
            {donor.name || "Anonymous"}
          </span>
          <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-medium">
            Foundation-issued receipt
          </Badge>
        </div>
        <div className="mt-1 space-y-0.5">
          {donor.email && (
            <InfoRow icon={Mail} value={donor.email} />
          )}
          {donor.company && (
            <InfoRow icon={User} value={donor.company} />
          )}
          {location && <InfoRow icon={MapPin} value={location} muted />}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold text-gray-800">
          {formatCurrency(net)}
        </div>
        <div className="text-[11px] text-gray-500">
          {formatCurrency(donor.totalDonation)} personal ·{" "}
          {formatCurrency(donor.totalMatch)} match
        </div>
        <div className="text-[11px] text-gray-500">
          {donor.donationCount} donation{donor.donationCount === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

function IncompletePaymentsTab() {
  const [rows, setRows] = useState<IncompletePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [status, setStatus] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const data = await fetchIncompletePayments();
      setRows(data);
    } catch (err: any) {
      setStatus({ msg: err?.message ?? "Failed to load", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function runReconciliation() {
    setReconLoading(true);
    try {
      const res = await fetch("/api/stripe/reconciliation");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reconciliation failed");
      setRecon(data);
    } catch (err: any) {
      setStatus({ msg: err?.message ?? "Reconciliation failed", type: "error" });
    } finally {
      setReconLoading(false);
    }
  }

  async function runStripeSync() {
    setSyncing(true);
    setStatus(null);
    try {
      const res = await fetch("/api/stripe/sync-donors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setStatus({
        msg: `Stripe sync: ${data.inserted} new · ${data.updatedFilled} filled · ${data.unchanged} already complete · ${data.failed} failed (${data.eligible} charges scanned in ${data.startDate} → ${data.endDate})`,
        type: "success",
      });
      await reload();
      await runReconciliation();
    } catch (err: any) {
      setStatus({ msg: err?.message ?? "Sync failed", type: "error" });
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    reload();
    runReconciliation();
  }, []);

  const total = useMemo(() => rows.reduce((sum, r) => sum + r.amount, 0), [rows]);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <div>
          Succeeded donation payments where the sync didn't capture donor info.
          Click <span className="font-semibold">Sync from Stripe</span> to pull
          missing data from the Stripe API (covers subscription charges too).
          Anything Stripe doesn't have can still be filled manually below.
        </div>
      </div>

      {/* Reconciliation card — side-by-side totals so admin can spot gaps */}
      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
            Stripe vs. Database
          </p>
          {recon && (
            <p className="text-[11px] text-gray-500">
              {recon.window.start} → {recon.window.end}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={runReconciliation}
            disabled={reconLoading}
            className="h-7 text-[11px]"
          >
            {reconLoading ? (
              <Loader2 size={11} className="animate-spin mr-1" />
            ) : (
              <RefreshCw size={11} className="mr-1" />
            )}
            Refresh counts
          </Button>
        </div>
        {reconLoading && !recon ? (
          <div className="p-5 text-center text-sm text-gray-400">
            <Loader2 className="animate-spin mx-auto mb-2" size={16} />
            Counting charges…
          </div>
        ) : recon ? (
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            <div className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                On Stripe
              </p>
              <p className="text-lg font-semibold text-gray-800 mt-1">
                {recon.stripe.eligibleForSync}{" "}
                <span className="text-xs text-gray-500 font-normal">succeeded charges</span>
              </p>
              <div className="text-[11px] text-gray-500 mt-1 space-y-0.5">
                <div>
                  Donor paid:{" "}
                  <span className="font-medium text-gray-700">
                    ${recon.stripe.donorPaidUsd ?? recon.stripe.totalUsd}
                  </span>{" "}
                  <span
                    className="text-gray-400"
                    title="Gross amount donors paid on Stripe. Receipts are issued for this amount."
                  >
                    (receipt amount)
                  </span>
                </div>
                {recon.stripe.payoutUsd !== undefined && (
                  <div>
                    Payout:{" "}
                    <span className="font-medium text-[#3d6b38]">
                      ${recon.stripe.payoutUsd}
                    </span>
                    {recon.stripe.feesUsd !== undefined && (
                      <span className="text-gray-400">
                        {" "}
                        (−${recon.stripe.feesUsd} fees)
                      </span>
                    )}
                  </div>
                )}
                {recon.stripe.nonUsdSkipped > 0 && (
                  <div className="text-gray-400">
                    {recon.stripe.nonUsdSkipped} non-USD skipped
                  </div>
                )}
              </div>
            </div>
            <div className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                In DB
              </p>
              <p className="text-lg font-semibold text-gray-800 mt-1">
                {recon.db.stripeIntentsInRange}{" "}
                <span className="text-xs text-gray-500 font-normal">pi_ rows</span>
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                <span className="text-[#3d6b38]">
                  {recon.db.withDonorInfo} complete
                </span>
                {recon.db.missingDonorInfo > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-600">
                      {recon.db.missingDonorInfo} missing donor info
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                Gap
              </p>
              <p
                className={`text-lg font-semibold mt-1 ${
                  recon.gap.missingFromDb > 0 ? "text-red-600" : "text-[#3d6b38]"
                }`}
              >
                {recon.gap.missingFromDb}{" "}
                <span className="text-xs text-gray-500 font-normal">not in DB</span>
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {recon.gap.missingFromDb > 0
                  ? `Run Sync from Stripe to import${
                      recon.gap.extraInDb > 0 ? ` · ${recon.gap.extraInDb} in DB not on Stripe` : ""
                    }`
                  : "All Stripe charges are in DB"}
              </p>
              {recon.gap.missingSample.length > 0 && (
                <details className="mt-2">
                  <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-700">
                    Show first {recon.gap.missingSample.length} missing pi_IDs
                  </summary>
                  <div className="mt-1.5 space-y-0.5 font-mono text-[10px] text-gray-500 max-h-32 overflow-y-auto">
                    {recon.gap.missingSample.map((pi) => (
                      <div key={pi} className="truncate">{pi}</div>
                    ))}
                  </div>
                </details>
              )}
              {recon.gap.extraInDb > 0 && recon.gap.extraSample.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-700">
                    Show first {recon.gap.extraSample.length} in DB not on Stripe
                  </summary>
                  <div className="mt-1.5 space-y-0.5 font-mono text-[10px] text-gray-500 max-h-32 overflow-y-auto">
                    {recon.gap.extraSample.map((pi) => (
                      <div key={pi} className="truncate">{pi}</div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        ) : (
          <div className="p-5 text-center text-sm text-gray-400">
            Reconciliation data unavailable.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500">
          <span className="font-semibold text-gray-700">{rows.length}</span> payment
          {rows.length === 1 ? "" : "s"} missing donor info ·{" "}
          <span className="font-semibold text-gray-700">{formatCurrency(total)}</span> total
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={syncing}
            onClick={runStripeSync}
            className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-8 text-xs"
          >
            {syncing ? (
              <Loader2 size={12} className="animate-spin mr-1.5" />
            ) : (
              <RefreshCw size={12} className="mr-1.5" />
            )}
            Sync from Stripe
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={reload}
            disabled={loading}
            className="h-8 text-xs"
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin mr-1.5" />
            ) : (
              <RefreshCw size={12} className="mr-1.5" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {status && <StatusBadge message={status.msg} type={status.type} />}

      {loading && rows.length === 0 && (
        <div className="border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-400 bg-white">
          <Loader2 className="animate-spin mx-auto mb-2" size={18} />
          Loading incomplete payments…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="border border-dashed border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500 bg-gray-50">
          All succeeded payments have donor info. Nothing to fix.
        </div>
      )}

      <div className="space-y-3">
        {rows.map((p) => (
          <IncompletePaymentRow
            key={p.paymentId}
            payment={p}
            onFilled={(msg) => {
              setStatus({ msg, type: "success" });
              reload();
            }}
            onError={(msg) => setStatus({ msg, type: "error" })}
          />
        ))}
      </div>
    </div>
  );
}

function IncompletePaymentRow({
  payment,
  onFilled,
  onError,
}: {
  payment: IncompletePayment;
  onFilled: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(payment.name);
  const [email, setEmail] = useState(payment.email);
  const [phone, setPhone] = useState(payment.phone);
  const [city, setCity] = useState(payment.city);
  const [postalCode, setPostalCode] = useState(payment.postalCode);
  const [country, setCountry] = useState(payment.country);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || !email.trim()) {
      onError("Name and email are required.");
      return;
    }
    setSaving(true);
    try {
      await fillPaymentDonorInfo(payment.paymentId, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        country: country.trim() || undefined,
      });
      onFilled(
        `Saved payment #${payment.paymentId} · ${name.trim()} <${email.trim()}>. Now searchable in Donor Search.`,
      );
    } catch (err: any) {
      onError(err?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap text-xs">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-gray-800">
            {formatCurrency(payment.amount)}
          </span>
          <span className="text-gray-500">{formatDate(payment.date)}</span>
          <Badge
            variant="outline"
            className={`text-[10px] font-normal ${sourceTone(payment.source)}`}
          >
            {payment.source}
          </Badge>
          {payment.paymentIntentId && (
            <span className="text-gray-400 font-mono truncate">
              {payment.paymentIntentId}
            </span>
          )}
        </div>
        <span className="text-gray-400 shrink-0">payment #{payment.paymentId}</span>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] text-gray-500 uppercase tracking-wider">
            Name <span className="text-red-400">*</span>
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Donor full name"
            className="h-9 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
          />
        </div>
        <div>
          <Label className="text-[11px] text-gray-500 uppercase tracking-wider">
            Email <span className="text-red-400">*</span>
          </Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="donor@example.com"
            className="h-9 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
          />
        </div>
        <div>
          <Label className="text-[11px] text-gray-500 uppercase tracking-wider">Phone</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-9 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[11px] text-gray-500 uppercase tracking-wider">City</Label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-9 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
            />
          </div>
          <div>
            <Label className="text-[11px] text-gray-500 uppercase tracking-wider">Postal</Label>
            <Input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="h-9 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
            />
          </div>
          <div>
            <Label className="text-[11px] text-gray-500 uppercase tracking-wider">Country</Label>
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="h-9 text-sm border-gray-200 focus-visible:ring-[#A2BD9D]"
            />
          </div>
        </div>
      </div>

      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex justify-end">
        <Button
          size="sm"
          disabled={saving || !name.trim() || !email.trim()}
          onClick={handleSave}
          className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-8 text-xs disabled:opacity-40"
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin mr-1.5" />
          ) : (
            <CheckCircle2 size={12} className="mr-1.5" />
          )}
          Save donor info
        </Button>
      </div>
    </div>
  );
}

// ─── Manual entry tab (kept from original for donations not yet in DB) ───────

function ManualEntryTab() {
  const [mode, setMode] = useState<"manual" | "transaction">("manual");
  const [transactionId, setTransactionId] = useState("");
  const [form, setForm] = useState<SingleFormData>(emptyForm);
  const [insertIntoDB, setInsertIntoDB] = useState(true);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [image, setImage] = useState<{ dataUrl: string; sizeBytes: number; originalName: string } | null>(null);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [lastSavedDonationId, setLastSavedDonationId] = useState<string | null>(null);
  const [lastSavedHadImage, setLastSavedHadImage] = useState(false);

  async function handleImageFile(file: File | null) {
    if (!file) {
      setImage(null);
      setImageError(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setImageError("Please select an image file.");
      return;
    }
    setImageError(null);
    setImageProcessing(true);
    try {
      const compressed = await compressImage(file);
      if (compressed.sizeBytes > MAX_UPLOAD_BYTES) {
        setImageError(
          `Even after compression this image is ${formatBytes(compressed.sizeBytes)}. Please pick a smaller image.`,
        );
        setImage(null);
        return;
      }
      setImage({ ...compressed, originalName: file.name });
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Could not process image.");
      setImage(null);
    } finally {
      setImageProcessing(false);
    }
  }

  const donationIdRequired = mode === "manual" && !insertIntoDB;
  const donationIdError =
    submitted && donationIdRequired && !form.donationId.trim()
      ? "Donation ID is required when not saving to database."
      : undefined;

  function setField(key: keyof SingleFormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleModeChange(v: "manual" | "transaction") {
    setMode(v);
    setForm(emptyForm);
    setTransactionId("");
    setInsertIntoDB(v === "manual");
    setSubmitted(false);
    setStatus(null);
    setImage(null);
    setImageError(null);
    setLastSavedDonationId(null);
    setLastSavedHadImage(false);
  }

  async function handleFetch() {
    if (!transactionId.trim()) return;
    setFetchLoading(true);
    setStatus(null);
    try {
      const data = await fetchDonationByTransactionId(transactionId.trim());
      setForm((prev) => ({ ...prev, ...data }));
      setStatus({ msg: "Donation data loaded successfully.", type: "success" });
    } catch {
      setStatus({ msg: "Could not fetch donation. Check the Transaction ID.", type: "error" });
    } finally {
      setFetchLoading(false);
    }
  }

  async function handleSend() {
    setSubmitted(true);
    if (donationIdRequired && !form.donationId.trim()) return;
    setSendLoading(true);
    setStatus(null);

    const payload = {
      donorName: form.donorName,
      amount: form.amount,
      giftDate: form.giftDate,
      donationId: form.donationId,
      donationSource: form.donationSource,
      metadata: {
        event: "N/A",
        ticketType: "N/A",
        quantity: "1",
        eventVenue: "N/A",
        eventDate: "N/A",
        eventTime: "N/A",
        ticketId: null,
        email: form.email,
        phone: form.phone,
        city: form.city,
        postalCode: form.postalCode,
        country: form.country,
        productName: "Nourished Education Contribution",
      },
      insertIntoDB: mode === "manual" ? insertIntoDB : false,
      ...(mode === "manual" && insertIntoDB && image ? { image: image.dataUrl } : {}),
    };

    try {
      const result = await sendSingleReceipt(payload);
      setStatus({ msg: "Receipt sent successfully!", type: "success" });
      setSubmitted(false);
      if (result?.donationId) {
        setLastSavedDonationId(String(result.donationId));
        setLastSavedHadImage(Boolean(result.imageId));
      }
    } catch {
      setStatus({ msg: "Failed to send receipt. Please try again.", type: "error" });
    } finally {
      setSendLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">
        Use this form to create a new donation record (cash, cheque, bank transfer) or look up one
        by transaction ID. For existing donors already in the database, use the Donor Search tab.
      </p>

      <div>
        <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">
          Data Source
        </p>
        <RadioGroup
          value={mode}
          onValueChange={(v) => handleModeChange(v as "manual" | "transaction")}
          className="flex gap-6"
        >
          <div className="flex items-center gap-2 cursor-pointer">
            <RadioGroupItem
              value="manual"
              id="manual"
              className="border-[#A2BD9D] data-[state=checked]:bg-[#A2BD9D] data-[state=checked]:border-[#A2BD9D]"
            />
            <Label htmlFor="manual" className="cursor-pointer font-medium text-sm text-gray-700">
              Enter Manually
            </Label>
          </div>
          <div className="flex items-center gap-2 cursor-pointer">
            <RadioGroupItem
              value="transaction"
              id="transaction"
              className="border-[#A2BD9D] data-[state=checked]:bg-[#A2BD9D] data-[state=checked]:border-[#A2BD9D]"
            />
            <Label htmlFor="transaction" className="cursor-pointer font-medium text-sm text-gray-700">
              Use Transaction ID
            </Label>
          </div>
        </RadioGroup>
      </div>

      {mode === "transaction" && (
        <div className="flex gap-3 items-end p-4 bg-gray-50 rounded-lg border border-gray-100">
          <div className="flex-1">
            <Label htmlFor="txnId" className="text-sm font-medium text-gray-700 mb-1.5 block">
              Transaction ID
            </Label>
            <Input
              id="txnId"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="e.g. pi_3a9f1c…"
              className="border-gray-200 focus-visible:ring-[#A2BD9D] text-sm h-9"
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            />
          </div>
          <Button
            onClick={handleFetch}
            disabled={fetchLoading || !transactionId.trim()}
            className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white h-9 px-4 text-sm font-medium"
          >
            {fetchLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Fetch Data
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Donor Name" id="donorName" value={form.donorName} onChange={(v) => setField("donorName", v)} placeholder="Jane Doe" />
        <FormField label="Email" id="email" type="email" value={form.email} onChange={(v) => setField("email", v)} placeholder="jane@example.com" />
        <FormField label="Phone" id="phone" type="tel" value={form.phone} onChange={(v) => setField("phone", v)} placeholder="+1 (555) 000-0000" />
        <FormField label="City" id="city" value={form.city} onChange={(v) => setField("city", v)} placeholder="Toronto" />
        <FormField label="Postal Code" id="postalCode" value={form.postalCode} onChange={(v) => setField("postalCode", v)} placeholder="M5V 2T6" />
        <FormField label="Country" id="country" value={form.country} onChange={(v) => setField("country", v)} placeholder="Canada" />
        <FormField label="Amount USD" id="amount" value={form.amount} onChange={(v) => setField("amount", v)} placeholder="250.00" />
        <FormField label="Gift Date" id="giftDate" type="date" value={form.giftDate} onChange={(v) => setField("giftDate", v)} />
        <FormField label="Donation Source" id="donationSource" value={form.donationSource} onChange={(v) => setField("donationSource", v)} placeholder="e.g. Cheque, Cash, Bank" />
        {mode === "transaction" ? (
          <FormField label="Donation ID" id="donationId" value={form.donationId} onChange={(v) => setField("donationId", v)} placeholder="12345" />
        ) : (
          !insertIntoDB && (
            <FormField
              label="Donation ID"
              id="donationId"
              value={form.donationId}
              onChange={(v) => setField("donationId", v)}
              placeholder="DON-2025-00456"
              required
              error={donationIdError}
            />
          )
        )}
      </div>

      {mode === "manual" && (
        <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-gray-50 border border-gray-100">
          <Checkbox
            id="insertDB"
            checked={insertIntoDB}
            onCheckedChange={(v) => {
              setInsertIntoDB(!!v);
              setSubmitted(false);
              if (!!v) setField("donationId", "");
              if (!v) {
                setImage(null);
                setImageError(null);
              }
            }}
            className="border-[#A2BD9D] data-[state=checked]:bg-[#A2BD9D] data-[state=checked]:border-[#A2BD9D]"
          />
          <Label htmlFor="insertDB" className="text-sm text-gray-700 cursor-pointer select-none">
            Insert into database
            <span className="ml-2 text-xs text-gray-400 font-normal">
              (saves this record — Donation ID will be auto-generated)
            </span>
          </Label>
        </div>
      )}

      {mode === "manual" && insertIntoDB && (
        <div className="py-3 px-4 rounded-lg bg-gray-50 border border-gray-100 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-gray-700">Proof image (optional)</p>
              <p className="text-xs text-gray-400 mt-0.5">
                e.g. photo of cheque or deposit slip. Compressed automatically; max {formatBytes(MAX_UPLOAD_BYTES)}.
              </p>
            </div>
            {!image && (
              <label className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3d6b38] bg-white border border-[#A2BD9D] rounded-md px-3 h-9 cursor-pointer hover:bg-[#f0f6ef]">
                <ImagePlus size={16} />
                <span>Choose image</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>
          {imageProcessing && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 size={14} className="animate-spin" />
              Compressing image…
            </div>
          )}
          {imageError && <p className="text-xs text-red-500">{imageError}</p>}
          {image && (
            <div className="flex items-center gap-3 p-2 bg-white rounded-md border border-gray-200">
              <img src={image.dataUrl} alt="" className="w-16 h-16 object-cover rounded-md border border-gray-100" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">{image.originalName}</p>
                <p className="text-xs text-gray-500">Compressed: {formatBytes(image.sizeBytes)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setImage(null);
                  setImageError(null);
                }}
                className="h-8 px-2 text-gray-500 hover:text-red-600"
              >
                <X size={16} />
              </Button>
            </div>
          )}
        </div>
      )}

      {status && <StatusBadge message={status.msg} type={status.type} />}

      {lastSavedDonationId && lastSavedHadImage && (
        <a
          href={`${API_BASE}/receipt/${encodeURIComponent(lastSavedDonationId)}/image`}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#3d6b38] bg-[#f0f6ef] border border-[#A2BD9D] rounded-md px-3 h-9 hover:bg-[#e4efe1]"
          target="_blank"
          rel="noopener"
        >
          <Download size={16} />
          Download receipt image (donation #{lastSavedDonationId})
        </a>
      )}

      <div className="pt-2 border-t border-gray-100">
        <Button
          onClick={handleSend}
          disabled={sendLoading}
          className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white px-6 h-10 text-sm font-semibold transition-colors"
        >
          {sendLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Send Receipt
        </Button>
      </div>
    </div>
  );
}

function FormField({
  label,
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  error,
}: {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`text-sm h-9 focus-visible:ring-[#A2BD9D] focus-visible:border-[#A2BD9D] ${
          error ? "border-red-300 bg-red-50" : "border-gray-200"
        }`}
      />
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DonationReceiptsPage() {
  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-[#A2BD9D] flex items-center justify-center">
            <Receipt className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-gray-800 tracking-tight">
            Donation Receipts
          </h1>
        </div>
        <p className="text-sm text-gray-500 ml-11">
          Search donors, review donation history, and send single, combined, or year-end receipts.
        </p>
      </div>

      <Tabs defaultValue="search" className="w-full">
        <TabsList className="mb-6 bg-gray-100 rounded-lg p-1 w-full max-w-3xl">
          <TabsTrigger
            value="search"
            className="flex-1 text-sm font-medium rounded-md data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
          >
            <Search size={13} className="mr-1.5" />
            Donor Search
          </TabsTrigger>
          <TabsTrigger
            value="bank"
            className="flex-1 text-sm font-medium rounded-md data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
          >
            <Download size={13} className="mr-1.5 rotate-180" />
            Bank Transfers
          </TabsTrigger>
          <TabsTrigger
            value="incomplete"
            className="flex-1 text-sm font-medium rounded-md data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
          >
            <AlertTriangle size={13} className="mr-1.5" />
            Incomplete
          </TabsTrigger>
          <TabsTrigger
            value="manual"
            className="flex-1 text-sm font-medium rounded-md data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
          >
            <Plus size={13} className="mr-1.5" />
            New Donation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search">
          <DonorSearchFlow />
        </TabsContent>

        <TabsContent value="bank">
          <BankTransactionsTab />
        </TabsContent>

        <TabsContent value="incomplete">
          <IncompletePaymentsTab />
        </TabsContent>

        <TabsContent value="manual">
          <ManualEntryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

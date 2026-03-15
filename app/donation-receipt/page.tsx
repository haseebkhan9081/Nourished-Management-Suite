//@ts-nocheck
"use client";

import { useState } from "react";
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
import {
  Search,
  Send,
  Loader2,
  Receipt,
  CalendarCheck,
  RefreshCw,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SingleReceiptPayload {
  donorName: string;
  amount: string;
  giftDate: string;
  donationId: string;
  donationSource: string;
  metadata: {
    email: string;
    phone: string;
    city: string;
    postalCode: string;
    country: string;
    productName: "Nourished Education Contribution";
  };
  insertIntoDB: boolean;
}

interface YearEndPayload {
  email: string;
  year: string;
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

async function fetchDonationByTransactionId(
  transactionId: string
): Promise<Partial<SingleFormData>> {
  const res = await fetch(
    `${API_BASE}/receipt/transaction/${encodeURIComponent(transactionId)}`
  );
  if (!res.ok) throw new Error("Failed to fetch donation data");
  return res.json();
}

async function sendSingleReceipt(payload: SingleReceiptPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/receipt/single`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to send receipt");
}

async function sendYearEndReceipt(payload: YearEndPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/receipt/year-end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to send year-end receipt");
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

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

// ─── Tab 1: Single Receipt ────────────────────────────────────────────────────

function SingleReceiptTab() {
  const [mode, setMode] = useState<"manual" | "transaction">("manual");
  const [transactionId, setTransactionId] = useState("");
  const [form, setForm] = useState<SingleFormData>(emptyForm);
  const [insertIntoDB, setInsertIntoDB] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  // Donation ID is required in manual mode only when NOT inserting into DB
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
    setInsertIntoDB(false);
    setSubmitted(false);
    setStatus(null);
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
      setStatus({
        msg: "Could not fetch donation. Check the Transaction ID.",
        type: "error",
      });
    } finally {
      setFetchLoading(false);
    }
  }

  async function handleSend() {
    setSubmitted(true);
    if (donationIdRequired && !form.donationId.trim()) return;

    setSendLoading(true);
    setStatus(null);

    const payload: SingleReceiptPayload = {
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
      // transaction mode never inserts (record already exists)
      insertIntoDB: mode === "manual" ? insertIntoDB : false,
    };

    try {
      await sendSingleReceipt(payload);
      setStatus({ msg: "Receipt sent successfully!", type: "success" });
      setSubmitted(false);
    } catch {
      setStatus({
        msg: "Failed to send receipt. Please try again.",
        type: "error",
      });
    } finally {
      setSendLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Mode selector */}
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

      {/* Transaction ID lookup */}
      {mode === "transaction" && (
        <div className="flex gap-3 items-end p-4 bg-gray-50 rounded-lg border border-gray-100">
          <div className="flex-1">
            <Label
              htmlFor="txnId"
              className="text-sm font-medium text-gray-700 mb-1.5 block"
            >
              Transaction ID
            </Label>
            <Input
              id="txnId"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="e.g. TXN-2025-00123"
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

      {/* Divider */}
      {mode === "transaction" && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400 uppercase tracking-wider">
            Donor Details
          </span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>
      )}

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          label="Donor Name"
          id="donorName"
          value={form.donorName}
          onChange={(v) => setField("donorName", v)}
          placeholder="Jane Doe"
        />
        <FormField
          label="Email"
          id="email"
          type="email"
          value={form.email}
          onChange={(v) => setField("email", v)}
          placeholder="jane@example.com"
        />
        <FormField
          label="Phone"
          id="phone"
          type="tel"
          value={form.phone}
          onChange={(v) => setField("phone", v)}
          placeholder="+1 (555) 000-0000"
        />
        <FormField
          label="City"
          id="city"
          value={form.city}
          onChange={(v) => setField("city", v)}
          placeholder="Toronto"
        />
        <FormField
          label="Postal Code"
          id="postalCode"
          value={form.postalCode}
          onChange={(v) => setField("postalCode", v)}
          placeholder="M5V 2T6"
        />
        <FormField
          label="Country"
          id="country"
          value={form.country}
          onChange={(v) => setField("country", v)}
          placeholder="Canada"
        />
        <FormField
          label="Amount USD"
          id="amount"
          value={form.amount}
          onChange={(v) => setField("amount", v)}
          placeholder="250.00"
        />
        <FormField
          label="Gift Date"
          id="giftDate"
          type="date"
          value={form.giftDate}
          onChange={(v) => setField("giftDate", v)}
        />
        <FormField
          label="Donation Source"
          id="donationSource"
          value={form.donationSource}
          onChange={(v) => setField("donationSource", v)}
          placeholder="e.g. Website, Event, Cheque, Cash"
        />

        {/* Donation ID:
            - Transaction mode: always shown (auto-populated from fetch)
            - Manual mode + insertIntoDB=false: shown and required
            - Manual mode + insertIntoDB=true: hidden (ID will be generated by DB)
        */}
        {mode === "transaction" ? (
          <FormField
            label="Donation ID"
            id="donationId"
            value={form.donationId}
            onChange={(v) => setField("donationId", v)}
            placeholder="12345"
          />
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

      {/* Insert into DB — only shown in manual mode */}
      {mode === "manual" && (
        <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-gray-50 border border-gray-100">
          <Checkbox
            id="insertDB"
            checked={insertIntoDB}
            onCheckedChange={(v) => {
              setInsertIntoDB(!!v);
              setSubmitted(false);
              if (!!v) setField("donationId", "");
            }}
            className="border-[#A2BD9D] data-[state=checked]:bg-[#A2BD9D] data-[state=checked]:border-[#A2BD9D]"
          />
          <Label
            htmlFor="insertDB"
            className="text-sm text-gray-700 cursor-pointer select-none"
          >
            Insert into database
            <span className="ml-2 text-xs text-gray-400 font-normal">
              (saves this record — Donation ID will be auto-generated)
            </span>
          </Label>
        </div>
      )}

      {/* Status */}
      {status && <StatusBadge message={status.msg} type={status.type} />}

      {/* Send */}
      <div className="pt-2 border-t border-gray-100">
        <Button
          onClick={handleSend}
          disabled={sendLoading}
          className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white px-6 h-10 text-sm font-semibold transition-colors"
        >
          {sendLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          Send Receipt
        </Button>
      </div>
    </div>
  );
}

// ─── Tab 2: Year-End Receipt ──────────────────────────────────────────────────

function YearEndReceiptTab() {
  const [email, setEmail] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  async function handleSend() {
    if (!email.trim() || !year.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      await sendYearEndReceipt({ email: email.trim(), year: year.trim() });
      setStatus({
        msg: `Year-end receipt for ${year} sent to ${email}.`,
        type: "success",
      });
    } catch {
      setStatus({ msg: "Failed to send year-end receipt.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <p className="text-sm text-gray-500 leading-relaxed">
        Generate a consolidated receipt summarising all donations made by a
        donor within a specific calendar year.
      </p>

      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="yeEmail" className="text-sm font-medium text-gray-700">
            Donor Email
          </Label>
          <Input
            id="yeEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="donor@example.com"
            className="border-gray-200 focus-visible:ring-[#A2BD9D] text-sm h-9"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="yeYear" className="text-sm font-medium text-gray-700">
            Tax Year
          </Label>
          <Input
            id="yeYear"
            type="number"
            min="2000"
            max="2099"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2025"
            className="border-gray-200 focus-visible:ring-[#A2BD9D] text-sm h-9 w-36"
          />
        </div>
      </div>

      {status && <StatusBadge message={status.msg} type={status.type} />}

      <div className="pt-2 border-t border-gray-100">
        <Button
          onClick={handleSend}
          disabled={loading || !email.trim() || !year.trim()}
          className="bg-[#A2BD9D] hover:bg-[#8FA889] text-white px-6 h-10 text-sm font-semibold transition-colors"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <CalendarCheck className="w-4 h-4 mr-2" />
          )}
          Send Year-End Receipt
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DonationReceiptsPage() {
  return (
    <div className="min-h-screen bg-[#f8faf8] p-6 md:p-10">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-[#A2BD9D] flex items-center justify-center">
            <Receipt className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-gray-800 tracking-tight">
            Donation Receipts
          </h1>
        </div>
        <p className="text-sm text-gray-500 ml-11">
          Nourished Education · Internal Admin Tool
        </p>
      </div>

      {/* Main card */}
      <Card className="max-w-3xl border border-gray-200 shadow-sm bg-white rounded-xl">
        <CardHeader className="pb-0 pt-6 px-6">
          <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[#A2BD9D]" />
            Send Receipt
          </CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          <Tabs defaultValue="single" className="w-full">
            <TabsList className="mb-6 bg-gray-100 rounded-lg p-1 w-full max-w-xs">
              <TabsTrigger
                value="single"
                className="flex-1 text-sm font-medium rounded-md data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
              >
                Single Receipt
              </TabsTrigger>
              <TabsTrigger
                value="yearend"
                className="flex-1 text-sm font-medium rounded-md data-[state=active]:bg-[#A2BD9D] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
              >
                Year-End
              </TabsTrigger>
            </TabsList>

            <TabsContent value="single">
              <SingleReceiptTab />
            </TabsContent>

            <TabsContent value="yearend">
              <YearEndReceiptTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  preview: PreviewData | null;
}

interface ValidationError {
  type: "missing_column" | "invalid_data" | "empty_file" | "parse_error";
  message: string;
  details?: string;
}

interface ValidationWarning {
  type: "missing_optional" | "data_quality";
  message: string;
  count?: number;
}

interface PreviewData {
  fileName: string;
  totalRows: number;
  columns: string[];
  sampleRows: Record<string, string>[];
  estimatedDebtors: number;
  estimatedAmount: number;
}

interface UploadResult {
  success: boolean;
  campaignId: string;
  campaignNumber: number;
  campaignName: string;
  totalRows: number;
  totalDebtors: number;
  callableDebtors: number;
  emailOnlyDebtors: number;
  totalInvoices: number;
  totalAmount: number;
  callsQueued: number;
  workerStarted: boolean;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const REQUIRED_COLUMNS = ["Debtor Name", "Phone Number", "Load Number", "Amount"];
const OPTIONAL_COLUMNS = ["Debtor MC", "Debtor DOT", "Debtor Email", "Timezone", "Email Only", "Carrier Name", "Client MC", "Client DOT"];

// ═══════════════════════════════════════════════════════════════════════════
// CSV PARSING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] ?? "";
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

function validateCSV(file: File, text: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Try to parse
  let parsed: { headers: string[]; rows: Record<string, string>[] };
  try {
    parsed = parseCSV(text);
  } catch {
    return {
      isValid: false,
      errors: [{ type: "parse_error", message: "Could not parse the CSV file. Please check the file format." }],
      warnings: [],
      preview: null,
    };
  }

  const { headers, rows } = parsed;

  // Check for empty file
  if (headers.length === 0 || rows.length === 0) {
    return {
      isValid: false,
      errors: [{ type: "empty_file", message: "The CSV file is empty or contains no data rows." }],
      warnings: [],
      preview: null,
    };
  }

  // Check for required columns
  const missingRequired = REQUIRED_COLUMNS.filter(
    (col) => !headers.some((h) => h.toLowerCase() === col.toLowerCase())
  );
  if (missingRequired.length > 0) {
    errors.push({
      type: "missing_column",
      message: `Missing required columns: ${missingRequired.join(", ")}`,
      details: `Your CSV must include these columns: ${REQUIRED_COLUMNS.join(", ")}`,
    });
  }

  // Check for optional columns (warnings)
  const missingOptional = OPTIONAL_COLUMNS.filter(
    (col) => !headers.some((h) => h.toLowerCase() === col.toLowerCase())
  );
  if (missingOptional.length > 0) {
    warnings.push({
      type: "missing_optional",
      message: `Optional columns not found: ${missingOptional.slice(0, 3).join(", ")}${missingOptional.length > 3 ? ` and ${missingOptional.length - 3} more` : ""}`,
    });
  }

  // Validate data quality if columns exist
  if (errors.length === 0) {
    let emptyPhones = 0;
    let invalidAmounts = 0;
    let emptyNames = 0;

    for (const row of rows) {
      const name = row["Debtor Name"] || row["debtor name"] || "";
      const phone = row["Phone Number"] || row["phone number"] || "";
      const amount = row["Amount"] || row["amount"] || "";

      if (!name.trim()) emptyNames++;
      if (!phone.trim()) emptyPhones++;

      const parsedAmount = parseFloat(amount.replace(/[,$]/g, ""));
      if (isNaN(parsedAmount) || parsedAmount <= 0) invalidAmounts++;
    }

    if (emptyNames > 0) {
      errors.push({
        type: "invalid_data",
        message: `${emptyNames} row(s) have empty Debtor Name`,
      });
    }
    if (emptyPhones > 0) {
      warnings.push({
        type: "data_quality",
        message: `${emptyPhones} row(s) have empty Phone Number (these will be skipped)`,
        count: emptyPhones,
      });
    }
    if (invalidAmounts > 0) {
      warnings.push({
        type: "data_quality",
        message: `${invalidAmounts} row(s) have invalid or zero Amount`,
        count: invalidAmounts,
      });
    }
  }

  // Calculate preview data
  const debtorNames = new Set(rows.map((r) => r["Debtor Name"] || r["debtor name"] || "").filter(Boolean));
  const totalAmount = rows.reduce((sum, r) => {
    const amt = parseFloat((r["Amount"] || r["amount"] || "0").replace(/[,$]/g, ""));
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const preview: PreviewData = {
    fileName: file.name,
    totalRows: rows.length,
    columns: headers,
    sampleRows: rows.slice(0, 5),
    estimatedDebtors: debtorNames.size,
    estimatedAmount: totalAmount,
  };

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    preview,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function BackButton() {
  return (
    <Link
      href="/campaigns"
      className="inline-flex items-center gap-2 text-[13px] font-medium transition-colors hover:opacity-80"
      style={{ color: "var(--fg-muted)" }}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back to Campaigns
    </Link>
  );
}

function ColumnBadge({ name, isRequired, isPresent }: { name: string; isRequired: boolean; isPresent: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        isPresent
          ? "bg-[var(--color-success-muted)] text-[var(--color-success)]"
          : isRequired
            ? "bg-[var(--color-danger-muted)] text-[var(--color-danger)]"
            : "bg-[var(--glass-bg-elevated)] text-[var(--fg-muted)]"
      )}
    >
      {isPresent ? (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20,6 9,17 4,12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : isRequired ? (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {name}
      {isRequired && !isPresent && " (required)"}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

type PageState = "upload" | "preview" | "starting" | "complete";

export default function NewCampaignPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [state, setState] = useState<PageState>("upload");
  const [dragActive, setDragActive] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [startImmediately, setStartImmediately] = useState(true);

  // Upload mutation - must be declared before any conditional returns
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Upload failed");
      }
      return res.json() as Promise<UploadResult>;
    },
    onSuccess: (data) => {
      toast.success(`Campaign "${data.campaignName}" created with ${data.callableDebtors} callable debtors`);
      setState("complete");
      // Redirect to campaign detail after a short delay
      setTimeout(() => {
        router.push(`/campaigns/${data.campaignId}`);
      }, 1500);
    },
    onError: (error) => {
      toast.error(error.message);
      setState("preview");
    },
  });

  // Handle file selection and validation - must be declared before any conditional returns
  const handleFile = useCallback(async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please select a CSV file");
      return;
    }

    setFile(selectedFile);
    setState("preview");

    // Read and validate the file
    const text = await selectedFile.text();
    const result = validateCSV(selectedFile, text);
    setValidation(result);

    // Set default campaign name from file
    const baseName = selectedFile.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
    setCampaignName(baseName);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) handleFile(selectedFile);
    },
    [handleFile]
  );

  // Check if user can perform operations (ADMIN or OPERATOR)
  const canOperate = session?.user?.role === "ADMIN" || session?.user?.role === "OPERATOR";

  // Show loading state while checking session
  if (status === "loading") {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--accent-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  // Viewers cannot access this page
  if (!canOperate) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold" style={{ color: "var(--fg-primary)" }}>
            Access Denied
          </h1>
          <p className="mt-2" style={{ color: "var(--fg-secondary)" }}>
            You need operator or admin permissions to create campaigns.
          </p>
          <Link
            href="/campaigns"
            className="mt-4 inline-block linear-btn-secondary"
          >
            Back to Campaigns
          </Link>
        </div>
      </div>
    );
  }

  const handleStartCampaign = () => {
    if (!file || !validation?.isValid) return;

    setState("starting");
    const formData = new FormData();
    formData.append("file", file);
    if (campaignName.trim()) {
      formData.append("campaignName", campaignName.trim());
    }
    formData.append("startImmediately", String(startImmediately));

    uploadMutation.mutate(formData);
  };

  const handleReset = () => {
    setState("upload");
    setFile(null);
    setValidation(null);
    setCampaignName("");
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <div className="space-y-6">
      <BackButton />

      {/* Header */}
      <div>
        <h1 className="text-[24px] font-semibold" style={{ color: "var(--fg-primary)" }}>
          New Campaign
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--fg-muted)" }}>
          Upload a CSV file to create a new collection campaign
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* STEP 1: UPLOAD */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {state === "upload" && (
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Upload Zone */}
          <div className="linear-card p-6">
            <div
              className={cn(
                "relative rounded-lg border-2 border-dashed p-12 text-center transition-all duration-200",
                dragActive ? "border-[var(--accent-primary)] bg-[var(--interactive-hover)]" : "border-[var(--border-medium)]"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".csv"
                onChange={handleChange}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <svg
                className="mx-auto h-12 w-12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ color: dragActive ? "var(--accent-primary)" : "var(--fg-muted)" }}
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="17,8 12,3 7,8" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="mt-4 text-[15px] font-medium" style={{ color: "var(--fg-primary)" }}>
                Drag and drop your CSV file here
              </p>
              <p className="mt-2 text-[13px]" style={{ color: "var(--fg-muted)" }}>
                or click to browse
              </p>
            </div>
          </div>

          {/* Expected Format */}
          <div className="linear-card p-5">
            <h3 className="mb-3 text-[14px] font-semibold" style={{ color: "var(--fg-primary)" }}>
              Expected CSV Format
            </h3>
            <p className="mb-4 text-[13px]" style={{ color: "var(--fg-muted)" }}>
              Your CSV file should contain the following columns:
            </p>

            <div className="space-y-3">
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-danger)" }}>
                  Required Columns
                </p>
                <div className="flex flex-wrap gap-2">
                  {REQUIRED_COLUMNS.map((col) => (
                    <span
                      key={col}
                      className="rounded-full px-3 py-1 text-[12px] font-medium"
                      style={{ background: "var(--color-danger-muted)", color: "var(--color-danger)" }}
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
                  Optional Columns
                </p>
                <div className="flex flex-wrap gap-2">
                  {OPTIONAL_COLUMNS.map((col) => (
                    <span
                      key={col}
                      className="rounded-full px-3 py-1 text-[12px] font-medium"
                      style={{ background: "var(--glass-bg-elevated)", color: "var(--fg-muted)" }}
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg p-3" style={{ background: "var(--glass-bg)" }}>
              <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                <strong>Note:</strong> Each row represents an invoice. Multiple invoices with the same Debtor Name will be
                grouped together. The <strong>Email Only</strong> column should contain &quot;TRUE&quot; or &quot;FALSE&quot; to indicate if
                the debtor should only be contacted by email.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* STEP 2: PREVIEW & VALIDATION */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {(state === "preview" || state === "starting") && validation && (
        <div className="space-y-6">
          {/* Validation Status */}
          <div
            className={cn(
              "linear-card p-5",
              validation.isValid ? "border-[var(--color-success)]" : "border-[var(--color-danger)]"
            )}
            style={{ borderColor: validation.isValid ? "var(--color-success)" : "var(--color-danger)" }}
          >
            <div className="flex items-start gap-4">
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background: validation.isValid ? "var(--color-success-muted)" : "var(--color-danger-muted)",
                }}
              >
                {validation.isValid ? (
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ color: "var(--color-success)" }}
                  >
                    <polyline points="20,6 9,17 4,12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ color: "var(--color-danger)" }}
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <h3
                  className="text-[16px] font-semibold"
                  style={{ color: validation.isValid ? "var(--color-success)" : "var(--color-danger)" }}
                >
                  {validation.isValid ? "File Validated Successfully" : "Validation Failed"}
                </h3>
                <p className="mt-1 text-[13px]" style={{ color: "var(--fg-muted)" }}>
                  {validation.preview?.fileName} - {validation.preview?.totalRows.toLocaleString()} rows
                </p>

                {/* Errors */}
                {validation.errors.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {validation.errors.map((error, i) => (
                      <div key={i} className="rounded-lg p-3" style={{ background: "var(--color-danger-muted)" }}>
                        <p className="text-[13px] font-medium" style={{ color: "var(--color-danger)" }}>
                          {error.message}
                        </p>
                        {error.details && (
                          <p className="mt-1 text-[12px]" style={{ color: "var(--fg-muted)" }}>
                            {error.details}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Warnings */}
                {validation.warnings.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {validation.warnings.map((warning, i) => (
                      <div key={i} className="rounded-lg p-3" style={{ background: "var(--color-warning-muted)" }}>
                        <p className="text-[13px]" style={{ color: "var(--color-warning)" }}>
                          {warning.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column Check */}
          {validation.preview && (
            <div className="linear-card p-5">
              <h3 className="mb-3 text-[14px] font-semibold" style={{ color: "var(--fg-primary)" }}>
                Column Mapping
              </h3>
              <div className="flex flex-wrap gap-2">
                {REQUIRED_COLUMNS.map((col) => (
                  <ColumnBadge
                    key={col}
                    name={col}
                    isRequired={true}
                    isPresent={validation.preview!.columns.some((c) => c.toLowerCase() === col.toLowerCase())}
                  />
                ))}
                {OPTIONAL_COLUMNS.map((col) => (
                  <ColumnBadge
                    key={col}
                    name={col}
                    isRequired={false}
                    isPresent={validation.preview!.columns.some((c) => c.toLowerCase() === col.toLowerCase())}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Preview Stats */}
          {validation.isValid && validation.preview && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="linear-card p-4 text-center">
                  <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
                    Estimated Debtors
                  </p>
                  <p className="mt-1 text-[28px] font-semibold" style={{ color: "var(--fg-primary)" }}>
                    {validation.preview.estimatedDebtors.toLocaleString()}
                  </p>
                </div>
                <div className="linear-card p-4 text-center">
                  <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
                    Total Invoices
                  </p>
                  <p className="mt-1 text-[28px] font-semibold" style={{ color: "var(--fg-primary)" }}>
                    {validation.preview.totalRows.toLocaleString()}
                  </p>
                </div>
                <div className="linear-card p-4 text-center">
                  <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
                    Estimated Amount
                  </p>
                  <p className="mt-1 text-[28px] font-semibold" style={{ color: "var(--color-success)" }}>
                    {formatCurrency(validation.preview.estimatedAmount)}
                  </p>
                </div>
              </div>

              {/* Campaign Settings */}
              <div className="linear-card p-5">
                <h3 className="mb-4 text-[14px] font-semibold" style={{ color: "var(--fg-primary)" }}>
                  Campaign Settings
                </h3>

                <div className="space-y-4">
                  {/* Campaign Name */}
                  <div>
                    <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--fg-secondary)" }}>
                      Campaign Name
                    </label>
                    <input
                      type="text"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="Enter campaign name..."
                      className="linear-input w-full"
                    />
                  </div>

                  {/* Start Immediately Toggle */}
                  <div className="flex items-center justify-between rounded-lg p-3" style={{ background: "var(--glass-bg)" }}>
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: "var(--fg-primary)" }}>
                        Start Campaign Immediately
                      </p>
                      <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                        Begin making calls as soon as the campaign is created
                      </p>
                    </div>
                    <button
                      onClick={() => setStartImmediately(!startImmediately)}
                      className={cn(
                        "relative h-6 w-11 rounded-full transition-colors",
                        startImmediately ? "bg-[var(--color-success)]" : "bg-[var(--glass-bg-elevated)]"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                          startImmediately ? "left-[22px]" : "left-0.5"
                        )}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  disabled={state === "starting"}
                  className="linear-btn-secondary flex-1"
                >
                  Upload Different File
                </button>
                <button
                  onClick={handleStartCampaign}
                  disabled={state === "starting"}
                  className="linear-btn-primary flex-1"
                >
                  {state === "starting" ? (
                    <span className="flex items-center justify-center gap-2">
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                        style={{ borderColor: "white", borderTopColor: "transparent" }}
                      />
                      Creating Campaign...
                    </span>
                  ) : (
                    "Start Campaign"
                  )}
                </button>
              </div>
            </>
          )}

          {/* Reset button for failed validation */}
          {!validation.isValid && (
            <button onClick={handleReset} className="linear-btn-secondary w-full">
              Upload Different File
            </button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* STEP 3: COMPLETE */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {state === "complete" && (
        <div className="mx-auto max-w-md text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: "var(--color-success-muted)" }}
          >
            <svg
              className="h-8 w-8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: "var(--color-success)" }}
            >
              <polyline points="20,6 9,17 4,12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-[20px] font-semibold" style={{ color: "var(--fg-primary)" }}>
            Campaign Created!
          </h2>
          <p className="mt-2 text-[14px]" style={{ color: "var(--fg-muted)" }}>
            Redirecting to campaign details...
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

interface CampaignStatus {
  state: "idle" | "running" | "paused" | "complete";
  isPaused: boolean;
  totalCalls: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  processedCalls: number;
  progress: number;
  sourceFile: string | null;
  importedAt: string | null;
  campaignId: string | null;
  campaignName: string | null;
  campaignNumber: number | null;
}

interface DashboardStats {
  totalDebtors: number;
  callableDebtors: number;
  emailOnlyDebtors: number;
  totalAmountOwed: number;
  totalCalls: number;
  callsToday: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  outcomeCounts: Array<{ outcome: string; count: number }>;
  successfulCalls: number;
  connectedCalls: number;
  noContactCalls: number;
  unsuccessfulCalls: number;
  contactRate: number;
  successRate: number;
}

interface CampaignListItem {
  id: string;
  campaignNumber: number;
  name: string;
  status: string;
  isActive: boolean;
  totalDebtors: number;
  totalAmount: number;
  totalCalls: number;
  completedCalls: number;
  progress: number;
  createdAt: string;
}

// ============================================================================
// UPLOAD COMPONENT (shown when no debtors)
// ============================================================================

type UploadState = "idle" | "uploading" | "processing" | "report";

interface ImportResult {
  success: boolean;
  totalRows: number;
  totalDebtors: number;
  totalInvoices: number;
  totalAmount: number;
  emailOnlyDebtors: number;
  callableDebtors: number;
}

function UploadSection({ onSuccess }: { onSuccess: () => void }) {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      return;
    }

    setState("uploading");
    setProgress(10);
    setFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);

    try {
      setProgress(30);
      setState("processing");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      setProgress(90);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }

      const data: ImportResult = await response.json();
      setProgress(100);
      setResult(data);
      setState("report");
    } catch {
      setState("idle");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleReset = () => {
    setState("idle");
    setProgress(0);
    setResult(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-[28px] font-semibold" style={{ color: "var(--fg-primary)" }}>
          Welcome to Bobtail Collections
        </h1>
        <p className="mt-2 text-[14px]" style={{ color: "var(--fg-muted)" }}>
          Upload your CSV file to start the payment collection campaign
        </p>
      </div>

      {/* Upload Card */}
      <div className="linear-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: "var(--interactive-hover)" }}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ color: "var(--accent-primary)" }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="14,2 14,8 20,8" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-medium" style={{ color: "var(--fg-primary)" }}>
              CSV Import
            </h2>
            <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              Upload the collections dataset
            </p>
          </div>
        </div>

        {state === "idle" && (
          <div
            className={cn(
              "relative rounded-lg border-2 border-dashed p-12 text-center transition-all duration-200",
              dragActive ? "border-accent-primary" : ""
            )}
            style={{
              borderColor: dragActive ? "var(--accent-primary)" : "var(--border-medium)",
              background: dragActive ? "var(--interactive-hover)" : "transparent",
            }}
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
              style={{ color: "var(--fg-muted)" }}
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
        )}

        {(state === "uploading" || state === "processing") && (
          <div className="space-y-4 py-8 text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--accent-primary)", borderTopColor: "transparent" }} />
            <p className="text-[15px] font-medium" style={{ color: "var(--fg-primary)" }}>
              {state === "uploading" ? "Uploading..." : "Processing CSV..."}
            </p>
            <div className="mx-auto h-1.5 w-64 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: "var(--accent-primary)" }}
              />
            </div>
            <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              Grouping invoices by debtor...
            </p>
          </div>
        )}

        {state === "report" && result && (
          <div className="space-y-6 py-4">
            {/* Header */}
            <div className="flex items-center justify-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "var(--color-success-muted)" }}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-success)" }}>
                  <polyline points="20,6 9,17 4,12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-[16px] font-semibold" style={{ color: "var(--color-success)" }}>Import Complete</span>
            </div>

            {/* File Info */}
            <div className="rounded-lg px-4 py-3 text-center text-[13px]" style={{ background: "var(--glass-bg-elevated)" }}>
              <span style={{ color: "var(--fg-muted)" }}>File: </span>
              <span className="font-medium" style={{ color: "var(--fg-primary)" }}>{fileName}</span>
            </div>

            {/* Breakdown Table */}
            <div className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--border-subtle)" }}>
              <table className="w-full text-[13px]">
                <tbody>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--fg-primary)" }}>Total Rows in CSV</td>
                    <td className="px-4 py-3 text-right font-mono font-bold" style={{ color: "var(--fg-primary)" }}>{result.totalRows.toLocaleString()}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--glass-bg)" }}>
                    <td className="px-4 py-3 pl-8" style={{ color: "var(--fg-muted)" }}>Unique Debtors</td>
                    <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--fg-secondary)" }}>{result.totalDebtors.toLocaleString()}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--glass-bg)" }}>
                    <td className="px-4 py-3 pl-8" style={{ color: "var(--fg-muted)" }}>Total Invoices</td>
                    <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--fg-secondary)" }}>{result.totalInvoices.toLocaleString()}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--glass-bg)" }}>
                    <td className="px-4 py-3 pl-8" style={{ color: "var(--color-success)" }}>Callable Debtors</td>
                    <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--color-success)" }}>{result.callableDebtors.toLocaleString()}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--glass-bg)" }}>
                    <td className="px-4 py-3 pl-8" style={{ color: "var(--color-warning)" }}>Email-Only Debtors</td>
                    <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--color-warning)" }}>{result.emailOnlyDebtors.toLocaleString()}</td>
                  </tr>
                  <tr style={{ background: "var(--color-success-muted)" }}>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--color-success)" }}>Total Amount Owed</td>
                    <td className="px-4 py-3 text-right font-mono text-[18px] font-bold" style={{ color: "var(--color-success)" }}>{formatCurrency(result.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Visual breakdown */}
            <div className="space-y-2">
              <div className="flex justify-between text-[11px]" style={{ color: "var(--fg-muted)" }}>
                <span>Debtor Breakdown</span>
                <span>{result.totalDebtors.toLocaleString()} total</span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full">
                <div style={{ width: `${(result.callableDebtors / result.totalDebtors) * 100}%`, background: "var(--color-success)" }} title={`Callable: ${result.callableDebtors}`} />
                <div style={{ width: `${(result.emailOnlyDebtors / result.totalDebtors) * 100}%`, background: "var(--color-warning)" }} title={`Email-Only: ${result.emailOnlyDebtors}`} />
              </div>
              <div className="flex gap-4 text-[11px]" style={{ color: "var(--fg-muted)" }}>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full" style={{ background: "var(--color-success)" }} />
                  <span>Callable ({((result.callableDebtors / result.totalDebtors) * 100).toFixed(1)}%)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full" style={{ background: "var(--color-warning)" }} />
                  <span>Email-Only ({((result.emailOnlyDebtors / result.totalDebtors) * 100).toFixed(1)}%)</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button onClick={handleReset} className="linear-btn-secondary flex-1">
                Upload Different File
              </button>
              {result.totalDebtors > 0 && (
                <button onClick={onSuccess} className="linear-btn-primary flex-1">
                  Continue to Dashboard
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Expected Format Info */}
      <div className="linear-card p-5">
        <h3 className="mb-3 text-[14px] font-medium" style={{ color: "var(--fg-primary)" }}>Expected Format</h3>
        <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
          The CSV file should contain columns:
        </p>
        <div className="mt-3 grid grid-cols-2 gap-1 text-[12px]" style={{ color: "var(--fg-secondary)" }}>
          <span>Debtor Name (required)</span>
          <span>Phone Number (required)</span>
          <span>Debtor MC</span>
          <span>Debtor DOT</span>
          <span>Load Number</span>
          <span>Amount</span>
          <span>Email Only</span>
          <span>Timezone</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// METRIC CARD COMPONENT
// ============================================================================

function MetricCard({
  title,
  value,
  subtitle,
  accentColor,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  accentColor?: string;
}) {
  return (
    <div className="linear-metric-card">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
        {title}
      </div>
      <div
        className="font-mono text-[28px] font-semibold tracking-tight"
        style={{ color: accentColor || "var(--fg-primary)" }}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {subtitle && (
        <div className="mt-1 text-[12px]" style={{ color: "var(--fg-muted)" }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CAMPAIGN STATUS BAR COMPONENT
// ============================================================================

function CampaignStatusBar({ campaignStatus, canOperate }: { campaignStatus: CampaignStatus; canOperate: boolean }) {
  const queryClient = useQueryClient();

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/campaign/pause", { method: "POST" });
      if (!res.ok) throw new Error("Failed to pause campaign");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-status"] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/campaign/start", { method: "POST" });
      if (!res.ok) throw new Error("Failed to resume campaign");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-status"] });
    },
  });

  const { state, progress, pending, running, completed, failed } = campaignStatus;

  // Determine status display
  const getStatusDisplay = () => {
    switch (state) {
      case "running":
        return { label: "Running", color: "var(--color-success)", icon: "play", pulsing: true };
      case "paused":
        // Show different label when paused but still has running calls
        if (running > 0) {
          return { label: `Pausing... ${running} finishing`, color: "var(--color-warning)", icon: "pause", pulsing: true };
        }
        return { label: "Paused", color: "var(--color-warning)", icon: "pause", pulsing: false };
      case "complete":
        return { label: "Complete", color: "var(--color-reactivado)", icon: "check", pulsing: false };
      default:
        return { label: "Idle", color: "var(--fg-muted)", icon: "idle", pulsing: false };
    }
  };

  const statusDisplay = getStatusDisplay();
  const isActionDisabled = pauseMutation.isPending || resumeMutation.isPending;

  // Don't show anything if no calls exist (idle state with no work)
  if (state === "idle" && campaignStatus.totalCalls === 0) {
    return null;
  }

  return (
    <div className="linear-card p-4">
      <div className="flex items-center justify-between">
        {/* Left: Status and Progress */}
        <div className="flex items-center gap-6">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <div
              className={`h-2.5 w-2.5 rounded-full ${statusDisplay.pulsing ? "animate-pulse" : ""}`}
              style={{
                background: statusDisplay.color,
                boxShadow: statusDisplay.pulsing ? `0 0 8px ${statusDisplay.color}` : "none",
              }}
            />
            <span className="text-[13px] font-medium" style={{ color: statusDisplay.color }}>
              {statusDisplay.label}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-3">
            <div className="h-2 w-48 overflow-hidden rounded-full" style={{ background: "var(--glass-bg-elevated)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: state === "complete" ? "var(--color-reactivado)" : "var(--accent-primary)",
                }}
              />
            </div>
            <span className="font-mono text-[12px]" style={{ color: "var(--fg-secondary)" }}>
              {progress}%
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-[12px]">
            {running > 0 && (
              <span style={{ color: "var(--color-success)" }}>
                <span className="font-mono font-medium">{running}</span> running
              </span>
            )}
            {pending > 0 && (
              <span style={{ color: "var(--fg-muted)" }}>
                <span className="font-mono font-medium">{pending}</span> pending
              </span>
            )}
            <span style={{ color: "var(--fg-secondary)" }}>
              <span className="font-mono font-medium">{completed}</span> completed
            </span>
            {failed > 0 && (
              <span style={{ color: "var(--color-danger)" }}>
                <span className="font-mono font-medium">{failed}</span> failed
              </span>
            )}
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-2">
          {canOperate && state === "running" && (
            <button
              onClick={() => pauseMutation.mutate()}
              disabled={isActionDisabled}
              className="linear-btn-secondary flex items-center gap-2 px-3 py-1.5 text-[12px]"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              Pause
            </button>
          )}
          {canOperate && state === "paused" && (
            <button
              onClick={() => resumeMutation.mutate()}
              disabled={isActionDisabled}
              className="linear-btn-primary flex items-center gap-2 px-3 py-1.5 text-[12px]"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Resume
            </button>
          )}
          {state === "complete" && (
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-reactivado)" }}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20,6 9,17 4,12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              All calls processed
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DASHBOARD COMPONENT
// ============================================================================

function OutcomeBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[12px]">
        <span style={{ color: "var(--fg-secondary)" }}>{label}</span>
        <span style={{ color: "var(--fg-muted)" }}>
          {count} ({percentage.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--glass-bg-elevated)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percentage}%`, background: color }}
        />
      </div>
    </div>
  );
}

function Dashboard({
  stats,
  campaignStatus,
  campaigns,
  canOperate,
}: {
  stats: DashboardStats;
  campaignStatus: CampaignStatus | null;
  campaigns: CampaignListItem[];
  canOperate: boolean;
}) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const contacted = stats.successfulCalls + stats.connectedCalls;
  const totalWithOutcome =
    stats.successfulCalls + stats.connectedCalls + stats.noContactCalls + stats.unsuccessfulCalls;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-semibold" style={{ color: "var(--fg-primary)" }}>
            Dashboard
          </h1>
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            Overview across all campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/history" className="linear-btn-secondary flex items-center gap-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Call History
          </a>
          {canOperate && (
            <a href="/campaigns/new" className="linear-btn-primary flex items-center gap-2">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              New Campaign
            </a>
          )}
        </div>
      </div>

      {/* Campaign Status Bar */}
      {campaignStatus && <CampaignStatusBar campaignStatus={campaignStatus} canOperate={canOperate} />}

      {/* KPI Cards - Row 1 */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Total Debtors"
          value={stats.callableDebtors}
          subtitle={stats.emailOnlyDebtors > 0 ? `+${stats.emailOnlyDebtors} email-only` : "All callable"}
        />
        <MetricCard
          title="Amount Owed"
          value={formatCurrency(stats.totalAmountOwed)}
          subtitle={`${stats.totalCalls} calls made`}
        />
        <MetricCard
          title="Contact Rate"
          value={formatPercent(stats.contactRate)}
          subtitle={`${contacted} of ${totalWithOutcome} reached`}
          accentColor="var(--color-warning)"
        />
        <MetricCard
          title="Success Rate"
          value={formatPercent(stats.successRate)}
          subtitle={`${stats.successfulCalls} of ${contacted} contacted`}
          accentColor="var(--color-success)"
        />
      </div>

      {/* Category Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="linear-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>Successful</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: "var(--color-success-muted)" }}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "var(--color-success)" }}>
                <polyline points="20,6 9,17 4,12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-[28px] font-semibold tracking-tight" style={{ color: "var(--color-success)" }}>
            {stats.successfulCalls}
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--fg-muted)" }}>Paid / scheduled to Bobtail</p>
        </div>

        <div className="linear-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>Connected</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: "rgba(14, 165, 233, 0.15)" }}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--accent-primary)" }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-[28px] font-semibold tracking-tight" style={{ color: "var(--accent-primary)" }}>
            {stats.connectedCalls}
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--fg-muted)" }}>Reached but not yet successful</p>
        </div>

        <div className="linear-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>No Contact</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: "var(--glass-bg-elevated)" }}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--fg-muted)" }}>
                <path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-[28px] font-semibold tracking-tight" style={{ color: "var(--fg-muted)" }}>
            {stats.noContactCalls}
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--fg-muted)" }}>Voicemail / no answer</p>
        </div>

        <div className="linear-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>Unsuccessful</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: "var(--color-danger-muted)" }}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-danger)" }}>
                <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-[28px] font-semibold tracking-tight" style={{ color: "var(--color-danger)" }}>
            {stats.unsuccessfulCalls}
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--fg-muted)" }}>No transcript / refused AI</p>
        </div>
      </div>

      {/* Bottom Section: Outcomes + Campaigns side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Outcome Breakdown */}
        <div className="linear-card p-5">
          <h3 className="mb-1 text-[14px] font-semibold" style={{ color: "var(--fg-primary)" }}>
            Call Outcomes
          </h3>
          <p className="mb-4 text-[12px]" style={{ color: "var(--fg-muted)" }}>
            Distribution of {totalWithOutcome} calls with outcomes
          </p>
          <div className="space-y-3">
            {stats.outcomeCounts
              .filter((o) => o.outcome !== "PENDING" && o.outcome !== "COMPLETED_UNKNOWN")
              .map((o) => (
                <OutcomeBar
                  key={o.outcome}
                  label={o.outcome}
                  count={o.count}
                  total={totalWithOutcome}
                  color={
                    o.outcome.startsWith("Call Successful")
                      ? "var(--color-success)"
                      : o.outcome.startsWith("Call Connected")
                        ? "var(--accent-primary)"
                        : o.outcome.startsWith("No Contact")
                          ? "var(--fg-muted)"
                          : "var(--color-danger)"
                  }
                />
              ))}
            {totalWithOutcome === 0 && (
              <p className="py-8 text-center text-[13px]" style={{ color: "var(--fg-disabled)" }}>
                No call outcomes yet
              </p>
            )}
          </div>
        </div>

        {/* Recent Campaigns */}
        <div className="linear-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--fg-primary)" }}>
                Campaigns
              </h3>
              <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                {campaigns.length} total
              </p>
            </div>
            <a
              href="/campaigns"
              className="text-[12px] font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--accent-primary)" }}
            >
              View All →
            </a>
          </div>
          <div className="space-y-2">
            {campaigns.slice(0, 6).map((c) => {
              const statusColors: Record<string, string> = {
                ACTIVE: "var(--color-success)",
                PAUSED: "var(--color-warning)",
                COMPLETED: "var(--fg-muted)",
                ARCHIVED: "var(--fg-disabled)",
              };
              return (
                <a
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors"
                  style={{ background: "var(--glass-bg)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--glass-bg-elevated)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--glass-bg)")}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded text-[11px] font-bold"
                      style={{ background: "var(--glass-bg-elevated)", color: "var(--accent-primary)" }}
                    >
                      #{c.campaignNumber}
                    </span>
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: "var(--fg-primary)" }}>{c.name}</p>
                      <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                        {c.totalDebtors} debtors · {formatCurrency(c.totalAmount)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "var(--glass-bg-elevated)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${c.progress}%`,
                            background: statusColors[c.status] ?? "var(--fg-muted)",
                          }}
                        />
                      </div>
                      <span className="font-mono text-[11px]" style={{ color: "var(--fg-muted)" }}>
                        {c.progress}%
                      </span>
                    </div>
                    {c.isActive && (
                      <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--color-success)" }} />
                    )}
                  </div>
                </a>
              );
            })}
            {campaigns.length === 0 && (
              <p className="py-8 text-center text-[13px]" style={{ color: "var(--fg-disabled)" }}>
                No campaigns yet
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  // Check if user can perform operations (ADMIN or OPERATOR)
  const canOperate = session?.user?.role === "ADMIN" || session?.user?.role === "OPERATOR";

  // Fetch campaign status first to determine polling intervals
  const { data: campaignStatus } = useQuery<CampaignStatus>({
    queryKey: ["campaign-status"],
    queryFn: async () => {
      const res = await fetch("/api/campaign/status");
      if (!res.ok) throw new Error("Failed to fetch campaign status");
      return res.json();
    },
    // Only poll when there's active work - no polling when idle
    refetchInterval: (query) => {
      const data = query.state.data as CampaignStatus | undefined;
      const hasActivity = (data?.running ?? 0) > 0 || (data?.pending ?? 0) > 0;
      return hasActivity ? 5000 : false; // 5s when active, no polling when idle
    },
  });

  // Determine if there's active campaign activity
  const hasActiveWork = (campaignStatus?.running ?? 0) > 0 || (campaignStatus?.pending ?? 0) > 0;

  // Fetch aggregate stats across all campaigns
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats/dashboard?scope=all");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: hasActiveWork ? 10000 : false,
  });

  // Fetch campaigns list for the sidebar
  const { data: campaignsData } = useQuery<{ campaigns: CampaignListItem[] }>({
    queryKey: ["dashboard-campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/campaigns?limit=10");
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["campaign-status"] });
  };

  if (statsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--accent-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  // Show upload section if no campaigns exist (only for operators/admins)
  if (!stats || stats.totalDebtors === 0) {
    if (canOperate) {
      return <UploadSection onSuccess={handleUploadSuccess} />;
    }
    // Viewers see a read-only message
    return (
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        <div className="linear-card p-12">
          <svg
            className="mx-auto h-16 w-16 mb-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ color: "var(--fg-muted)" }}
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <h1 className="text-[24px] font-semibold mb-2" style={{ color: "var(--fg-primary)" }}>
            No Campaigns Yet
          </h1>
          <p className="text-[14px]" style={{ color: "var(--fg-muted)" }}>
            There are no active campaigns to view. An operator or admin will need to create a campaign first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Dashboard
      stats={stats}
      campaignStatus={campaignStatus ?? null}
      campaigns={campaignsData?.campaigns ?? []}
      canOperate={canOperate}
    />
  );
}

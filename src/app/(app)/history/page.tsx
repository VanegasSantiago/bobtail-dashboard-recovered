"use client";

import { useState, useCallback, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Call {
  id: string;
  runId: string | null;
  attemptNumber: number;
  status: string;
  callOutcome: string;
  triggeredAt: string | null;
  completedAt: string | null;
  callDuration: number | null;
  callSummary: string | null;
  callTags: string[];
  promisedDate: string | null;
  promisedAmount: number | null;
  debtor: {
    debtorName: string;
    phoneNumber: string;
    debtorEmail: string | null;
    debtorMc: string | null;
    debtorDot: string | null;
    timezone: string | null;
    totalAmount: number;
    numInvoices: number;
  };
}

interface FilterOption {
  value: string | number;
  count: number;
}

interface Filters {
  statuses: FilterOption[];
  outcomes: FilterOption[];
  timezones: FilterOption[];
}

interface Campaign {
  id: string;
  campaignNumber: number;
  name: string;
  totalCalls: number;
}

interface CampaignsResponse {
  campaigns: Campaign[];
}

const HAPPYROBOT_ORG = process.env.NEXT_PUBLIC_HAPPYROBOT_ORG_SLUG;
const HAPPYROBOT_WORKFLOW = process.env.NEXT_PUBLIC_HAPPYROBOT_WORKFLOW_ID;

interface CallsResponse {
  calls: Call[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  campaignId?: string;
  campaignName?: string;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string }> = {
  PENDING: { label: "Pending", bg: "var(--color-warning-muted)", fg: "var(--color-warning)" },
  RUNNING: { label: "Running", bg: "rgba(14, 165, 233, 0.15)", fg: "var(--accent-primary)" },
  COMPLETED: { label: "Completed", bg: "var(--color-success-muted)", fg: "var(--color-success)" },
  FAILED: { label: "Failed", bg: "var(--color-danger-muted)", fg: "var(--color-danger)" },
  CANCELED: { label: "Canceled", bg: "var(--glass-bg-elevated)", fg: "var(--fg-muted)" },
};

const OUTCOME_CONFIG: Record<string, { label: string; bg: string; fg: string }> = {
  PENDING: { label: "Pending", bg: "var(--glass-bg-elevated)", fg: "var(--fg-muted)" },
  PAYMENT_PROMISED: { label: "Promised", bg: "var(--color-success-muted)", fg: "var(--color-success)" },
  DECLINED: { label: "Declined", bg: "var(--color-danger-muted)", fg: "var(--color-danger)" },
  DISPUTED: { label: "Disputed", bg: "var(--color-warning-muted)", fg: "var(--color-warning)" },
  NO_ANSWER: { label: "No Answer", bg: "var(--glass-bg-elevated)", fg: "var(--fg-muted)" },
  VOICEMAIL: { label: "Voicemail", bg: "var(--glass-bg-elevated)", fg: "var(--fg-muted)" },
  WRONG_NUMBER: { label: "Wrong #", bg: "var(--color-danger-muted)", fg: "var(--color-danger)" },
  CALLBACK_REQUESTED: { label: "Callback", bg: "var(--color-warning-muted)", fg: "var(--color-warning)" },
  COMPLETED_UNKNOWN: { label: "Unknown", bg: "var(--glass-bg-elevated)", fg: "var(--fg-muted)" },
};

function StatusPill({ config, label }: { config: { bg: string; fg: string }; label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: config.bg, color: config.fg }}
    >
      {label}
    </span>
  );
}

function FilterBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ background: "var(--interactive-hover)", color: "var(--accent-primary)" }}
    >
      {label}
      <button onClick={onRemove} className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-white/10">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </span>
  );
}

function HistoryPageLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--accent-primary)", borderTopColor: "transparent" }} />
    </div>
  );
}

function HistoryPageContent() {
  const searchParams = useSearchParams();
  const campaignIdFromUrl = searchParams.get("campaignId");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<string>("");
  const [callOutcome, setCallOutcome] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(campaignIdFromUrl ?? "");

  // Fetch campaigns for the dropdown
  const { data: campaignsData } = useQuery<CampaignsResponse>({
    queryKey: ["campaigns-list"],
    queryFn: async () => {
      const res = await fetch("/api/campaigns?limit=100");
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });

  const { data: filters } = useQuery<Filters>({
    queryKey: ["call-filters"],
    queryFn: async () => {
      const res = await fetch("/api/calls/filters");
      if (!res.ok) throw new Error("Failed to fetch filters");
      return res.json();
    },
  });

  // Use URL campaign ID or selected campaign ID
  const activeCampaignId = campaignIdFromUrl ?? selectedCampaignId;

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("pageSize", pageSize.toString());
    if (activeCampaignId) params.set("campaignId", activeCampaignId);
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (callOutcome) params.set("callOutcome", callOutcome);
    if (timezone) params.set("timezone", timezone);
    return params.toString();
  }, [page, pageSize, activeCampaignId, search, status, callOutcome, timezone]);

  const { data, isLoading } = useQuery<CallsResponse>({
    queryKey: ["calls-history", buildQueryParams()],
    queryFn: async () => {
      const res = await fetch(`/api/calls?${buildQueryParams()}`);
      if (!res.ok) throw new Error("Failed to fetch calls");
      return res.json();
    },
    // Only poll when there are running calls - no polling when idle
    refetchInterval: (query) => {
      const data = query.state.data as CallsResponse | undefined;
      const hasRunningCalls = data?.calls?.some(
        (c) => c.status === "RUNNING" || c.status === "QUEUED"
      );
      return hasRunningCalls ? 5000 : false; // 5s when active, no polling when idle
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const clearAllFilters = () => {
    setSearch("");
    setSearchInput("");
    setStatus("");
    setCallOutcome("");
    setTimezone("");
    if (!campaignIdFromUrl) setSelectedCampaignId("");
    setPage(1);
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("pageSize", "10000");
    if (campaignIdFromUrl) params.set("campaignId", campaignIdFromUrl);
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (callOutcome) params.set("callOutcome", callOutcome);
    if (timezone) params.set("timezone", timezone);

    fetch(`/api/calls?${params}`)
      .then((res) => res.json())
      .then((data: CallsResponse) => {
        const headers = ["Debtor Name", "Phone", "Email", "MC", "Amount", "Status", "Outcome", "Date", "Run ID"];
        const rows = data.calls.map((call) => [
          call.debtor.debtorName,
          call.debtor.phoneNumber,
          call.debtor.debtorEmail || "",
          call.debtor.debtorMc || "",
          call.debtor.totalAmount.toString(),
          call.status,
          call.callOutcome || "",
          call.triggeredAt ? format(new Date(call.triggeredAt), "yyyy-MM-dd HH:mm") : "",
          call.runId || "",
        ]);

        const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `call-history-${format(new Date(), "yyyy-MM-dd")}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const activeFiltersCount = [status, callOutcome, timezone, search, !campaignIdFromUrl && selectedCampaignId].filter(Boolean).length;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div className="space-y-5">
      {/* Back link when filtering by campaign */}
      {campaignIdFromUrl && (
        <Link
          href={`/campaigns/${campaignIdFromUrl}`}
          className="inline-flex items-center gap-2 text-[13px] font-medium transition-colors hover:opacity-80"
          style={{ color: "var(--fg-muted)" }}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Campaign
        </Link>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-semibold" style={{ color: "var(--fg-primary)" }}>
            {campaignIdFromUrl && data?.campaignName ? `${data.campaignName} - ` : ""}Call History
          </h1>
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            {data?.total.toLocaleString() ?? 0} call attempts
            {campaignIdFromUrl && " in this campaign"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {campaignIdFromUrl && (
            <Link
              href="/history"
              className="linear-btn-secondary flex items-center gap-2"
            >
              View All Campaigns
            </Link>
          )}
          <button onClick={handleExport} className="linear-btn-secondary flex items-center gap-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="7,10 12,15 17,10" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="linear-card p-4">
        <div className="mb-4 flex items-center gap-3">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--fg-muted)" }}>
            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[14px] font-medium" style={{ color: "var(--fg-primary)" }}>Filters</span>
          {activeFiltersCount > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "var(--interactive-hover)", color: "var(--accent-primary)" }}>
              {activeFiltersCount} active
            </span>
          )}
        </div>

        <form onSubmit={handleSearch} className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--fg-muted)" }}>
              <circle cx="11" cy="11" r="8" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input type="text" placeholder="Search by name, email, phone, MC..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="linear-input pl-10" />
          </div>
          <button type="submit" className="linear-btn-primary">Search</button>
        </form>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {/* Campaign filter - only show if not coming from campaign detail page */}
          {!campaignIdFromUrl && (
            <Select value={selectedCampaignId || "__all__"} onValueChange={(v) => { setSelectedCampaignId(v === "__all__" ? "" : v); setPage(1); }}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Campaign" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Campaigns</SelectItem>
                {campaignsData?.campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>#{c.campaignNumber} {c.name} ({c.totalCalls})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={status || "__all__"} onValueChange={(v) => { setStatus(v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              {filters?.statuses.map((s) => (
                <SelectItem key={String(s.value)} value={String(s.value)}>{STATUS_CONFIG[String(s.value)]?.label ?? s.value} ({s.count})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={callOutcome || "__all__"} onValueChange={(v) => { setCallOutcome(v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Outcome" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Outcomes</SelectItem>
              {filters?.outcomes.map((o) => (
                <SelectItem key={String(o.value)} value={String(o.value)}>{OUTCOME_CONFIG[String(o.value)]?.label ?? o.value} ({o.count})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={timezone || "__all__"} onValueChange={(v) => { setTimezone(v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Timezone" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Timezones</SelectItem>
              {filters?.timezones.map((t) => (
                <SelectItem key={String(t.value)} value={String(t.value)}>{t.value} ({t.count})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {activeFiltersCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>Active:</span>
            {!campaignIdFromUrl && selectedCampaignId && (
              <FilterBadge
                label={`Campaign: ${campaignsData?.campaigns.find(c => c.id === selectedCampaignId)?.name ?? selectedCampaignId}`}
                onRemove={() => setSelectedCampaignId("")}
              />
            )}
            {search && <FilterBadge label={`Search: ${search}`} onRemove={() => { setSearch(""); setSearchInput(""); }} />}
            {status && <FilterBadge label={`Status: ${STATUS_CONFIG[status]?.label ?? status}`} onRemove={() => setStatus("")} />}
            {callOutcome && <FilterBadge label={`Outcome: ${OUTCOME_CONFIG[callOutcome]?.label ?? callOutcome}`} onRemove={() => setCallOutcome("")} />}
            {timezone && <FilterBadge label={`Timezone: ${timezone}`} onRemove={() => setTimezone("")} />}
            <button onClick={clearAllFilters} className="text-[12px] font-medium transition-colors" style={{ color: "var(--color-danger)" }}>Clear all</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="linear-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="linear-table">
            <thead>
              <tr>
                <th>Debtor</th>
                <th>Phone</th>
                <th>Amount</th>
                <th>Status</th>
                <th style={{ minWidth: "320px" }}>Outcome</th>
                <th>Date</th>
                <th>Run</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--fg-muted)" }}>
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--accent-primary)", borderTopColor: "transparent" }} />
                      Loading calls...
                    </div>
                  </td>
                </tr>
              ) : data?.calls.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--fg-muted)" }}>No calls found</td></tr>
              ) : (
                data?.calls.map((call) => {
                  const statusConfig = STATUS_CONFIG[call.status] ?? STATUS_CONFIG.PENDING;

                  return (
                    <tr key={call.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td>
                        <div>
                          <span className="text-[13px] font-medium" style={{ color: "var(--fg-primary)" }}>{call.debtor.debtorName}</span>
                          {call.debtor.debtorEmail && <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>{call.debtor.debtorEmail}</p>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap font-mono text-[11px]" style={{ color: "var(--fg-secondary)" }}>{call.debtor.phoneNumber}</td>
                      <td className="whitespace-nowrap font-mono text-[12px]" style={{ color: "var(--color-success)" }}>{formatCurrency(call.debtor.totalAmount)}</td>
                      <td><StatusPill config={statusConfig} label={statusConfig.label} /></td>
                      <td>
                        <span className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>
                          {call.callOutcome || "-"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-[11px]" style={{ color: "var(--fg-muted)" }}>
                        {call.triggeredAt ? format(new Date(call.triggeredAt), "MMM d, HH:mm") : "-"}
                      </td>
                      <td>
                        {call.runId ? (
                          <a href={`https://v2.platform.happyrobot.ai/${HAPPYROBOT_ORG}/workflow/${HAPPYROBOT_WORKFLOW}/runs?run_id=${call.runId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-[10px] transition-colors" style={{ color: "var(--accent-primary)" }}>
                            {call.runId.slice(0, 8)}
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M17 7H7M17 7V17" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </a>
                        ) : (
                          <span className="text-[10px]" style={{ color: "var(--fg-disabled)" }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 0 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--fg-muted)" }}>
              <span>Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, data.total)} of {data.total.toLocaleString()}</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-7 w-[65px] text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
              <span>per page</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="flex h-7 items-center gap-1 rounded px-2 text-[12px] font-medium transition-colors disabled:opacity-40" style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="15,18 9,12 15,6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Previous
              </button>
              <span className="flex h-7 items-center px-3 text-[12px]" style={{ color: "var(--fg-secondary)" }}>Page {page} of {data.totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="flex h-7 items-center gap-1 rounded px-2 text-[12px] font-medium transition-colors disabled:opacity-40" style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}>
                Next
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9,18 15,12 9,6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<HistoryPageLoading />}>
      <HistoryPageContent />
    </Suspense>
  );
}

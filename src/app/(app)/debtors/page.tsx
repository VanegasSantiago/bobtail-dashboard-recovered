"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Debtor {
  id: string;
  debtorName: string;
  debtorMc: string | null;
  debtorDot: string | null;
  phoneNumber: string;
  debtorEmail: string | null;
  timezone: string | null;
  totalAmount: number;
  numInvoices: number;
  emailOnly: boolean;
  callStatus: string;
  attemptNumber: number;
  callOutcome: string | null;
  promisedDate: string | null;
  promisedAmount: number | null;
  lastCallAt: string | null;
}

interface FilterOption {
  value: string | number | boolean;
  count: number;
}

interface Filters {
  timezones: FilterOption[];
  callStatuses: FilterOption[];
  outcomes: FilterOption[];
  emailOnly: FilterOption[];
}

interface DebtorsResponse {
  data: Debtor[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const CALL_STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string }> = {
  NOT_CALLED: { label: "Not Called", bg: "var(--glass-bg-elevated)", fg: "var(--fg-muted)" },
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
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-white/10"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </span>
  );
}

export default function DebtorsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [timezone, setTimezone] = useState<string>("");
  const [callStatus, setCallStatus] = useState<string>("");
  const [callOutcome, setCallOutcome] = useState<string>("");
  const [emailOnly, setEmailOnly] = useState<string>("");

  const { data: filters } = useQuery<Filters>({
    queryKey: ["debtor-filters"],
    queryFn: async () => {
      const res = await fetch("/api/debtors/filters");
      if (!res.ok) throw new Error("Failed to fetch filters");
      return res.json();
    },
  });

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", limit.toString());
    if (search) params.set("search", search);
    if (timezone) params.set("timezone", timezone);
    if (callStatus) params.set("callStatus", callStatus);
    if (callOutcome) params.set("callOutcome", callOutcome);
    if (emailOnly) params.set("emailOnly", emailOnly);
    return params.toString();
  }, [page, limit, search, timezone, callStatus, callOutcome, emailOnly]);

  const { data: debtorsResponse, isLoading } = useQuery<DebtorsResponse>({
    queryKey: ["debtors", buildQueryParams()],
    queryFn: async () => {
      const res = await fetch(`/api/debtors?${buildQueryParams()}`);
      if (!res.ok) throw new Error("Failed to fetch debtors");
      return res.json();
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
    setTimezone("");
    setCallStatus("");
    setCallOutcome("");
    setEmailOnly("");
    setPage(1);
  };

  const activeFiltersCount = [timezone, callStatus, callOutcome, emailOnly, search].filter(Boolean).length;

  const debtors = debtorsResponse?.data ?? [];
  const pagination = debtorsResponse?.pagination ?? { page: 1, limit: 50, total: 0, totalPages: 0 };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-semibold" style={{ color: "var(--fg-primary)" }}>
            Debtors
          </h1>
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            {pagination.total.toLocaleString()} debtors total
          </p>
        </div>
        <button className="linear-btn-secondary flex items-center gap-2">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="7,10 12,15 17,10" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Export
        </button>
      </div>

      {/* Filters Card */}
      <div className="linear-card p-4">
        <div className="mb-4 flex items-center gap-3">
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ color: "var(--fg-muted)" }}
          >
            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[14px] font-medium" style={{ color: "var(--fg-primary)" }}>Filters</span>
          {activeFiltersCount > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: "var(--interactive-hover)", color: "var(--accent-primary)" }}
            >
              {activeFiltersCount} active
            </span>
          )}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ color: "var(--fg-muted)" }}
            >
              <circle cx="11" cy="11" r="8" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, email, phone, MC, DOT..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="linear-input pl-10"
            />
          </div>
          <button type="submit" className="linear-btn-primary">
            Search
          </button>
        </form>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select value={callStatus || "__all__"} onValueChange={(v) => { setCallStatus(v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-9 text-[13px]">
              <SelectValue placeholder="Call Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              {filters?.callStatuses.map((s) => (
                <SelectItem key={String(s.value)} value={String(s.value)}>
                  {CALL_STATUS_CONFIG[String(s.value)]?.label ?? s.value} ({s.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={callOutcome || "__all__"} onValueChange={(v) => { setCallOutcome(v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-9 text-[13px]">
              <SelectValue placeholder="Outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Outcomes</SelectItem>
              {filters?.outcomes.map((o) => (
                <SelectItem key={String(o.value)} value={String(o.value)}>
                  {OUTCOME_CONFIG[String(o.value)]?.label ?? o.value} ({o.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={timezone || "__all__"} onValueChange={(v) => { setTimezone(v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-9 text-[13px]">
              <SelectValue placeholder="Timezone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Timezones</SelectItem>
              {filters?.timezones.map((t) => (
                <SelectItem key={String(t.value)} value={String(t.value)}>
                  {t.value} ({t.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={emailOnly || "__all__"} onValueChange={(v) => { setEmailOnly(v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-9 text-[13px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Types</SelectItem>
              <SelectItem value="false">Callable</SelectItem>
              <SelectItem value="true">Email Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Active Filters */}
        {activeFiltersCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>Active:</span>
            {search && <FilterBadge label={`Search: ${search}`} onRemove={() => { setSearch(""); setSearchInput(""); }} />}
            {timezone && <FilterBadge label={`Timezone: ${timezone}`} onRemove={() => setTimezone("")} />}
            {callStatus && <FilterBadge label={`Status: ${CALL_STATUS_CONFIG[callStatus]?.label ?? callStatus}`} onRemove={() => setCallStatus("")} />}
            {callOutcome && <FilterBadge label={`Outcome: ${OUTCOME_CONFIG[callOutcome]?.label ?? callOutcome}`} onRemove={() => setCallOutcome("")} />}
            {emailOnly && <FilterBadge label={emailOnly === "true" ? "Email Only" : "Callable"} onRemove={() => setEmailOnly("")} />}
            <button
              onClick={clearAllFilters}
              className="text-[12px] font-medium transition-colors"
              style={{ color: "var(--color-danger)" }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="linear-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="linear-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Debtor Name</th>
                <th>MC / DOT</th>
                <th>Phone</th>
                <th>Timezone</th>
                <th>Invoices</th>
                <th>Amount</th>
                <th>Attempts</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center" style={{ color: "var(--fg-muted)" }}>
                    <div className="flex items-center justify-center gap-2">
                      <div
                        className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                        style={{ borderColor: "var(--accent-primary)", borderTopColor: "transparent" }}
                      />
                      Loading debtors...
                    </div>
                  </td>
                </tr>
              ) : debtors.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center" style={{ color: "var(--fg-muted)" }}>
                    No debtors found matching your filters
                  </td>
                </tr>
              ) : (
                debtors.map((debtor) => {
                  const statusConfig = CALL_STATUS_CONFIG[debtor.callStatus] ?? CALL_STATUS_CONFIG.NOT_CALLED;
                  const outcomeConfig = debtor.callOutcome ? OUTCOME_CONFIG[debtor.callOutcome] : null;

                  return (
                    <tr key={debtor.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td className="text-[12px]">
                        <StatusPill config={statusConfig} label={statusConfig.label} />
                      </td>
                      <td>
                        <div>
                          <p className="text-[13px] font-medium" style={{ color: "var(--fg-primary)" }}>
                            {debtor.debtorName}
                          </p>
                          {debtor.debtorEmail && (
                            <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>{debtor.debtorEmail}</p>
                          )}
                          {debtor.emailOnly && (
                            <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: "var(--color-warning-muted)", color: "var(--color-warning)" }}>
                              Email Only
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-[11px]" style={{ color: "var(--fg-secondary)" }}>
                        {debtor.debtorMc && <div>MC: {debtor.debtorMc}</div>}
                        {debtor.debtorDot && <div>DOT: {debtor.debtorDot}</div>}
                      </td>
                      <td className="whitespace-nowrap font-mono text-[11px]" style={{ color: "var(--fg-secondary)" }}>
                        {debtor.phoneNumber}
                      </td>
                      <td className="whitespace-nowrap text-[12px]" style={{ color: "var(--fg-secondary)" }}>
                        {debtor.timezone}
                      </td>
                      <td className="text-center text-[12px]" style={{ color: "var(--fg-secondary)" }}>
                        {debtor.numInvoices}
                      </td>
                      <td className="whitespace-nowrap font-mono text-[12px] font-medium" style={{ color: "var(--color-success)" }}>
                        {formatCurrency(debtor.totalAmount)}
                      </td>
                      <td className="text-center">
                        {debtor.attemptNumber > 0 ? (
                          <span
                            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: "var(--glass-bg-elevated)", color: "var(--fg-secondary)" }}
                          >
                            {debtor.attemptNumber}
                          </span>
                        ) : (
                          <span style={{ color: "var(--fg-disabled)" }}>-</span>
                        )}
                      </td>
                      <td className="text-[12px]">
                        {outcomeConfig ? (
                          <StatusPill config={outcomeConfig} label={outcomeConfig.label} />
                        ) : (
                          <span style={{ color: "var(--fg-disabled)" }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--fg-muted)" }}>
            <span>
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{" "}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
              {pagination.total.toLocaleString()} debtors
            </span>
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-7 w-[65px] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
            <span>per page</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-40"
              style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="11,17 6,12 11,7" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="18,17 13,12 18,7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-40"
              style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="15,18 9,12 15,6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="px-3 text-[12px]" style={{ color: "var(--fg-secondary)" }}>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= pagination.totalPages}
              className="flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-40"
              style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="9,18 15,12 9,6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => setPage(pagination.totalPages)}
              disabled={page >= pagination.totalPages}
              className="flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-40"
              style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="13,17 18,12 13,7" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="6,17 11,12 6,7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

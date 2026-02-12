"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";

interface Campaign {
  id: string;
  campaignNumber: number;
  name: string;
  sourceFile: string;
  status: string;
  isActive: boolean;
  isQueuePaused: boolean;
  totalDebtors: number;
  totalInvoices: number;
  totalAmount: number;
  maxConcurrent: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  // Enriched stats
  totalCalls: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  progress: number;
}

interface CampaignsResponse {
  campaigns: Campaign[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string }> = {
  ACTIVE: { label: "Active", bg: "var(--color-success-muted)", fg: "var(--color-success)" },
  PAUSED: { label: "Paused", bg: "var(--color-warning-muted)", fg: "var(--color-warning)" },
  COMPLETED: { label: "Completed", bg: "var(--glass-bg-elevated)", fg: "var(--fg-muted)" },
  ARCHIVED: { label: "Archived", bg: "var(--glass-bg-elevated)", fg: "var(--fg-disabled)" },
};

function StatusPill({ status, isActive }: { status: string; isActive: boolean }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.ACTIVE;
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
        style={{ background: config.bg, color: config.fg }}
      >
        {config.label}
      </span>
      {isActive && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--accent-primary)", color: "white" }}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Current
        </span>
      )}
    </div>
  );
}

function ProgressBar({ progress, completed, total }: { progress: number; completed: number; total: number }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--fg-muted)" }}>
        <span>{progress}% complete</span>
        <span>{completed}/{total} calls</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--glass-bg-elevated)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${progress}%`, background: "var(--accent-primary)" }}
        />
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  // Check if user can perform operations (ADMIN or OPERATOR)
  const canOperate = session?.user?.role === "ADMIN" || session?.user?.role === "OPERATOR";

  const { data, isLoading } = useQuery<CampaignsResponse>({
    queryKey: ["campaigns", page, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/campaigns?${params}`);
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await fetch(`/api/campaigns/${campaignId}?action=activate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to activate campaign");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-status"] });
    },
    onError: () => {
      toast.error("Failed to activate campaign");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await fetch(`/api/campaigns/${campaignId}?action=archive`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to archive campaign");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete campaign");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const campaigns = data?.campaigns ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 };

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
            Campaigns
          </h1>
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            {pagination.total} campaigns total
          </p>
        </div>
        {canOperate && (
          <Link
            href="/campaigns/new"
            className="linear-btn-primary flex items-center gap-2"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            New Campaign
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setStatusFilter("")}
          className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
            !statusFilter ? "text-white" : ""
          }`}
          style={{
            background: !statusFilter ? "var(--accent-primary)" : "var(--glass-bg)",
            color: !statusFilter ? "white" : "var(--fg-secondary)",
          }}
        >
          All
        </button>
        {["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors`}
            style={{
              background: statusFilter === status ? "var(--accent-primary)" : "var(--glass-bg)",
              color: statusFilter === status ? "white" : "var(--fg-secondary)",
            }}
          >
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Campaigns List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="linear-card flex items-center justify-center p-12">
            <div className="flex items-center gap-2" style={{ color: "var(--fg-muted)" }}>
              <div
                className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: "var(--accent-primary)", borderTopColor: "transparent" }}
              />
              Loading campaigns...
            </div>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="linear-card flex flex-col items-center justify-center p-12 text-center">
            <svg
              className="mb-3 h-12 w-12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              style={{ color: "var(--fg-disabled)" }}
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <p className="text-[14px]" style={{ color: "var(--fg-muted)" }}>
              No campaigns found
            </p>
            <p className="mb-4 text-[12px]" style={{ color: "var(--fg-disabled)" }}>
              {canOperate ? "Upload a CSV file to create your first campaign" : "No campaigns have been created yet"}
            </p>
            {canOperate && (
              <Link href="/campaigns/new" className="linear-btn-primary">
                Create Your First Campaign
              </Link>
            )}
          </div>
        ) : (
          campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="linear-card p-4 transition-all hover:border-[var(--border-primary)]"
              style={{ borderColor: campaign.isActive ? "var(--accent-primary)" : undefined }}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: Campaign Info - Clickable */}
                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="flex-1 space-y-3 rounded-lg transition-opacity hover:opacity-80"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-bold"
                      style={{ background: "var(--glass-bg-elevated)", color: "var(--accent-primary)" }}
                    >
                      #{campaign.campaignNumber}
                    </span>
                    <div>
                      <h3 className="text-[15px] font-semibold" style={{ color: "var(--fg-primary)" }}>
                        {campaign.name}
                      </h3>
                      <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                        {campaign.sourceFile} · Created {formatDistanceToNow(new Date(campaign.createdAt))} ago
                      </p>
                    </div>
                    {/* Click indicator */}
                    <svg
                      className="ml-auto h-4 w-4 opacity-40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* Stats Row */}
                  <div className="flex flex-wrap items-center gap-4 text-[12px]">
                    <div>
                      <span style={{ color: "var(--fg-muted)" }}>Debtors: </span>
                      <span style={{ color: "var(--fg-primary)" }}>{campaign.totalDebtors.toLocaleString()}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--fg-muted)" }}>Invoices: </span>
                      <span style={{ color: "var(--fg-primary)" }}>{campaign.totalInvoices.toLocaleString()}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--fg-muted)" }}>Amount: </span>
                      <span style={{ color: "var(--color-success)" }}>{formatCurrency(campaign.totalAmount)}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--fg-muted)" }}>Calls: </span>
                      <span style={{ color: "var(--fg-primary)" }}>{campaign.totalCalls.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {campaign.totalCalls > 0 && (
                    <div className="max-w-md">
                      <ProgressBar
                        progress={campaign.progress}
                        completed={campaign.completed + campaign.failed}
                        total={campaign.totalCalls}
                      />
                    </div>
                  )}
                </Link>

                {/* Right: Status & Actions - Not clickable */}
                <div className="flex flex-col items-end gap-3">
                  <StatusPill status={campaign.status} isActive={campaign.isActive} />

                  {canOperate && (
                    <div className="flex items-center gap-2">
                      {!campaign.isActive && campaign.status !== "ARCHIVED" && (
                        <button
                          onClick={() => activateMutation.mutate(campaign.id)}
                          disabled={activateMutation.isPending}
                          className="rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors"
                          style={{ background: "var(--color-success-muted)", color: "var(--color-success)" }}
                        >
                          {activateMutation.isPending ? "Activating..." : "Activate"}
                        </button>
                      )}

                      {!campaign.isActive && campaign.status !== "ARCHIVED" && (
                        <button
                          onClick={() => archiveMutation.mutate(campaign.id)}
                          disabled={archiveMutation.isPending}
                          className="rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors"
                          style={{ background: "var(--glass-bg)", color: "var(--fg-muted)" }}
                        >
                          Archive
                        </button>
                      )}

                      {!campaign.isActive && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)) {
                              deleteMutation.mutate(campaign.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors"
                          style={{ background: "var(--color-danger-muted)", color: "var(--color-danger)" }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="flex h-8 items-center justify-center rounded-lg px-3 text-[12px] font-medium transition-colors disabled:opacity-40"
            style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}
          >
            Previous
          </button>
          <span className="px-3 text-[12px]" style={{ color: "var(--fg-muted)" }}>
            Page {page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= pagination.totalPages}
            className="flex h-8 items-center justify-center rounded-lg px-3 text-[12px] font-medium transition-colors disabled:opacity-40"
            style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

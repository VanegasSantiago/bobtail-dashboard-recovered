"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import Link from "next/link";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

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
  completedAt: string | null;
  startedAt: string | null;
}

interface DashboardStats {
  campaignId: string;
  campaignName: string;
  campaignNumber: number;
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

interface RecentCall {
  id: string;
  debtorName: string;
  phoneNumber: string;
  amount: number;
  status: string;
  callOutcome: string;
  completedAt: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function BackButton() {
  return (
    <Link
      href="/campaigns"
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
      Back to Campaigns
    </Link>
  );
}

function StatusBadge({ status, isActive }: { status: string; isActive: boolean }) {
  const statusStyles: Record<string, { bg: string; fg: string }> = {
    ACTIVE: { bg: "var(--color-success-muted)", fg: "var(--color-success)" },
    PAUSED: { bg: "var(--color-warning-muted)", fg: "var(--color-warning)" },
    COMPLETED: { bg: "var(--glass-bg-elevated)", fg: "var(--fg-muted)" },
    ARCHIVED: { bg: "var(--glass-bg-elevated)", fg: "var(--fg-disabled)" },
  };
  const style = statusStyles[status] ?? statusStyles.ACTIVE;

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium"
        style={{ background: style.bg, color: style.fg }}
      >
        {status.charAt(0) + status.slice(1).toLowerCase()}
      </span>
      {isActive && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{ background: "var(--accent-primary)", color: "white" }}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Current
        </span>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  valueColor,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  valueColor?: string;
}) {
  return (
    <div className="linear-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
        {label}
      </p>
      <p
        className="mt-1 text-[28px] font-semibold tracking-tight"
        style={{ color: valueColor ?? "var(--fg-primary)" }}
      >
        {value}
      </p>
      {subtext && (
        <p className="mt-0.5 text-[12px]" style={{ color: "var(--fg-muted)" }}>
          {subtext}
        </p>
      )}
    </div>
  );
}

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

function LoadingState() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex items-center gap-3" style={{ color: "var(--fg-muted)" }}>
        <div
          className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: "var(--accent-primary)", borderTopColor: "transparent" }}
        />
        Loading campaign details...
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: "var(--color-danger-muted)" }}
      >
        <svg
          className="h-8 w-8"
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
      </div>
      <p className="text-[14px]" style={{ color: "var(--fg-muted)" }}>
        {message}
      </p>
      <Link
        href="/campaigns"
        className="rounded-lg px-4 py-2 text-[13px] font-medium transition-colors"
        style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}
      >
        Back to Campaigns
      </Link>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;

  // Fetch campaign details
  const { data: campaign, isLoading: campaignLoading, error: campaignError } = useQuery<Campaign>({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Campaign not found");
        throw new Error("Failed to fetch campaign");
      }
      return res.json();
    },
  });

  // Fetch campaign statistics
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["campaign-stats", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/stats/dashboard?campaignId=${campaignId}`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!campaign,
  });

  // Fetch recent calls for this campaign
  const { data: recentCalls } = useQuery<RecentCall[]>({
    queryKey: ["campaign-recent-calls", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/calls?limit=10`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.calls ?? [];
    },
    enabled: !!campaign,
  });

  // Loading state
  if (campaignLoading || statsLoading) {
    return (
      <div className="space-y-5">
        <BackButton />
        <LoadingState />
      </div>
    );
  }

  // Error state
  if (campaignError || !campaign) {
    return (
      <div className="space-y-5">
        <BackButton />
        <ErrorState message={campaignError?.message ?? "Campaign not found"} />
      </div>
    );
  }

  // Format helpers
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const contacted = stats ? stats.successfulCalls + stats.connectedCalls : 0;
  const totalWithOutcome = stats
    ? stats.successfulCalls + stats.connectedCalls + stats.noContactCalls + stats.unsuccessfulCalls
    : 0;

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <BackButton />

      {/* Campaign Header */}
      <div className="linear-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[14px] font-bold"
                style={{ background: "var(--glass-bg-elevated)", color: "var(--accent-primary)" }}
              >
                #{campaign.campaignNumber}
              </span>
              <div>
                <h1 className="text-[22px] font-semibold" style={{ color: "var(--fg-primary)" }}>
                  {campaign.name}
                </h1>
                <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                  Source: {campaign.sourceFile}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-[12px]" style={{ color: "var(--fg-muted)" }}>
              <span>Created {formatDistanceToNow(new Date(campaign.createdAt))} ago</span>
              {campaign.startedAt && (
                <span>Started {format(new Date(campaign.startedAt), "MMM d, yyyy h:mm a")}</span>
              )}
              {campaign.completedAt && (
                <span>Completed {format(new Date(campaign.completedAt), "MMM d, yyyy h:mm a")}</span>
              )}
            </div>
          </div>
          <StatusBadge status={campaign.status} isActive={campaign.isActive} />
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Debtors"
          value={stats?.totalDebtors.toLocaleString() ?? 0}
          subtext={`${stats?.callableDebtors ?? 0} callable`}
        />
        <StatCard
          label="Amount Owed"
          value={formatCurrency(stats?.totalAmountOwed ?? 0)}
          subtext={`${stats?.totalCalls ?? 0} calls made`}
        />
        <StatCard
          label="Contact Rate"
          value={formatPercent(stats?.contactRate ?? 0)}
          subtext={`${contacted} contacted`}
          valueColor="var(--color-warning)"
        />
        <StatCard
          label="Success Rate"
          value={formatPercent(stats?.successRate ?? 0)}
          subtext={`${stats?.successfulCalls ?? 0} successful of ${contacted} contacted`}
          valueColor="var(--color-success)"
        />
      </div>

      {/* Category Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Successful"
          value={stats?.successfulCalls ?? 0}
          subtext="Paid / scheduled to Bobtail"
          valueColor="var(--color-success)"
        />
        <StatCard
          label="Connected"
          value={stats?.connectedCalls ?? 0}
          subtext="Reached but not successful"
          valueColor="var(--accent-primary)"
        />
        <StatCard
          label="No Contact"
          value={stats?.noContactCalls ?? 0}
          subtext="Voicemail / no answer"
          valueColor="var(--fg-muted)"
        />
        <StatCard
          label="Unsuccessful"
          value={stats?.unsuccessfulCalls ?? 0}
          subtext="No transcript / refused AI"
          valueColor="var(--color-danger)"
        />
      </div>

      {/* Outcome Breakdown */}
      <div className="linear-card p-5">
        <h3 className="mb-4 text-[14px] font-semibold" style={{ color: "var(--fg-primary)" }}>
          Call Outcomes
        </h3>
        <p className="mb-4 text-[12px]" style={{ color: "var(--fg-muted)" }}>
          Distribution of {totalWithOutcome} calls with outcomes
        </p>
        <div className="space-y-3">
          {stats?.outcomeCounts
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
        </div>
      </div>

      {/* Recent Calls */}
      {recentCalls && recentCalls.length > 0 && (
        <div className="linear-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--fg-primary)" }}>
              Recent Calls
            </h3>
            <Link
              href={`/history?campaignId=${campaignId}`}
              className="text-[12px] font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--accent-primary)" }}
            >
              View All →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ color: "var(--fg-muted)" }}>
                  <th className="px-3 pb-3 text-left font-medium">Debtor</th>
                  <th className="px-3 pb-3 text-left font-medium">Phone</th>
                  <th className="px-3 pb-3 text-right font-medium">Amount</th>
                  <th className="px-3 pb-3 text-left font-medium" style={{ minWidth: "320px" }}>Outcome</th>
                  <th className="px-3 pb-3 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((call) => (
                  <tr key={call.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <td className="px-3 py-3" style={{ color: "var(--fg-primary)" }}>
                      {call.debtorName}
                    </td>
                    <td className="px-3 py-3" style={{ color: "var(--fg-muted)" }}>
                      {call.phoneNumber}
                    </td>
                    <td className="px-3 py-3 text-right" style={{ color: "var(--color-success)" }}>
                      {formatCurrency(call.amount)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>
                        {call.callOutcome || "-"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right" style={{ color: "var(--fg-muted)" }}>
                      {call.completedAt ? format(new Date(call.completedAt), "MMM d, HH:mm") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


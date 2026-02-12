"use client";

import { useQuery } from "@tanstack/react-query";

interface ActiveCall {
  id: string;
  runId: string | null;
  status: string;
  debtor: {
    debtorName: string;
    phoneNumber: string;
    timezone: string | null;
    totalAmount: number;
    numInvoices: number;
  };
  attemptNumber: number;
  triggeredAt: string | null;
}

const MAX_SLOTS = 25;
const HAPPYROBOT_ORG = process.env.NEXT_PUBLIC_HAPPYROBOT_ORG_SLUG;
const HAPPYROBOT_WORKFLOW = process.env.NEXT_PUBLIC_HAPPYROBOT_WORKFLOW_ID;

function CallSlot({ call, index }: { call?: ActiveCall; index: number }) {
  if (!call) {
    return (
      <div
        className="group relative flex h-[90px] items-center justify-center rounded border border-dashed transition-colors"
        style={{
          borderColor: "var(--border-subtle)",
          background: "transparent",
        }}
      >
        <span className="text-[9px] font-medium" style={{ color: "var(--fg-disabled)" }}>
          {index + 1}
        </span>
      </div>
    );
  }

  const duration = call.triggeredAt
    ? Math.floor((Date.now() - new Date(call.triggeredAt).getTime()) / 1000)
    : 0;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const runUrl = call.runId
    ? `https://v2.platform.happyrobot.ai/${HAPPYROBOT_ORG}/workflow/${HAPPYROBOT_WORKFLOW}/runs?run_id=${call.runId}`
    : null;

  const content = (
    <>
      {/* Animated pulse ring */}
      <div className="absolute right-1 top-1">
        <span className="relative flex h-1.5 w-1.5">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ background: "var(--color-success)" }}
          />
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-success)" }}
          />
        </span>
      </div>

      {/* Content */}
      <div className="flex h-full flex-col justify-between">
        <div>
          <p
            className="text-[10px] font-medium leading-tight line-clamp-2 pr-3"
            style={{ color: "var(--fg-primary)" }}
            title={call.debtor.debtorName}
          >
            {call.debtor.debtorName}
          </p>
          <p className="mt-0.5 text-[8px]" style={{ color: "var(--color-success)" }}>
            {formatCurrency(call.debtor.totalAmount)}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span
            className="font-mono text-[9px] font-semibold tabular-nums"
            style={{ color: "var(--color-success)" }}
          >
            {formatDuration(duration)}
          </span>
          {call.attemptNumber > 1 && (
            <span
              className="text-[8px] font-medium"
              style={{ color: "var(--color-warning)" }}
            >
              #{call.attemptNumber}
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (runUrl) {
    return (
      <a
        href={runUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block h-[90px] overflow-hidden rounded p-2 transition-all hover:scale-[1.02]"
        style={{
          background: "var(--color-success-muted)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
        }}
      >
        {content}
      </a>
    );
  }

  return (
    <div
      className="group relative h-[90px] overflow-hidden rounded p-2 transition-all"
      style={{
        background: "var(--color-success-muted)",
        border: "1px solid rgba(16, 185, 129, 0.3)",
      }}
    >
      {content}
    </div>
  );
}

function StatsHeader({ activeCount }: { activeCount: number }) {
  const percentage = (activeCount / MAX_SLOTS) * 100;

  const getStatusColor = () => {
    if (activeCount >= MAX_SLOTS) return "var(--color-danger)";
    if (activeCount >= 20) return "var(--color-warning)";
    return "var(--color-success)";
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--fg-primary)" }}>
          Active Calls
        </h1>
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-[18px] font-bold"
            style={{ color: getStatusColor() }}
          >
            {activeCount}
          </span>
          <span className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            / {MAX_SLOTS}
          </span>
          <div
            className="ml-2 h-2 w-32 overflow-hidden rounded-full"
            style={{ background: "var(--bg-hover)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${percentage}%`, background: getStatusColor() }}
            />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--fg-muted)" }}>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "var(--color-success)" }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--color-success)" }} />
          </span>
          <span>Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded border border-dashed" style={{ borderColor: "var(--border-subtle)" }} />
          <span>Available</span>
        </div>
      </div>
    </div>
  );
}

export default function ActiveCallsPage() {
  const { data: calls, isLoading } = useQuery<ActiveCall[]>({
    queryKey: ["active-calls"],
    queryFn: async () => {
      const res = await fetch("/api/calls/active");
      if (!res.ok) throw new Error("Failed to fetch active calls");
      return res.json();
    },
    // Only poll when there are active calls - no polling when idle
    refetchInterval: (query) => {
      const data = query.state.data as ActiveCall[] | undefined;
      const hasActiveCalls = data && data.length > 0;
      return hasActiveCalls ? 2000 : false; // 2s when active, no polling when idle
    },
  });

  const activeCount = calls?.length ?? 0;
  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => calls?.[i]);

  return (
    <div className="space-y-4">
      <StatsHeader activeCount={activeCount} />

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="flex items-center gap-3">
            <div
              className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "var(--accent-primary)", borderTopColor: "transparent" }}
            />
            <span style={{ color: "var(--fg-muted)" }}>Loading active calls...</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-1.5">
          {slots.map((call, index) => (
            <CallSlot key={call?.id ?? index} call={call} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}

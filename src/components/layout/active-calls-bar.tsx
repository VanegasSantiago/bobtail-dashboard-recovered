"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

const MAX_CONCURRENT = parseInt(process.env.NEXT_PUBLIC_MAX_CONCURRENT_CALLS ?? "25", 10);

export function ActiveCallsBar() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  // Check if user can perform operations (ADMIN or OPERATOR)
  const canOperate = session?.user?.role === "ADMIN" || session?.user?.role === "OPERATOR";

  const { data: stats } = useQuery({
    queryKey: ["active-calls-stats"],
    queryFn: async () => {
      const res = await fetch("/api/calls/active/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    // Only poll when there are active/queued calls - no polling when idle
    refetchInterval: (query) => {
      const data = query.state.data as { running?: number; queued?: number } | undefined;
      const hasActivity = (data?.running ?? 0) > 0 || (data?.queued ?? 0) > 0;
      return hasActivity ? 3000 : false; // 3s when active, no polling when idle
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/campaign/pause", { method: "POST" });
      if (!res.ok) throw new Error("Failed to pause");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-calls-stats"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-status"] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/campaign/start", { method: "POST" });
      if (!res.ok) throw new Error("Failed to resume");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-calls-stats"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-status"] });
    },
  });

  const running = stats?.running ?? 0;
  const queued = stats?.queued ?? 0;
  const isPaused = stats?.isPaused ?? false;
  const percentage = (running / MAX_CONCURRENT) * 100;
  const isActionPending = pauseMutation.isPending || resumeMutation.isPending;

  const getStatusColor = () => {
    if (running >= MAX_CONCURRENT) return "#ef4444";
    if (running >= 40) return "#f59e0b";
    return "#10b981";
  };

  // Show "Pausing..." when paused but still has running calls
  const getPauseStatusLabel = () => {
    if (isPaused && running > 0) {
      return `Pausing... (${running} finishing)`;
    }
    return isPaused ? "Paused" : null;
  };

  const pauseStatusLabel = getPauseStatusLabel();

  return (
    <div
      className="flex h-12 items-center justify-between border-b px-6"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-8">
        {/* Active Calls Counter */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center gap-2">
            {running > 0 && (
              <span className="relative flex h-2 w-2">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ background: getStatusColor() }}
                />
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ background: getStatusColor() }}
                />
              </span>
            )}
            <span
              className="text-[13px] font-medium"
              style={{ color: "var(--fg-secondary)" }}
            >
              Active:
            </span>
            <span
              className="font-mono text-[14px] font-semibold"
              style={{ color: getStatusColor() }}
            >
              {running}
            </span>
            <span
              className="text-[13px]"
              style={{ color: "var(--fg-muted)" }}
            >
              / {MAX_CONCURRENT}
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="h-1.5 w-24 overflow-hidden rounded-full"
            style={{ background: "var(--bg-hover)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${percentage}%`,
                background: getStatusColor(),
              }}
            />
          </div>
        </div>

        {/* Queue Counter */}
        <div className="flex items-center gap-2">
          <span
            className="text-[13px]"
            style={{ color: "var(--fg-muted)" }}
          >
            Queue:
          </span>
          <span
            className="font-mono text-[14px] font-medium"
            style={{ color: "var(--fg-primary)" }}
          >
            {queued}
          </span>
        </div>
      </div>

      {/* Pause Status Label (when pausing with calls still running) */}
      {pauseStatusLabel && (
        <span
          className="text-[12px] font-medium"
          style={{ color: "var(--color-warning)" }}
        >
          {pauseStatusLabel}
        </span>
      )}

      {/* Pause/Resume Button - only show for operators/admins */}
      {canOperate && (running > 0 || queued > 0) && (
        <button
          onClick={() => isPaused ? resumeMutation.mutate() : pauseMutation.mutate()}
          disabled={isActionPending}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-200",
            isActionPending && "opacity-50 cursor-not-allowed"
          )}
          style={{
            background: isPaused ? "var(--color-success-muted)" : "var(--glass-bg)",
            color: isPaused ? "var(--color-success)" : "var(--fg-secondary)",
            border: `1px solid ${isPaused ? "transparent" : "var(--border-subtle)"}`,
          }}
        >
          {isPaused ? (
            <>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              {isActionPending ? "Resuming..." : "Resume"}
            </>
          ) : (
            <>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              {isActionPending ? "Pausing..." : "Pause"}
            </>
          )}
        </button>
      )}
    </div>
  );
}

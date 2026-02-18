/**
 * In-Process Worker Manager
 *
 * Runs the queue worker as an async task within the Next.js process.
 * This is more reliable than spawning child processes because:
 * - Same process lifecycle as the app
 * - Shared database connections
 * - No inter-process communication overhead
 * - Survives hot reloads in development
 *
 * MULTI-CAMPAIGN SUPPORT:
 * - Only processes calls for the currently ACTIVE campaign
 * - Automatically stops when the active campaign is complete
 * - Respects campaign-level pause state
 *
 * PRODUCTION STABILITY:
 * - Comprehensive error handling to prevent crashes
 * - Automatic retry with exponential backoff
 * - Circuit breaker pattern for external API calls
 * - Graceful degradation on failures
 */

import { prisma } from "@/lib/prisma";

// Configuration
const POLL_INTERVAL = 10_000; // 10 seconds between cycles
const PAUSED_CHECK_INTERVAL = 30_000; // 30 seconds when paused
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_CALLS ?? "50", 10);
const MAX_CONSECUTIVE_ERRORS = 5; // Stop after this many consecutive errors
const ERROR_BACKOFF_BASE = 5_000; // Base backoff time in ms
const RUNNING_CALL_TIMEOUT_MS = 40 * 60 * 1000; // 40 minutes
const ZOMBIE_CLEANUP_EVERY_CYCLES = 20;

// HappyRobot config (with fallbacks to prevent crashes)
const HAPPYROBOT_WEBHOOK_URL = process.env.HAPPYROBOT_ENDPOINT ?? "";
const HAPPYROBOT_API_KEY = process.env.HAPPYROBOT_API_KEY ?? "";
const HAPPYROBOT_ORG_ID = process.env.HAPPYROBOT_ORG_ID ?? "";

// Worker state
let isRunning = false;
let shouldStop = false;
let currentPromise: Promise<void> | null = null;
let consecutiveErrors = 0;

// Stats for monitoring
const stats = {
  startedAt: null as Date | null,
  campaignId: null as string | null,
  campaignName: null as string | null,
  totalTriggered: 0,
  totalCompleted: 0,
  totalFailed: 0,
  lastCycleAt: null as Date | null,
  lastError: null as string | null,
  consecutiveErrors: 0,
};

interface TriggerPayload {
  phone_number: string;
  metadata: Record<string, unknown>;
}

interface HappyRobotResponse {
  queued_run_ids?: string[];
  status?: string;
  error?: string;
}

// Get the currently active campaign
async function getActiveCampaign() {
  return prisma.campaign.findFirst({
    where: { isActive: true },
  });
}

// Mark stale RUNNING calls as failed when they have exceeded the timeout
async function cleanupZombieRunningCalls(): Promise<number> {
  const cutoff = new Date(Date.now() - RUNNING_CALL_TIMEOUT_MS);
  const staleCalls = await prisma.call.findMany({
    where: {
      status: "RUNNING",
      OR: [
        { triggeredAt: { lte: cutoff } },
        { triggeredAt: null, updatedAt: { lte: cutoff } },
      ],
    },
    select: { id: true },
  });

  if (staleCalls.length === 0) {
    return 0;
  }

  const staleCallIds = staleCalls.map((call) => call.id);
  const now = new Date();

  await prisma.call.updateMany({
    where: { id: { in: staleCallIds } },
    data: {
      status: "FAILED",
      callOutcome: "SYSTEM_TIMEOUT",
      completedAt: now,
      errorMessage: "Marked failed by worker cleanup after exceeding 40 minutes in RUNNING status",
    },
  });

  console.error(
    `[Worker] Zombie cleanup: marked ${staleCallIds.length} stale RUNNING call(s) as FAILED`
  );

  return staleCallIds.length;
}

// Trigger a call via HappyRobot webhook
async function triggerCall(
  callId: string,
  payload: TriggerPayload
): Promise<{ success: boolean; runId?: string; error?: string }> {
  try {
    console.log(`[Worker] Triggering call ${callId} to ${payload.phone_number}`);

    const response = await fetch(HAPPYROBOT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": HAPPYROBOT_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Worker] HTTP error for call ${callId}: ${response.status} - ${errorText}`);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data: HappyRobotResponse = await response.json();
    const runId = data.queued_run_ids?.[0];

    if (!runId) {
      console.error(`[Worker] No run ID returned for call ${callId}. Response:`, JSON.stringify(data));
      return { success: false, error: "No run ID returned from HappyRobot" };
    }

    return { success: true, runId };
  } catch (error) {
    console.error(`[Worker] Exception triggering call ${callId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Poll HappyRobot for run status - returns full response for extraction
async function pollRunStatus(runId: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(
      `https://platform.happyrobot.ai/api/v1/runs/${runId}`,
      {
        headers: {
          "Authorization": `Bearer ${HAPPYROBOT_API_KEY}`,
          "x-organization-id": HAPPYROBOT_ORG_ID,
        },
      }
    );

    if (response.status === 404) {
      return { status: "not_found" };
    }

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

// Classify a string value into a call outcome
function classifyOutcome(value: string): string | null {
  const v = value.toLowerCase().trim();
  if (!v) return null;

  if (v.includes("canceled") || v.includes("cancelled")) {
    return "SYSTEM_CANCELED";
  } else if (v.includes("promise") || v.includes("will_pay") || v.includes("will pay") || v.includes("payment_promised")) {
    return "PAYMENT_PROMISED";
  } else if (v.includes("decline") || v.includes("refuse") || v.includes("rejected")) {
    return "DECLINED";
  } else if (v.includes("dispute")) {
    return "DISPUTED";
  } else if (v.includes("no_answer") || v.includes("no answer") || v.includes("unanswered") || v.includes("not_reached") || v.includes("not reached")) {
    return "NO_ANSWER";
  } else if (v.includes("voicemail") || v.includes("voice_mail") || v.includes("vm")) {
    return "VOICEMAIL";
  } else if (v.includes("wrong_number") || v.includes("wrong number") || v.includes("invalid")) {
    return "WRONG_NUMBER";
  } else if (v.includes("callback") || v.includes("call_back") || v.includes("call back")) {
    return "CALLBACK_REQUESTED";
  }
  return null;
}

// Recursively search an object for classification/outcome/summary fields
function deepSearchForOutcome(obj: unknown, depth = 0): {
  callOutcome: string | null;
  callDuration: number | null;
  callSummary: string | null;
} {
  if (depth > 10 || obj === null || obj === undefined) {
    return { callOutcome: null, callDuration: null, callSummary: null };
  }

  let callOutcome: string | null = null;
  let callDuration: number | null = null;
  let callSummary: string | null = null;

  if (typeof obj === "object" && !Array.isArray(obj)) {
    const record = obj as Record<string, unknown>;

    // Check known classification field names
    const classificationFields = [
      "classification", "outcome", "call_outcome", "callOutcome",
      "result", "call_result", "callResult", "disposition",
      "call_disposition", "callDisposition", "status_detail",
      "call_status", "callStatus", "category",
    ];

    for (const field of classificationFields) {
      if (record[field] && typeof record[field] === "string") {
        const classified = classifyOutcome(record[field] as string);
        if (classified) {
          callOutcome = classified;
          break;
        }
      }
    }

    // Check known summary field names
    const summaryFields = ["summary", "call_summary", "callSummary", "transcript_summary", "notes", "description"];
    for (const field of summaryFields) {
      if (record[field] && typeof record[field] === "string") {
        callSummary = String(record[field]);
        break;
      }
    }

    // Check known duration field names
    const durationFields = ["duration", "call_duration", "callDuration", "duration_seconds", "call_length"];
    for (const field of durationFields) {
      if (typeof record[field] === "number") {
        callDuration = record[field] as number;
        break;
      }
    }

    // If we found what we need, return early
    if (callOutcome) {
      return { callOutcome, callDuration, callSummary };
    }

    // Recurse into nested objects
    for (const key of Object.keys(record)) {
      if (typeof record[key] === "object" && record[key] !== null) {
        const nested = deepSearchForOutcome(record[key], depth + 1);
        if (nested.callOutcome && !callOutcome) callOutcome = nested.callOutcome;
        if (nested.callDuration !== null && callDuration === null) callDuration = nested.callDuration;
        if (nested.callSummary && !callSummary) callSummary = nested.callSummary;
        if (callOutcome) break;
      }
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      const nested = deepSearchForOutcome(item, depth + 1);
      if (nested.callOutcome && !callOutcome) callOutcome = nested.callOutcome;
      if (nested.callDuration !== null && callDuration === null) callDuration = nested.callDuration;
      if (nested.callSummary && !callSummary) callSummary = nested.callSummary;
      if (callOutcome) break;
    }
  }

  return { callOutcome, callDuration, callSummary };
}

// Extract call outcome from HappyRobot response
// Searches the entire response recursively for classification data
function extractOutcome(fullResponse: Record<string, unknown>, runStatus: string): {
  callOutcome: string;
  callDuration: number | null;
  callSummary: string | null;
} {
  const result = deepSearchForOutcome(fullResponse);

  console.log(`[Worker] extractOutcome result: outcome=${result.callOutcome}, duration=${result.callDuration}, summary=${result.callSummary ? "yes" : "no"}`);

  // Log top-level keys for debugging
  console.log(`[Worker] Response top-level keys: ${Object.keys(fullResponse).join(", ")}`);
  if (fullResponse.events && Array.isArray(fullResponse.events)) {
    console.log(`[Worker] Events count: ${fullResponse.events.length}`);
    for (const event of fullResponse.events) {
      const e = event as Record<string, unknown>;
      console.log(`[Worker]   Event: type=${e.type}, name=${e.event_name || e.integration_name || "?"}, hasOutput=${!!e.output}`);
    }
  }

  let callOutcome = result.callOutcome ?? "COMPLETED_UNKNOWN";
  if (
    result.callDuration === 0 &&
    (runStatus === "completed" || runStatus === "canceled") &&
    !result.callOutcome
  ) {
    callOutcome = "CONNECT_FAILED";
  }

  return {
    callOutcome,
    callDuration: result.callDuration,
    callSummary: result.callSummary,
  };
}

// Check current work status for the active campaign
async function getWorkStatus(campaignId: string): Promise<{
  pending: number;
  running: number;
  isPaused: boolean;
  campaignStatus: string;
}> {
  const [pending, running, campaign] = await Promise.all([
    prisma.call.count({ where: { campaignId, status: "PENDING" } }),
    prisma.call.count({ where: { campaignId, status: "RUNNING" } }),
    prisma.campaign.findUnique({ where: { id: campaignId } }),
  ]);

  return {
    pending,
    running,
    isPaused: campaign?.isQueuePaused ?? false,
    campaignStatus: campaign?.status ?? "UNKNOWN",
  };
}

// Process one cycle of the queue for the active campaign
// When isPaused=true, we only poll running calls (no new triggers)
async function processQueueCycle(campaignId: string, isPaused: boolean = false): Promise<{
  triggered: number;
  polled: number;
  completed: number;
}> {
  let triggered = 0;
  let polled = 0;
  let completed = 0;

  // Count current running calls for this campaign
  const runningCount = await prisma.call.count({
    where: { campaignId, status: "RUNNING" },
  });

  // Only trigger new calls if NOT paused and under limit
  if (!isPaused) {
    const slotsAvailable = MAX_CONCURRENT - runningCount;
    if (slotsAvailable > 0) {
      const takeCount = consecutiveErrors > 2
        ? Math.min(slotsAvailable, 5)
        : slotsAvailable;
      const pendingCalls = await prisma.call.findMany({
        where: { campaignId, status: "PENDING" },
        take: takeCount,
        include: {
          debtor: {
            include: { invoices: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      for (const call of pendingCalls) {
        if (shouldStop) break;

        const payload: TriggerPayload = {
          phone_number: call.debtor.phoneNumber,
          metadata: {
            call_id: call.id,
            debtor_id: call.debtor.id,
            debtor_number: call.debtor.debtorNumber,
            debtor_name: call.debtor.debtorName,
            debtor_mc: call.debtor.debtorMc,
            debtor_dot: call.debtor.debtorDot,
            debtor_email: call.debtor.debtorEmail,
            phone_number: call.debtor.phoneNumber,
            timezone: call.debtor.timezone,
            total_amount: call.debtor.totalAmount,
            num_invoices: call.debtor.numInvoices,
            attempt_number: call.attemptNumber,
            invoices: call.debtor.invoices.map(inv => ({
              id: inv.id,
              load_number: inv.loadNumber,
              carrier_name: inv.carrierName,
              client_mc: inv.clientMc,
              client_dot: inv.clientDot,
              amount: inv.amount,
              email_only: inv.emailOnly,
              debtor_name: call.debtor.debtorName,
              debtor_mc: call.debtor.debtorMc,
              debtor_dot: call.debtor.debtorDot,
              debtor_email: call.debtor.debtorEmail,
              phone_number: call.debtor.phoneNumber,
              timezone: call.debtor.timezone,
              created_at: inv.createdAt?.toISOString() ?? new Date().toISOString(),
              updated_at: inv.updatedAt?.toISOString() ?? new Date().toISOString(),
            })),
          },
        };

        await prisma.call.update({
          where: { id: call.id },
          data: { triggeredAt: new Date() },
        });

        const result = await triggerCall(call.id, payload);

        if (result.success && result.runId) {
          await prisma.call.update({
            where: { id: call.id },
            data: { runId: result.runId, status: "RUNNING" },
          });
          triggered++;
          stats.totalTriggered++;
          console.log(`[Worker] Triggered call ${call.id} → run ${result.runId}`);
        } else {
          await prisma.call.update({
            where: { id: call.id },
            data: {
              status: "FAILED",
              errorMessage: result.error,
              completedAt: new Date(),
            },
          });
          stats.totalFailed++;
          console.error(`[Worker] Failed to trigger call ${call.id}: ${result.error}`);
        }
      }
    }
  }

  // ALWAYS poll running calls (even when paused) - so they can complete
  const runningCalls = await prisma.call.findMany({
    where: { campaignId, status: "RUNNING", runId: { not: null } },
  });

  for (const call of runningCalls) {
    if (shouldStop) break;
    if (!call.runId) continue;

    const status = await pollRunStatus(call.runId);
    polled++;

    if (!status) continue;

    const runStatus = String(status.status ?? "running").toLowerCase();

    if (runStatus === "not_found") {
      await prisma.call.update({
        where: { id: call.id },
        data: {
          status: "FAILED",
          callOutcome: "CALL_LOST_BY_PROVIDER",
          completedAt: new Date(),
          errorMessage: `Run not found at provider (404) for runId=${call.runId}`,
        },
      });
      completed++;
      stats.totalFailed++;
      console.warn(`[Worker] Call ${call.id} failed: provider run not found (runId=${call.runId})`);
      continue;
    }

    const statusMap: Record<string, string> = {
      pending: "RUNNING",
      running: "RUNNING",
      completed: "COMPLETED",
      failed: "FAILED",
      canceled: "CANCELED",
    };

    const newStatus = statusMap[runStatus] ?? "RUNNING";

    if (newStatus !== "RUNNING") {
      const { callOutcome, callDuration, callSummary } = extractOutcome(status, runStatus);

      // Save full response for debugging - truncate if too large
      let metadata: string | null = null;
      try {
        const fullResponse = JSON.stringify(status);
        metadata = fullResponse.length > 10000 ? fullResponse.slice(0, 10000) + "..." : fullResponse;
      } catch {
        metadata = "Failed to serialize response";
      }

      const completedAt = status.completed_at
        ? new Date(String(status.completed_at))
        : new Date();

      await prisma.call.update({
        where: { id: call.id },
        data: {
          status: newStatus,
          completedAt,
          callOutcome,
          callDuration,
          callSummary,
          metadata, // Store raw response for debugging
        },
      });
      completed++;
      stats.totalCompleted++;
      console.log(`[Worker] Call ${call.id} completed: ${callOutcome}`);
    }
  }

  return { triggered, polled, completed };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Validate configuration before starting
function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!HAPPYROBOT_WEBHOOK_URL) {
    errors.push("HAPPYROBOT_ENDPOINT environment variable is not set");
  }
  if (!HAPPYROBOT_API_KEY) {
    errors.push("HAPPYROBOT_API_KEY environment variable is not set");
  }
  if (!HAPPYROBOT_ORG_ID) {
    errors.push("HAPPYROBOT_ORG_ID environment variable is not set");
  }

  return { valid: errors.length === 0, errors };
}

// Main worker loop with comprehensive error handling
async function runWorkerLoop(): Promise<void> {
  console.log("[Worker] ========================================");
  console.log("[Worker] Starting in-process queue worker");
  console.log("[Worker] ========================================");
  console.log(`[Worker] Max concurrent calls: ${MAX_CONCURRENT}`);
  console.log(`[Worker] Poll interval: ${POLL_INTERVAL}ms`);

  try {
    const cleaned = await cleanupZombieRunningCalls();
    if (cleaned > 0) {
      console.log(`[Worker] Startup cleanup complete: ${cleaned} stale RUNNING call(s) resolved`);
    }
  } catch (error) {
    console.error("[Worker] Zombie cleanup failed:", error);
    // Non-fatal: continue worker startup even if cleanup fails
  }

  // Validate configuration
  const configCheck = validateConfig();
  if (!configCheck.valid) {
    console.error("[Worker] Configuration errors:", configCheck.errors);
    stats.lastError = `Config errors: ${configCheck.errors.join(", ")}`;
    isRunning = false;
    return;
  }

  // Get active campaign with error handling
  let campaign;
  try {
    campaign = await getActiveCampaign();
  } catch (error) {
    console.error("[Worker] Failed to fetch active campaign:", error);
    stats.lastError = `Database error: ${error instanceof Error ? error.message : "Unknown"}`;
    isRunning = false;
    return;
  }

  if (!campaign) {
    console.log("[Worker] No active campaign found. Worker stopping.");
    isRunning = false;
    return;
  }

  stats.startedAt = new Date();
  stats.campaignId = campaign.id;
  stats.campaignName = campaign.name;
  stats.totalTriggered = 0;
  stats.totalCompleted = 0;
  stats.totalFailed = 0;
  stats.lastError = null;
  stats.consecutiveErrors = 0;
  consecutiveErrors = 0;

  console.log(`[Worker] Active campaign: ${campaign.name} (${campaign.id})`);
  let cycleCount = 0;

  let initialStatus;
  try {
    initialStatus = await getWorkStatus(campaign.id);
  } catch (error) {
    console.error("[Worker] Failed to get initial status:", error);
    stats.lastError = `Database error: ${error instanceof Error ? error.message : "Unknown"}`;
    isRunning = false;
    return;
  }

  console.log(`[Worker] Initial state: ${initialStatus.pending} pending, ${initialStatus.running} running`);

  if (initialStatus.pending === 0 && initialStatus.running === 0) {
    console.log("[Worker] No work to do. Worker stopping.");
    try {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    } catch (error) {
      console.error("[Worker] Failed to mark campaign as completed:", error);
    }
    isRunning = false;
    return;
  }

  // Mark campaign as started if not already
  if (!campaign.startedAt) {
    try {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { startedAt: new Date() },
      });
    } catch (error) {
      console.error("[Worker] Failed to mark campaign as started:", error);
      // Non-fatal, continue processing
    }
  }

  while (!shouldStop) {
    const startTime = Date.now();
    cycleCount++;

    try {
      if (cycleCount % ZOMBIE_CLEANUP_EVERY_CYCLES === 0) {
        try {
          const cleaned = await cleanupZombieRunningCalls();
          if (cleaned > 0) {
            console.log(`[Worker] Periodic cleanup complete: ${cleaned} stale RUNNING call(s) resolved`);
          }
        } catch (cleanupError) {
          console.error("[Worker] Periodic zombie cleanup failed:", cleanupError);
        }
      }

      // Re-check active campaign (might have changed)
      const currentCampaign = await getActiveCampaign();
      if (!currentCampaign || currentCampaign.id !== campaign.id) {
        console.log("[Worker] Active campaign changed. Worker stopping.");
        break;
      }

      const status = await getWorkStatus(campaign.id);

      // When paused with no running calls, just wait for resume (don't exit)
      if (status.isPaused && status.running === 0) {
        console.log(`[Worker] Campaign paused. Waiting for resume... (${status.pending} pending)`);
        consecutiveErrors = 0;
        await sleep(PAUSED_CHECK_INTERVAL);
        continue;
      }

      // Only complete if NOT paused and no work left
      // (When paused, we want to stay running to poll remaining calls)
      if (!status.isPaused && status.pending === 0 && status.running === 0) {
        console.log("[Worker] ========================================");
        console.log("[Worker] All calls processed!");
        console.log(`[Worker] Campaign: ${campaign.name}`);
        console.log(`[Worker] Total triggered: ${stats.totalTriggered}`);
        console.log(`[Worker] Total completed: ${stats.totalCompleted}`);
        console.log(`[Worker] Total failed: ${stats.totalFailed}`);
        console.log("[Worker] ========================================");

        try {
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
        } catch (error) {
          console.error("[Worker] Failed to mark campaign as completed:", error);
        }

        break;
      }

      // Process cycle - pass isPaused so it only polls (doesn't trigger) when paused
      const result = await processQueueCycle(campaign.id, status.isPaused);
      const elapsed = Date.now() - startTime;
      stats.lastCycleAt = new Date();
      consecutiveErrors = 0;
      stats.consecutiveErrors = 0;

      const newStatus = await getWorkStatus(campaign.id);

      if (status.isPaused) {
        console.log(
          `[Worker] PAUSED - polling only: +${result.completed} completed ` +
          `| ${newStatus.running} still running, ${newStatus.pending} pending ` +
          `| ${elapsed}ms`
        );
      } else {
        console.log(
          `[Worker] Cycle: +${result.triggered} triggered, +${result.completed} completed ` +
          `| Queue: ${newStatus.pending} pending, ${newStatus.running} running ` +
          `| ${elapsed}ms`
        );
      }

      // Use shorter interval when paused (to complete running calls faster)
      await sleep(status.isPaused ? POLL_INTERVAL : POLL_INTERVAL);
    } catch (error) {
      consecutiveErrors++;
      stats.consecutiveErrors = consecutiveErrors;
      stats.lastError = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Worker] Error in processing cycle (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error);

      // If too many consecutive errors, stop the worker to prevent runaway failures
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error("[Worker] Too many consecutive errors. Stopping worker for safety.");
        console.error("[Worker] Manual restart required after investigating the issue.");
        break;
      }

      // Exponential backoff on errors
      const backoffTime = Math.min(ERROR_BACKOFF_BASE * Math.pow(2, consecutiveErrors - 1), 60_000);
      console.log(`[Worker] Backing off for ${backoffTime}ms before retry...`);
      await sleep(backoffTime);
    }
  }

  isRunning = false;
  shouldStop = false;
  console.log("[Worker] Worker stopped.");
}

// Public API

export function startWorker(): { success: boolean; message: string } {
  if (isRunning) {
    return { success: false, message: "Worker is already running" };
  }

  isRunning = true;
  shouldStop = false;

  // Run the worker loop without awaiting (fire-and-forget)
  currentPromise = runWorkerLoop().catch(error => {
    console.error("[Worker] Fatal error:", error);
    isRunning = false;
  });

  return { success: true, message: "Worker started" };
}

export function stopWorker(): { success: boolean; message: string } {
  if (!isRunning) {
    return { success: true, message: "Worker is not running" };
  }

  shouldStop = true;
  return { success: true, message: "Worker stop signal sent" };
}

export function getWorkerStatus(): {
  running: boolean;
  healthy: boolean;
  stats: typeof stats;
} {
  // Worker is healthy if running and not experiencing consecutive errors
  const healthy = isRunning && consecutiveErrors < MAX_CONSECUTIVE_ERRORS;

  return {
    running: isRunning,
    healthy,
    stats: { ...stats },
  };
}

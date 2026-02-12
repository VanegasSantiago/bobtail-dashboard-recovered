import { NextResponse } from "next/server";
import { startWorker, stopWorker, getWorkerStatus } from "@/lib/worker-manager";
import { requireOperator, requireAuth } from "@/lib/auth-api";

/**
 * POST /api/campaign/worker
 *
 * Starts the queue worker as an in-process async task.
 * The worker will process all pending calls and stop when complete.
 *
 * This approach is more reliable than spawning child processes:
 * - Same process lifecycle as the app
 * - Shared database connections
 * - No inter-process communication overhead
 * - Survives hot reloads in development
 */
export async function POST() {
  // Only operators and admins can start the worker
  const authResult = await requireOperator();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const result = startWorker();

    return NextResponse.json({
      success: result.success,
      message: result.message,
      status: result.success ? "running" : "already_running",
    });
  } catch (error) {
    console.error("Failed to start worker:", error);
    return NextResponse.json(
      { success: false, message: "Failed to start worker" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/campaign/worker
 *
 * Returns the current worker status and stats.
 */
export async function GET() {
  // Any authenticated user can view worker status
  const authResult = await requireAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const status = getWorkerStatus();

  return NextResponse.json({
    status: status.running ? "running" : "idle",
    running: status.running,
    stats: status.stats,
  });
}

/**
 * DELETE /api/campaign/worker
 *
 * Stops the worker if running.
 */
export async function DELETE() {
  // Only operators and admins can stop the worker
  const authResult = await requireOperator();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const result = stopWorker();

  return NextResponse.json({
    success: result.success,
    message: result.message,
    status: "stopping",
  });
}

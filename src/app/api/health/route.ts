import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkerStatus } from "@/lib/worker-manager";

/**
 * GET /api/health
 *
 * Health check endpoint for Railway and monitoring.
 * Returns OK if the database is accessible.
 */
export async function GET() {
  try {
    // Check database connectivity with a simple query
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - startTime;

    // Get worker status
    const workerStatus = getWorkerStatus();

    // Get basic stats
    const [campaignCount, callCount] = await Promise.all([
      prisma.campaign.count(),
      prisma.call.count({ where: { status: "RUNNING" } }),
    ]);

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        latencyMs: dbLatency,
      },
      worker: {
        running: workerStatus.running,
        campaignId: workerStatus.stats.campaignId,
      },
      stats: {
        campaigns: campaignCount,
        activeCalls: callCount,
      },
    });
  } catch (error) {
    console.error("[Health] Database check failed:", error);

    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        database: {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 503 }
    );
  }
}

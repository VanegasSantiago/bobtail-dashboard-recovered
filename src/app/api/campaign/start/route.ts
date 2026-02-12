import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startWorker } from "@/lib/worker-manager";
import { requireOperator } from "@/lib/auth-api";

/**
 * POST /api/campaign/start
 *
 * Starts/resumes the active campaign by unpausing the queue.
 * The worker will pick up the pending calls automatically.
 */
export async function POST() {
  // Only operators and admins can start campaigns
  const authResult = await requireOperator();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    // Get the active campaign
    const campaign = await prisma.campaign.findFirst({
      where: { isActive: true },
    });

    if (!campaign) {
      return NextResponse.json(
        { message: "No active campaign. Please upload a CSV first." },
        { status: 400 }
      );
    }

    // Check if there are any calls to process
    const startStatusGroups = await prisma.call.groupBy({
      by: ["status"],
      where: { campaignId: campaign.id, status: { in: ["PENDING", "RUNNING"] } },
      _count: { id: true },
    });
    const startCounts: Record<string, number> = {};
    for (const row of startStatusGroups) {
      startCounts[row.status] = row._count.id;
    }
    const pendingCalls = startCounts["PENDING"] ?? 0;
    const runningCalls = startCounts["RUNNING"] ?? 0;

    if (pendingCalls === 0 && runningCalls === 0) {
      return NextResponse.json(
        { message: "No calls to process in this campaign." },
        { status: 400 }
      );
    }

    // Unpause the campaign
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        isQueuePaused: false,
        status: "ACTIVE",
        startedAt: campaign.startedAt ?? new Date(),
      },
    });

    // Start the worker if not already running
    const workerResult = startWorker();
    console.log("[Campaign Start] Worker result:", workerResult);

    return NextResponse.json({
      success: true,
      message: "Campaign started",
      campaignId: campaign.id,
      campaignName: campaign.name,
      pendingCalls,
      runningCalls,
    });
  } catch (error) {
    console.error("Start campaign error:", error);
    return NextResponse.json(
      { message: "Failed to start campaign" },
      { status: 500 }
    );
  }
}

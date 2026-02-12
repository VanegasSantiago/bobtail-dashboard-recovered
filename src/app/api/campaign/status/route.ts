import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-api";

/**
 * GET /api/campaign/status
 *
 * Returns the current active campaign status including progress.
 * Optionally accepts a campaignId query parameter to get status of a specific campaign.
 */
export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");

    // Get the campaign (specific or active)
    const campaign = campaignId
      ? await prisma.campaign.findUnique({ where: { id: campaignId } })
      : await prisma.campaign.findFirst({ where: { isActive: true } });

    if (!campaign) {
      return NextResponse.json({
        state: "idle",
        isPaused: false,
        totalCalls: 0,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        processedCalls: 0,
        progress: 0,
        sourceFile: null,
        importedAt: null,
        campaignId: null,
        campaignName: null,
        campaignNumber: null,
      });
    }

    // Get call counts by status in a single query
    const statusGroups = await prisma.call.groupBy({
      by: ["status"],
      where: { campaignId: campaign.id },
      _count: { id: true },
    });

    const counts: Record<string, number> = {};
    for (const row of statusGroups) {
      counts[row.status] = row._count.id;
    }
    const pending = counts["PENDING"] ?? 0;
    const running = counts["RUNNING"] ?? 0;
    const completed = counts["COMPLETED"] ?? 0;
    const failed = counts["FAILED"] ?? 0;
    const totalCalls = pending + running + completed + failed;
    const processedCalls = completed + failed;

    // Determine campaign state
    let state: "idle" | "running" | "paused" | "complete";
    if (totalCalls === 0) {
      state = "idle";
    } else if (campaign.isQueuePaused) {
      state = "paused";
    } else if (pending === 0 && running === 0) {
      state = "complete";
    } else {
      state = "running";
    }

    return NextResponse.json({
      state,
      isPaused: campaign.isQueuePaused,
      totalCalls,
      pending,
      running,
      completed,
      failed,
      processedCalls,
      progress: totalCalls > 0 ? Math.round((processedCalls / totalCalls) * 100) : 0,
      sourceFile: campaign.sourceFile,
      importedAt: campaign.importedAt,
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignNumber: campaign.campaignNumber,
    });
  } catch (error) {
    console.error("Campaign status error:", error);
    return NextResponse.json(
      { message: "Failed to get campaign status" },
      { status: 500 }
    );
  }
}

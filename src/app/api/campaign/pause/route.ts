import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOperator } from "@/lib/auth-api";

/**
 * POST /api/campaign/pause
 *
 * Pauses the active campaign. Running calls will complete, but no new calls will be triggered.
 */
export async function POST() {
  // Only operators and admins can pause campaigns
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
        { message: "No active campaign to pause." },
        { status: 400 }
      );
    }

    // Pause the campaign
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        isQueuePaused: true,
        status: "PAUSED",
      },
    });

    const statusGroups = await prisma.call.groupBy({
      by: ["status"],
      where: { campaignId: campaign.id, status: { in: ["RUNNING", "PENDING"] } },
      _count: { id: true },
    });
    const pauseCounts: Record<string, number> = {};
    for (const row of statusGroups) {
      pauseCounts[row.status] = row._count.id;
    }
    const runningCalls = pauseCounts["RUNNING"] ?? 0;
    const pendingCalls = pauseCounts["PENDING"] ?? 0;

    return NextResponse.json({
      success: true,
      message: "Campaign paused",
      campaignId: campaign.id,
      campaignName: campaign.name,
      runningCalls,
      pendingCalls,
    });
  } catch (error) {
    console.error("Pause campaign error:", error);
    return NextResponse.json(
      { message: "Failed to pause campaign" },
      { status: 500 }
    );
  }
}

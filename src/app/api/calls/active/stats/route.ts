import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-api";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_CALLS ?? "25", 10);

    // Get the active campaign
    const campaign = await prisma.campaign.findFirst({
      where: { isActive: true },
    });

    if (!campaign) {
      return NextResponse.json({
        running: 0,
        queued: 0,
        maxConcurrent,
        isPaused: false,
        campaignId: null,
        campaignName: null,
      });
    }

    const activeStatusGroups = await prisma.call.groupBy({
      by: ["status"],
      where: { campaignId: campaign.id, status: { in: ["RUNNING", "PENDING"] } },
      _count: { id: true },
    });
    const activeCounts: Record<string, number> = {};
    for (const row of activeStatusGroups) {
      activeCounts[row.status] = row._count.id;
    }
    const running = activeCounts["RUNNING"] ?? 0;
    const queued = activeCounts["PENDING"] ?? 0;

    return NextResponse.json({
      running,
      queued,
      maxConcurrent,
      isPaused: campaign.isQueuePaused,
      campaignId: campaign.id,
      campaignName: campaign.name,
    });
  } catch (error) {
    console.error("Active stats error:", error);
    return NextResponse.json(
      { message: "Failed to fetch active stats" },
      { status: 500 }
    );
  }
}

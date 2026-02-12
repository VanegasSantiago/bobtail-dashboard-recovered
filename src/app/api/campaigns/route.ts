import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-api";

/**
 * GET /api/campaigns
 *
 * Returns list of all campaigns with summary stats.
 */
export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // ACTIVE, PAUSED, COMPLETED, ARCHIVED
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    // Get campaigns with call stats
    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.campaign.count({ where }),
    ]);

    // Get all call stats in a single groupBy query instead of N*4 parallel counts
    const campaignIds = campaigns.map((c) => c.id);
    const callStats = await prisma.call.groupBy({
      by: ["campaignId", "status"],
      where: { campaignId: { in: campaignIds } },
      _count: { id: true },
    });

    // Index stats by campaignId -> status -> count
    const statsMap = new Map<string, Record<string, number>>();
    for (const row of callStats) {
      if (!statsMap.has(row.campaignId)) {
        statsMap.set(row.campaignId, {});
      }
      statsMap.get(row.campaignId)![row.status] = row._count.id;
    }

    const enrichedCampaigns = campaigns.map((campaign) => {
      const counts = statsMap.get(campaign.id) ?? {};
      const pending = counts["PENDING"] ?? 0;
      const running = counts["RUNNING"] ?? 0;
      const completed = counts["COMPLETED"] ?? 0;
      const failed = counts["FAILED"] ?? 0;
      const totalCalls = pending + running + completed + failed;
      const processedCalls = completed + failed;
      const progress = totalCalls > 0 ? Math.round((processedCalls / totalCalls) * 100) : 0;

      return {
        id: campaign.id,
        campaignNumber: campaign.campaignNumber,
        name: campaign.name,
        sourceFile: campaign.sourceFile,
        status: campaign.status,
        isActive: campaign.isActive,
        // Totals
        totalDebtors: campaign.totalDebtors,
        callableDebtors: campaign.callableDebtors,
        emailOnlyDebtors: campaign.emailOnlyDebtors,
        totalInvoices: campaign.totalInvoices,
        totalAmount: campaign.totalAmount,
        // Call stats
        totalCalls,
        pending,
        running,
        completed,
        failed,
        progress,
        // Timestamps
        importedAt: campaign.importedAt,
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt,
        createdAt: campaign.createdAt,
      };
    });

    return NextResponse.json({
      campaigns: enrichedCampaigns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Campaigns list error:", error);
    return NextResponse.json(
      { message: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

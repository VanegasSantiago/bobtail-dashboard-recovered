import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-api";

export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const campaignIdParam = searchParams.get("campaignId");

    // Get the campaign (specific or active)
    const campaign = campaignIdParam
      ? await prisma.campaign.findUnique({ where: { id: campaignIdParam } })
      : await prisma.campaign.findFirst({ where: { isActive: true } });

    if (!campaign) {
      return NextResponse.json({
        statuses: [],
        outcomes: [],
        timezones: [],
      });
    }

    const campaignId = campaign.id;

    // Get counts for all filter options for this campaign
    const [
      statusCounts,
      outcomeCounts,
      timezoneCounts,
    ] = await Promise.all([
      // Call status
      prisma.call.groupBy({
        by: ["status"],
        where: { campaignId },
        _count: { status: true },
        orderBy: { _count: { status: "desc" } },
      }),
      // Call outcome
      prisma.call.groupBy({
        by: ["callOutcome"],
        where: { campaignId },
        _count: { callOutcome: true },
        orderBy: { _count: { callOutcome: "desc" } },
      }),
      // Timezone (from debtor)
      prisma.$queryRaw`
        SELECT d.timezone as value, COUNT(*) as count
        FROM calls c
        JOIN debtors d ON c.debtor_id = d.id
        WHERE c.campaign_id = ${campaignId}
          AND d.timezone IS NOT NULL AND d.timezone != ''
        GROUP BY d.timezone
        ORDER BY count DESC
      ` as Promise<{ value: string; count: bigint }[]>,
    ]);

    return NextResponse.json({
      statuses: statusCounts.map((s) => ({
        value: s.status,
        count: s._count.status,
      })),
      outcomes: outcomeCounts.map((o) => ({
        value: o.callOutcome,
        count: o._count.callOutcome,
      })),
      timezones: timezoneCounts.map((t) => ({
        value: t.value,
        count: Number(t.count),
      })),
    });
  } catch (error) {
    console.error("Call filters error:", error);
    return NextResponse.json(
      { message: "Failed to fetch filters" },
      { status: 500 }
    );
  }
}

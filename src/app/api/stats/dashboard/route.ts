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
    const scope = searchParams.get("scope") ?? "active";

    let campaignFilter: { campaignId?: string } | Record<string, never> = {};
    let campaignInfo: { id: string | null; name: string | null; number: number | null } = {
      id: null,
      name: null,
      number: null,
    };

    if (scope === "all") {
      campaignFilter = {};
      campaignInfo = { id: null, name: "All Campaigns", number: null };
    } else if (campaignIdParam) {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignIdParam } });
      if (!campaign) {
        return NextResponse.json({ message: "Campaign not found" }, { status: 404 });
      }
      campaignFilter = { campaignId: campaign.id };
      campaignInfo = { id: campaign.id, name: campaign.name, number: campaign.campaignNumber };
    } else {
      const campaign = await prisma.campaign.findFirst({ where: { isActive: true } });
      if (!campaign) {
        return NextResponse.json({
          totalDebtors: 0,
          callableDebtors: 0,
          emailOnlyDebtors: 0,
          totalAmountOwed: 0,
          totalCalls: 0,
          callsToday: 0,
          pending: 0,
          running: 0,
          completed: 0,
          failed: 0,
          outcomeCounts: [],
          successfulCalls: 0,
          connectedCalls: 0,
          noContactCalls: 0,
          unsuccessfulCalls: 0,
          contactRate: 0,
          successRate: 0,
          campaignId: null,
          campaignName: null,
          scope: "active",
        });
      }
      campaignFilter = { campaignId: campaign.id };
      campaignInfo = { id: campaign.id, name: campaign.name, number: campaign.campaignNumber };
    }

    const debtorWhere = campaignFilter.campaignId ? { campaignId: campaignFilter.campaignId } : {};
    const callWhere = campaignFilter.campaignId ? { campaignId: campaignFilter.campaignId } : {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [debtorStats, amountAgg] = await Promise.all([
      prisma.debtor.groupBy({
        by: ["emailOnly"],
        where: debtorWhere,
        _count: { id: true },
      }),
      prisma.debtor.aggregate({
        where: debtorWhere,
        _sum: { totalAmount: true },
      }),
    ]);

    const emailOnlyDebtors = debtorStats.find((d) => d.emailOnly)?._count.id ?? 0;
    const callableDebtors = debtorStats.find((d) => !d.emailOnly)?._count.id ?? 0;
    const totalDebtors = emailOnlyDebtors + callableDebtors;
    const totalAmountOwed = amountAgg._sum.totalAmount ?? 0;

    const [statusGroups, outcomeGroups, callsToday] = await Promise.all([
      prisma.call.groupBy({
        by: ["status"],
        where: callWhere,
        _count: { id: true },
      }),
      prisma.call.groupBy({
        by: ["callOutcome"],
        where: callWhere,
        _count: { id: true },
      }),
      prisma.call.count({
        where: { ...callWhere, createdAt: { gte: today } },
      }),
    ]);

    // Status counts
    const statusCounts: Record<string, number> = {};
    for (const row of statusGroups) {
      statusCounts[row.status] = row._count.id;
    }
    const pending = statusCounts["PENDING"] ?? 0;
    const running = statusCounts["RUNNING"] ?? 0;
    const completed = statusCounts["COMPLETED"] ?? 0;
    const failed = statusCounts["FAILED"] ?? 0;
    const totalCalls = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);

    // Outcome counts - return as array sorted by count descending
    const outcomeCounts = outcomeGroups
      .map((row) => ({ outcome: row.callOutcome, count: row._count.id }))
      .sort((a, b) => b.count - a.count);

    // Derive category totals from tag prefixes
    let successfulCalls = 0;
    let connectedCalls = 0;
    let noContactCalls = 0;
    let unsuccessfulCalls = 0;

    for (const { outcome, count } of outcomeCounts) {
      if (outcome.startsWith("Call Successful")) {
        successfulCalls += count;
      } else if (outcome.startsWith("Call Connected")) {
        connectedCalls += count;
      } else if (outcome.startsWith("No Contact")) {
        noContactCalls += count;
      } else if (outcome.startsWith("Call Unsuccessful")) {
        unsuccessfulCalls += count;
      }
    }

    const totalWithOutcome = successfulCalls + connectedCalls + noContactCalls + unsuccessfulCalls;
    const contacted = successfulCalls + connectedCalls;
    const contactRate = totalWithOutcome > 0 ? (contacted / totalWithOutcome) * 100 : 0;
    const successRate = contacted > 0 ? (successfulCalls / contacted) * 100 : 0;

    return NextResponse.json({
      scope,
      campaignId: campaignInfo.id,
      campaignName: campaignInfo.name,
      campaignNumber: campaignInfo.number,

      totalDebtors,
      callableDebtors,
      emailOnlyDebtors,
      totalAmountOwed,

      totalCalls,
      callsToday,
      pending,
      running,
      completed,
      failed,

      outcomeCounts,
      successfulCalls,
      connectedCalls,
      noContactCalls,
      unsuccessfulCalls,

      contactRate,
      successRate,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { message: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}

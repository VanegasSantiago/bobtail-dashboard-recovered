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
        timezones: [],
        callStatuses: [],
        outcomes: [],
        emailOnly: [],
      });
    }

    const campaignId = campaign.id;

    // Get unique values for filters with counts for this campaign
    const [
      timezones,
      callStatusCounts,
      outcomeCounts,
      emailOnlyCounts,
    ] = await Promise.all([
      prisma.debtor.groupBy({
        by: ["timezone"],
        where: { campaignId, timezone: { not: null } },
        _count: { timezone: true },
        orderBy: { _count: { timezone: "desc" } },
      }),
      // Call status counts
      prisma.$queryRaw`
        SELECT
          COALESCE(c.status, 'NOT_CALLED') as status,
          COUNT(*) as count
        FROM debtors d
        LEFT JOIN (
          SELECT debtor_id, status
          FROM calls
          WHERE campaign_id = ${campaignId}
            AND (debtor_id, attempt_number) IN (
              SELECT debtor_id, MAX(attempt_number)
              FROM calls
              WHERE campaign_id = ${campaignId}
              GROUP BY debtor_id
            )
        ) c ON d.id = c.debtor_id
        WHERE d.campaign_id = ${campaignId}
        GROUP BY COALESCE(c.status, 'NOT_CALLED')
      ` as Promise<{ status: string; count: number }[]>,
      // Call outcome counts
      prisma.$queryRaw`
        SELECT
          COALESCE(c.call_outcome, 'NOT_CALLED') as outcome,
          COUNT(*) as count
        FROM debtors d
        LEFT JOIN (
          SELECT debtor_id, call_outcome
          FROM calls
          WHERE campaign_id = ${campaignId}
            AND (debtor_id, attempt_number) IN (
              SELECT debtor_id, MAX(attempt_number)
              FROM calls
              WHERE campaign_id = ${campaignId}
              GROUP BY debtor_id
            )
        ) c ON d.id = c.debtor_id
        WHERE d.campaign_id = ${campaignId}
        GROUP BY COALESCE(c.call_outcome, 'NOT_CALLED')
      ` as Promise<{ outcome: string; count: number }[]>,
      // Email only counts
      prisma.debtor.groupBy({
        by: ["emailOnly"],
        where: { campaignId },
        _count: { emailOnly: true },
      }),
    ]);

    return NextResponse.json({
      timezones: timezones.map((t) => ({
        value: t.timezone,
        count: t._count.timezone,
      })).filter((t) => t.value),
      callStatuses: callStatusCounts.map((c) => ({
        value: c.status,
        count: Number(c.count),
      })),
      outcomes: outcomeCounts.map((o) => ({
        value: o.outcome,
        count: Number(o.count),
      })),
      emailOnly: emailOnlyCounts.map((e) => ({
        value: e.emailOnly ? "Email Only" : "Callable",
        count: e._count.emailOnly,
      })),
    });
  } catch (error) {
    console.error("Filters error:", error);
    return NextResponse.json(
      { message: "Failed to fetch filters" },
      { status: 500 }
    );
  }
}

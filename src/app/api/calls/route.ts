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

    // Campaign filter - now defaults to ALL campaigns unless specified
    const campaignIdParam = searchParams.get("campaignId");

    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";
    const callOutcome = searchParams.get("callOutcome") ?? "";
    const timezone = searchParams.get("timezone") ?? "";

    const skip = (page - 1) * pageSize;

    // Build where clause - only filter by campaign if specified
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debtorWhere: any = {};

    // Get campaign name for display if filtering
    let campaignName: string | null = null;
    if (campaignIdParam) {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignIdParam } });
      if (campaign) {
        where.campaignId = campaign.id;
        campaignName = campaign.name;
      }
    }

    // Call-level filters
    if (status) {
      where.status = status;
    }
    if (callOutcome) {
      where.callOutcome = callOutcome;
    }

    // Debtor-level filters
    if (timezone) {
      debtorWhere.timezone = timezone;
    }
    if (search) {
      debtorWhere.OR = [
        { debtorName: { contains: search } },
        { phoneNumber: { contains: search } },
        { debtorEmail: { contains: search } },
        { debtorMc: { contains: search } },
      ];
    }

    // Combine debtor filters
    if (Object.keys(debtorWhere).length > 0) {
      where.debtor = debtorWhere;
    }

    // Get total count
    const total = await prisma.call.count({ where });

    // Get calls with debtor info
    const calls = await prisma.call.findMany({
      where,
      select: {
        id: true,
        runId: true,
        attemptNumber: true,
        status: true,
        callOutcome: true,
        triggeredAt: true,
        completedAt: true,
        callDuration: true,
        callSummary: true,
        callTags: true,
        promisedDate: true,
        promisedAmount: true,
        campaignId: true,
        createdAt: true,
        updatedAt: true,
        debtor: {
          select: {
            debtorNumber: true,
            debtorName: true,
            phoneNumber: true,
            debtorEmail: true,
            debtorMc: true,
            debtorDot: true,
            timezone: true,
            totalAmount: true,
            numInvoices: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    });

    return NextResponse.json({
      calls,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      campaignId: campaignIdParam ?? null,
      campaignName: campaignName,
    });
  } catch (error) {
    console.error("Calls API error:", error);
    return NextResponse.json(
      { message: "Failed to fetch calls" },
      { status: 500 }
    );
  }
}

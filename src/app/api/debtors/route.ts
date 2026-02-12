import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-api";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const searchParams = request.nextUrl.searchParams;

    // Campaign filter (defaults to active campaign)
    const campaignIdParam = searchParams.get("campaignId");

    // Get the campaign (specific or active)
    const campaign = campaignIdParam
      ? await prisma.campaign.findUnique({ where: { id: campaignIdParam } })
      : await prisma.campaign.findFirst({ where: { isActive: true } });

    if (!campaign) {
      return NextResponse.json({
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      });
    }

    const campaignId = campaign.id;

    // Pagination
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const skip = (page - 1) * limit;

    // Search
    const search = searchParams.get("search") ?? "";

    // Filters
    const timezone = searchParams.get("timezone");
    const minAmount = searchParams.get("minAmount");
    const maxAmount = searchParams.get("maxAmount");
    const callStatus = searchParams.get("callStatus"); // NOT_CALLED, PENDING, RUNNING, COMPLETED, FAILED
    const callOutcome = searchParams.get("callOutcome"); // PAYMENT_PROMISED, DECLINED, etc.
    const emailOnly = searchParams.get("emailOnly"); // true, false

    // Build where clause
    const where: Record<string, unknown> = {
      campaignId, // Always filter by campaign
    };

    // Search across multiple fields
    if (search) {
      where.OR = [
        { debtorName: { contains: search } },
        { debtorEmail: { contains: search } },
        { phoneNumber: { contains: search } },
        { debtorMc: { contains: search } },
        { debtorDot: { contains: search } },
      ];
    }

    // Basic filters
    if (timezone) where.timezone = timezone;
    if (minAmount) where.totalAmount = { ...((where.totalAmount as object) || {}), gte: parseFloat(minAmount) };
    if (maxAmount) where.totalAmount = { ...((where.totalAmount as object) || {}), lte: parseFloat(maxAmount) };
    if (emailOnly === "true") where.emailOnly = true;
    if (emailOnly === "false") where.emailOnly = false;

    // Get debtors with call aggregation
    const [debtors, totalCount] = await Promise.all([
      prisma.debtor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { importedAt: "desc" },
        include: {
          calls: {
            orderBy: { attemptNumber: "desc" },
            take: 1, // Get latest call
          },
          invoices: {
            select: {
              id: true,
              loadNumber: true,
              amount: true,
              carrierName: true,
            },
          },
        },
      }),
      prisma.debtor.count({ where }),
    ]);

    // Post-filter by call status if needed
    let filteredDebtors = debtors;

    if (callStatus === "NOT_CALLED") {
      filteredDebtors = debtors.filter((debtor) => debtor.calls.length === 0);
    } else if (callStatus) {
      filteredDebtors = debtors.filter(
        (debtor) => debtor.calls[0]?.status === callStatus
      );
    }

    if (callOutcome) {
      filteredDebtors = filteredDebtors.filter(
        (debtor) => debtor.calls[0]?.callOutcome === callOutcome
      );
    }

    // Transform data to include call info
    const data = filteredDebtors.map((debtor) => {
      const latestCall = debtor.calls[0];
      return {
        id: debtor.id,
        // Debtor Info
        debtorNumber: debtor.debtorNumber,
        debtorName: debtor.debtorName,
        debtorMc: debtor.debtorMc,
        debtorDot: debtor.debtorDot,
        phoneNumber: debtor.phoneNumber,
        debtorEmail: debtor.debtorEmail,
        timezone: debtor.timezone,
        // Totals
        totalAmount: debtor.totalAmount,
        numInvoices: debtor.numInvoices,
        emailOnly: debtor.emailOnly,
        // Invoices
        invoices: debtor.invoices,
        // Import metadata
        importedAt: debtor.importedAt,
        // Call Data (added columns)
        callStatus: latestCall?.status ?? "NOT_CALLED",
        attemptNumber: latestCall?.attemptNumber ?? 0,
        callOutcome: latestCall?.callOutcome ?? null,
        promisedDate: latestCall?.promisedDate ?? null,
        promisedAmount: latestCall?.promisedAmount ?? null,
        callSummary: latestCall?.callSummary ?? null,
        followUpNeeded: latestCall?.followUpNeeded ?? false,
        lastCallAt: latestCall?.triggeredAt ?? null,
      };
    });

    return NextResponse.json({
      data,
      campaignId: campaign.id,
      campaignName: campaign.name,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("Debtors API error:", error);
    return NextResponse.json(
      { message: "Failed to fetch debtors" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const { id: campaignId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "10", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return NextResponse.json(
        { message: "Campaign not found" },
        { status: 404 }
      );
    }

    // Fetch recent calls with debtor info
    const calls = await prisma.call.findMany({
      where: { campaignId },
      include: {
        debtor: {
          select: {
            debtorName: true,
            phoneNumber: true,
            totalAmount: true,
          },
        },
      },
      orderBy: { completedAt: "desc" },
      take: limit,
      skip: offset,
    });

    // Get total count for pagination
    const total = await prisma.call.count({ where: { campaignId } });

    return NextResponse.json({
      calls: calls.map((call) => ({
        id: call.id,
        debtorName: call.debtor.debtorName,
        phoneNumber: call.debtor.phoneNumber,
        amount: call.debtor.totalAmount,
        status: call.status,
        callOutcome: call.callOutcome,
        callDuration: call.callDuration,
        callSummary: call.callSummary,
        callTags: call.callTags,
        promisedAmount: call.promisedAmount,
        promisedDate: call.promisedDate,
        completedAt: call.completedAt?.toISOString() ?? null,
        triggeredAt: call.triggeredAt?.toISOString() ?? null,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Error fetching campaign calls:", error);
    return NextResponse.json(
      { message: "Failed to fetch calls" },
      { status: 500 }
    );
  }
}

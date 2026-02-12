import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-api";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    // Get active campaign
    const campaign = await prisma.campaign.findFirst({
      where: { isActive: true },
    });

    if (!campaign) {
      return NextResponse.json([]);
    }

    const activeCalls = await prisma.call.findMany({
      where: {
        campaignId: campaign.id,
        status: "RUNNING",
      },
      include: {
        debtor: {
          select: {
            debtorNumber: true,
            debtorName: true,
            phoneNumber: true,
            timezone: true,
            totalAmount: true,
            numInvoices: true,
          },
        },
      },
      orderBy: { triggeredAt: "asc" },
    });

    return NextResponse.json(activeCalls);
  } catch (error) {
    console.error("Active calls error:", error);
    return NextResponse.json(
      { message: "Failed to fetch active calls" },
      { status: 500 }
    );
  }
}

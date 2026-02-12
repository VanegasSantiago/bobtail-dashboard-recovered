import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-api";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    // Get the active campaign
    const campaign = await prisma.campaign.findFirst({
      where: { isActive: true },
    });

    if (!campaign) {
      return NextResponse.json({
        sourceFile: null,
        importedAt: null,
        totalDebtors: 0,
        totalInvoices: 0,
        totalAmount: 0,
        emailOnlyDebtors: 0,
        maxConcurrent: 25,
        maxAttempts: 3,
        isQueuePaused: false,
        campaignId: null,
        campaignName: null,
      });
    }

    const [totalDebtors, totalInvoices, emailOnlyDebtors] = await Promise.all([
      prisma.debtor.count({ where: { campaignId: campaign.id } }),
      prisma.invoice.count({ where: { debtor: { campaignId: campaign.id } } }),
      prisma.debtor.count({ where: { campaignId: campaign.id, emailOnly: true } }),
    ]);

    return NextResponse.json({
      sourceFile: campaign.sourceFile,
      importedAt: campaign.createdAt,
      totalDebtors,
      totalInvoices,
      totalAmount: campaign.totalAmount,
      emailOnlyDebtors,
      maxConcurrent: campaign.maxConcurrent,
      maxAttempts: campaign.maxAttempts,
      isQueuePaused: campaign.isQueuePaused,
      campaignId: campaign.id,
      campaignName: campaign.name,
    });
  } catch (error) {
    console.error("Upload status error:", error);
    return NextResponse.json(
      { message: "Failed to fetch status" },
      { status: 500 }
    );
  }
}

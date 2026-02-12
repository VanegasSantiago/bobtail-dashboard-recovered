import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startWorker, stopWorker } from "@/lib/worker-manager";
import { requireAuth, requireOperator, requireAdmin } from "@/lib/auth-api";

/**
 * GET /api/campaigns/[id]
 *
 * Get a specific campaign's details.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return NextResponse.json(
        { message: "Campaign not found" },
        { status: 404 }
      );
    }

    // Get call statistics in a single query
    const statusGroups = await prisma.call.groupBy({
      by: ["status"],
      where: { campaignId: id },
      _count: { id: true },
    });

    const counts: Record<string, number> = {};
    for (const row of statusGroups) {
      counts[row.status] = row._count.id;
    }
    const pending = counts["PENDING"] ?? 0;
    const running = counts["RUNNING"] ?? 0;
    const completed = counts["COMPLETED"] ?? 0;
    const failed = counts["FAILED"] ?? 0;
    const totalCalls = pending + running + completed + failed;
    const processedCalls = completed + failed;
    const progress = totalCalls > 0 ? Math.round((processedCalls / totalCalls) * 100) : 0;

    return NextResponse.json({
      ...campaign,
      totalCalls,
      pending,
      running,
      completed,
      failed,
      progress,
    });
  } catch (error) {
    console.error("Campaign fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/campaigns/[id]
 *
 * Update a campaign (name, status, etc.)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Only operators and admins can update campaigns
  const authResult = await requireOperator();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, status } = body;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return NextResponse.json(
        { message: "Campaign not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (status) updateData.status = status;

    const updated = await prisma.campaign.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Campaign update error:", error);
    return NextResponse.json(
      { message: "Failed to update campaign" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns/[id]/activate
 *
 * Activate a specific campaign (deactivates others).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Only operators and admins can activate/archive campaigns
  const authResult = await requireOperator();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    const campaign = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return NextResponse.json(
        { message: "Campaign not found" },
        { status: 404 }
      );
    }

    if (action === "activate") {
      // Stop current worker if running
      stopWorker();

      // Deactivate all other campaigns
      await prisma.campaign.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      // Activate this campaign
      await prisma.campaign.update({
        where: { id },
        data: {
          isActive: true,
          status: "ACTIVE",
          isQueuePaused: false,
        },
      });

      // Start worker for the new campaign
      const workerResult = startWorker();

      return NextResponse.json({
        success: true,
        message: `Campaign "${campaign.name}" activated`,
        workerStarted: workerResult.success,
      });
    }

    if (action === "archive") {
      // Can't archive active campaign
      if (campaign.isActive) {
        return NextResponse.json(
          { message: "Cannot archive the active campaign. Activate another campaign first." },
          { status: 400 }
        );
      }

      await prisma.campaign.update({
        where: { id },
        data: { status: "ARCHIVED" },
      });

      return NextResponse.json({
        success: true,
        message: `Campaign "${campaign.name}" archived`,
      });
    }

    return NextResponse.json(
      { message: "Invalid action. Use ?action=activate or ?action=archive" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Campaign action error:", error);
    return NextResponse.json(
      { message: "Failed to perform action" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/campaigns/[id]
 *
 * Delete a campaign (only if not active and archived).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Only admins can delete campaigns
  const authResult = await requireAdmin();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return NextResponse.json(
        { message: "Campaign not found" },
        { status: 404 }
      );
    }

    if (campaign.isActive) {
      return NextResponse.json(
        { message: "Cannot delete the active campaign. Activate another campaign first." },
        { status: 400 }
      );
    }

    // Delete campaign (cascades to debtors, invoices, calls)
    await prisma.campaign.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Campaign "${campaign.name}" deleted`,
    });
  } catch (error) {
    console.error("Campaign delete error:", error);
    return NextResponse.json(
      { message: "Failed to delete campaign" },
      { status: 500 }
    );
  }
}

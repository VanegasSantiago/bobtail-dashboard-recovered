import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/webhook/call-complete
 *
 * Webhook endpoint to receive call completion data from HappyRobot.
 * Secured via WEBHOOK_SECRET in the x-webhook-secret header.
 *
 * Payload: { runId: string, callOutcome: string }
 * callOutcome is the tag string, e.g. "Call Successful - Load is Scheduled for Payment to Bobtail"
 */

export async function POST(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Webhook] WEBHOOK_SECRET environment variable is not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const providedSecret = req.headers.get("x-webhook-secret");
  if (providedSecret !== secret) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    const { runId, callOutcome } = body;
    if (!runId) {
      return NextResponse.json(
        { error: "runId is required" },
        { status: 400 }
      );
    }
    if (!callOutcome || typeof callOutcome !== "string") {
      return NextResponse.json(
        { error: "callOutcome is required and must be a string" },
        { status: 400 }
      );
    }

    const call = await prisma.call.findUnique({ where: { runId } });
    if (!call) {
      return NextResponse.json(
        { error: `Call not found for runId=${runId}` },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      callOutcome,
    };

    if (call.status === "RUNNING" || call.status === "QUEUED" || call.status === "PENDING") {
      updateData.status = "COMPLETED";
      updateData.completedAt = new Date();
    }

    const updated = await prisma.call.update({
      where: { id: call.id },
      data: updateData,
    });

    console.log(`[Webhook] Updated call ${call.id}: outcome=${updated.callOutcome}`);

    return NextResponse.json({
      success: true,
      callId: updated.id,
      runId: updated.runId,
      callOutcome: updated.callOutcome,
      status: updated.status,
    });
  } catch (error) {
    console.error("[Webhook] Error processing call-complete:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Debug endpoint to see what HappyRobot returned for a completed call
 * GET /api/debug/call-response?callId=xxx
 * GET /api/debug/call-response (returns most recent completed call)
 *
 * NOTE: No auth required temporarily for debugging
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const callId = searchParams.get("callId");

    let call;
    if (callId) {
      call = await prisma.call.findUnique({
        where: { id: callId },
        include: { debtor: true },
      });
    } else {
      // Find most recent completed call with metadata
      call = await prisma.call.findFirst({
        where: {
          status: { in: ["COMPLETED", "FAILED", "CANCELED"] },
        },
        orderBy: { completedAt: "desc" },
        include: { debtor: true },
      });
    }

    if (!call) {
      return NextResponse.json({
        error: "No completed calls found. Pass ?callId=xxx to view a specific call.",
      });
    }

    // Parse metadata if it's JSON
    let parsedMetadata = null;
    if (call.metadata) {
      try {
        parsedMetadata = JSON.parse(call.metadata);
      } catch {
        parsedMetadata = call.metadata; // Not JSON, return as-is
      }
    }

    return NextResponse.json({
      callId: call.id,
      debtorName: call.debtor?.debtorName,
      phoneNumber: call.debtor?.phoneNumber,
      runId: call.runId,
      status: call.status,
      callOutcome: call.callOutcome,
      callDuration: call.callDuration,
      callSummary: call.callSummary,
      triggeredAt: call.triggeredAt,
      completedAt: call.completedAt,
      errorMessage: call.errorMessage,
      // The raw HappyRobot response
      rawMetadata: parsedMetadata,
      // Help identify the structure
      metadataInfo: parsedMetadata ? {
        hasEvents: Array.isArray(parsedMetadata.events),
        eventsCount: parsedMetadata.events?.length ?? 0,
        eventTypes: parsedMetadata.events?.map((e: Record<string, unknown>) => ({
          type: e.type,
          integration_name: e.integration_name,
          event_name: e.event_name,
          outputKeys: e.output ? Object.keys(e.output as object) : null,
        })),
      } : null,
    });
  } catch (error) {
    console.error("Debug call-response error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

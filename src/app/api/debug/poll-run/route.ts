import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const HAPPYROBOT_API_KEY = process.env.HAPPYROBOT_API_KEY!;
const HAPPYROBOT_ORG_ID = process.env.HAPPYROBOT_ORG_ID!;

// Debug endpoint to see what HappyRobot returns for a run
// NOTE: No auth required temporarily for debugging
export async function GET(req: NextRequest) {

  try {
    // Get runId from query param or find most recent call with a runId
    const searchParams = req.nextUrl.searchParams;
    let runId = searchParams.get("runId");

    // If no runId provided, find the most recent call with a runId
    if (!runId) {
      const recentCall = await prisma.call.findFirst({
        where: {
          runId: { not: null },
        },
        orderBy: { updatedAt: "desc" },
        select: { runId: true, status: true },
      });

      if (!recentCall?.runId) {
        return NextResponse.json({
          error: "No calls with runId found. Pass ?runId=xxx to poll a specific run.",
        });
      }
      runId = recentCall.runId;
    }

    // Poll using v1 API for full run details
    console.log(`[Debug Poll] Fetching run: ${runId} via v1 API`);

    const response = await fetch(
      `https://platform.happyrobot.ai/api/v1/runs/${runId}`,
      {
        headers: {
          "Authorization": `Bearer ${HAPPYROBOT_API_KEY}`,
          "x-organization-id": HAPPYROBOT_ORG_ID,
        },
      }
    );

    const responseStatus = response.status;
    const responseText = await response.text();

    let parsedData = null;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      // Not JSON
    }

    return NextResponse.json({
      runId,
      httpStatus: responseStatus,
      httpOk: response.ok,
      parsedResponse: parsedData,
      // Highlight the fields we care about
      extractedFields: parsedData ? {
        status: parsedData.status,
        completed_at: parsedData.completed_at,
        eventsCount: parsedData.events?.length ?? 0,
        events: parsedData.events?.map((e: { type: string; integration_name?: string; event_name?: string; output?: unknown }) => ({
          type: e.type,
          integration_name: e.integration_name,
          event_name: e.event_name,
          hasOutput: !!e.output,
        })),
      } : null,
    });
  } catch (error) {
    console.error("Debug poll error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

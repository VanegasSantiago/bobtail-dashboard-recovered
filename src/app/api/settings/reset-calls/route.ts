import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-api";

export async function POST() {
  // Only admins can reset calls
  const authResult = await requireAdmin();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    // Delete all calls
    await prisma.call.deleteMany();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset calls error:", error);
    return NextResponse.json(
      { message: "Failed to reset calls" },
      { status: 500 }
    );
  }
}

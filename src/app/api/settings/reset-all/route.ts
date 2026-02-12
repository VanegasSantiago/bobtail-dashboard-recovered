import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-api";

export async function POST() {
  // Only admins can reset all data
  const authResult = await requireAdmin();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    // Delete all data in order (due to foreign key constraints)
    // Calls first, then invoices, then debtors, then campaigns
    await prisma.call.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.debtor.deleteMany();
    await prisma.campaign.deleteMany();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Full reset error:", error);
    return NextResponse.json(
      { message: "Failed to reset" },
      { status: 500 }
    );
  }
}

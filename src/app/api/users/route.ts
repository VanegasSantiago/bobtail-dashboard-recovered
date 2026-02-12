import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/auth-api";

/**
 * GET /api/users
 *
 * Returns list of all users (admin only).
 */
export async function GET() {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Users fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users
 *
 * Update a user's role (admin only).
 */
export async function PATCH(request: Request) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const { userId, role } = await request.json();

    if (!userId || !role) {
      return NextResponse.json(
        { message: "userId and role are required" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["ADMIN", "OPERATOR", "VIEWER"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { message: "Invalid role. Must be ADMIN, OPERATOR, or VIEWER" },
        { status: 400 }
      );
    }

    // Prevent admin from removing their own admin role
    if (authResult.user?.id === userId && role !== "ADMIN") {
      return NextResponse.json(
        { message: "You cannot remove your own admin role" },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("User update error:", error);
    return NextResponse.json(
      { message: "Failed to update user" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users
 *
 * Delete a user (admin only).
 */
export async function DELETE(request: Request) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { message: "userId is required" },
        { status: 400 }
      );
    }

    // Prevent admin from deleting themselves
    if (authResult.user?.id === userId) {
      return NextResponse.json(
        { message: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("User delete error:", error);
    return NextResponse.json(
      { message: "Failed to delete user" },
      { status: 500 }
    );
  }
}

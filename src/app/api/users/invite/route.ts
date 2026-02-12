import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-api";
import { Resend } from "resend";

// Lazy-initialize Resend to avoid build-time errors when env var is missing
let resend: Resend | null = null;
function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * Send invite email to a new user
 */
async function sendInviteEmail({
  to,
  invitedBy,
  role,
}: {
  to: string;
  invitedBy: string;
  role: string;
}) {
  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const loginUrl = `${appUrl}/login`;
  const roleDisplay = role.charAt(0) + role.slice(1).toLowerCase();

  const result = await getResend().emails.send({
    from: process.env.EMAIL_FROM || "Bobtail Collections <onboarding@resend.dev>",
    to: [to],
    subject: "You've been invited to Bobtail Collections",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
                  <tr>
                    <td style="padding: 40px;">
                      <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #18181b;">
                        Bobtail Collections
                      </h1>
                      <p style="margin: 0 0 32px 0; font-size: 14px; color: #71717a;">
                        AI-Powered Payment Collection
                      </p>

                      <p style="margin: 0 0 16px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
                        Hi there,
                      </p>

                      <p style="margin: 0 0 24px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
                        <strong>${invitedBy}</strong> has invited you to join Bobtail Collections as a <strong>${roleDisplay}</strong>.
                      </p>

                      <a href="${loginUrl}" style="display: inline-block; padding: 14px 28px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 500; border-radius: 8px;">
                        Sign in to get started
                      </a>

                      <p style="margin: 32px 0 0 0; font-size: 14px; color: #71717a; line-height: 1.6;">
                        Just sign in with this email address (${to}) and you'll automatically be set up with ${roleDisplay} access.
                      </p>

                      <hr style="margin: 32px 0; border: none; border-top: 1px solid #e4e4e7;">

                      <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                        This invite expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });

  console.log("Resend email result:", JSON.stringify(result, null, 2));

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }

  return result;
}

/**
 * POST /api/users/invite
 *
 * Invite a new user by email (admin only).
 * Creates an invite record with the specified role.
 * The invited user will get this role when they sign up.
 */
export async function POST(request: Request) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const { email, role } = await request.json();

    if (!email) {
      return NextResponse.json(
        { message: "Email is required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["ADMIN", "OPERATOR", "VIEWER"];
    const assignRole = validRoles.includes(role) ? role : "VIEWER";

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "A user with this email already exists" },
        { status: 400 }
      );
    }

    // Check if invite already exists
    const existingInvite = await prisma.invite.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingInvite) {
      // Update existing invite with new role
      await prisma.invite.update({
        where: { email: email.toLowerCase() },
        data: {
          role: assignRole,
          invitedBy: authResult.user?.email || "unknown",
        },
      });

      // Try to resend invite email
      let emailSent = false;
      try {
        await sendInviteEmail({
          to: email.toLowerCase(),
          invitedBy: authResult.user?.email || "Admin",
          role: assignRole,
        });
        emailSent = true;
      } catch (emailError) {
        console.warn("Failed to send invite email:", emailError);
      }

      return NextResponse.json({
        success: true,
        message: emailSent
          ? "Invite updated and email resent"
          : "Invite updated. Please tell them to sign in with this email.",
        emailSent,
        email: email.toLowerCase(),
        role: assignRole,
      });
    }

    // Create new invite (explicitly set expiresAt since dbgenerated may not work with Prisma)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    await prisma.invite.create({
      data: {
        email: email.toLowerCase(),
        role: assignRole,
        invitedBy: authResult.user?.email || "unknown",
        expiresAt,
      },
    });

    // Try to send invite email (may fail if domain not verified in Resend)
    let emailSent = false;
    try {
      await sendInviteEmail({
        to: email.toLowerCase(),
        invitedBy: authResult.user?.email || "Admin",
        role: assignRole,
      });
      emailSent = true;
    } catch (emailError) {
      console.warn("Failed to send invite email (domain may not be verified):", emailError);
      // Continue - invite is still created, user can sign in manually
    }

    return NextResponse.json({
      success: true,
      message: emailSent
        ? "Invite created and email sent"
        : "Invite created. Please tell them to sign in with this email.",
      emailSent,
      email: email.toLowerCase(),
      role: assignRole,
    });
  } catch (error) {
    console.error("Invite error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { message: "Failed to create invite", error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/users/invite
 *
 * Get all pending invites (admin only).
 */
export async function GET() {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const invites = await prisma.invite.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ invites });
  } catch (error) {
    console.error("Invites fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch invites" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/invite
 *
 * Delete a pending invite (admin only).
 */
export async function DELETE(request: Request) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { message: "Email is required" },
        { status: 400 }
      );
    }

    await prisma.invite.delete({
      where: { email: email.toLowerCase() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Invite delete error:", error);
    return NextResponse.json(
      { message: "Failed to delete invite" },
      { status: 500 }
    );
  }
}

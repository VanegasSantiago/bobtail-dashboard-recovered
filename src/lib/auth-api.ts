import { auth, canOperate, canManageUsers, type Role } from "./auth"
import { NextResponse } from "next/server"

export type AuthResult = {
  authenticated: true
  user: {
    id: string
    email: string
    role: Role
  }
} | {
  authenticated: false
  response: NextResponse
}

/**
 * Check if the request is authenticated and return user info.
 * Returns a NextResponse if not authenticated.
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await auth()

  if (!session?.user) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    }
  }

  return {
    authenticated: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    },
  }
}

/**
 * Check if the user can operate (ADMIN or OPERATOR).
 * Returns a NextResponse if not authorized.
 */
export async function requireOperator(): Promise<AuthResult> {
  const result = await requireAuth()

  if (!result.authenticated) {
    return result
  }

  if (!canOperate(result.user.role)) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Forbidden: Operator access required" },
        { status: 403 }
      ),
    }
  }

  return result
}

/**
 * Check if the user can manage users (ADMIN only).
 * Returns a NextResponse if not authorized.
 */
export async function requireAdmin(): Promise<AuthResult> {
  const result = await requireAuth()

  if (!result.authenticated) {
    return result
  }

  if (!canManageUsers(result.user.role)) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      ),
    }
  }

  return result
}

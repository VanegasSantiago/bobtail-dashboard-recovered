import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Routes that don't require authentication
const publicRoutes = [
  "/login",
  "/login/verify",
  "/login/error",
  "/api/auth",
  "/api/health",
]

// API routes handle their own authentication via auth-api helpers
// This prevents redirect loops and allows proper 401 JSON responses
const apiRoutes = ["/api/"]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public routes
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  )

  if (isPublicRoute) {
    return NextResponse.next()
  }

  // Let API routes handle their own authentication
  // They use auth-api helpers to return proper 401 JSON responses
  const isApiRoute = apiRoutes.some((route) => pathname.startsWith(route))
  if (isApiRoute) {
    return NextResponse.next()
  }

  // Check for session cookie (NextAuth v5 uses authjs.session-token)
  const sessionToken = req.cookies.get("authjs.session-token")?.value
    || req.cookies.get("__Secure-authjs.session-token")?.value

  if (!sessionToken) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Session exists - let the request through
  // The actual session validation happens in the auth() call on pages/API routes
  return NextResponse.next()
}

export const config = {
  // Match all routes except static files and _next
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$).*)",
  ],
}

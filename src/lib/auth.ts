import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Resend from "next-auth/providers/resend"
import Google from "next-auth/providers/google"
import { prisma } from "./prisma"

// Role hierarchy for permission checks
export const ROLES = {
  ADMIN: "ADMIN",
  OPERATOR: "OPERATOR",
  VIEWER: "VIEWER",
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

// Role permissions
const ROLE_PERMISSIONS = {
  ADMIN: ["view", "operate", "manage_users", "manage_settings"],
  OPERATOR: ["view", "operate"],
  VIEWER: ["view"],
} as const

export function hasPermission(role: Role, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission as never) ?? false
}

export function canOperate(role: Role): boolean {
  return hasPermission(role, "operate")
}

export function canManageUsers(role: Role): boolean {
  return hasPermission(role, "manage_users")
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Use JWT sessions to avoid Prisma in edge runtime
  session: {
    strategy: "jwt",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || "Bobtail Collections <onboarding@resend.dev>",
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
    error: "/login/error",
  },
  callbacks: {
    async signIn({ user }) {
      // Allow hardcoded admin
      const adminEmail = process.env.ADMIN_EMAIL
      if (adminEmail && user.email === adminEmail) {
        return true
      }

      // Check if user already exists in database
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email! },
      })
      if (existingUser) {
        return true
      }

      // Check if user has a pending invite
      const invite = await prisma.invite.findUnique({
        where: { email: user.email!.toLowerCase() },
      })
      if (invite) {
        return true
      }

      // Reject sign-in - user not invited
      return false
    },
    async jwt({ token, user }) {
      // On sign in, add user data to token
      if (user) {
        token.id = user.id
        token.email = user.email

        // Check if user is the hardcoded admin
        const adminEmail = process.env.ADMIN_EMAIL
        if (adminEmail && user.email === adminEmail) {
          token.role = ROLES.ADMIN
        } else {
          // Get role from database (only on sign in, not every request)
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true },
          })
          token.role = (dbUser?.role as Role) || ROLES.VIEWER
        }
      }
      return token
    },
    async session({ session, token }) {
      // Add token data to session
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.role = (token.role as Role) || ROLES.VIEWER
      }
      return session
    },
  },
  events: {
    async createUser({ user }) {
      // Check if user is the hardcoded admin
      const adminEmail = process.env.ADMIN_EMAIL
      if (adminEmail && user.email === adminEmail) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: ROLES.ADMIN },
        })
        return
      }

      // Check if user was invited and apply invited role
      if (user.email) {
        const invite = await prisma.invite.findUnique({
          where: { email: user.email.toLowerCase() },
        })

        if (invite) {
          // Apply the invited role
          await prisma.user.update({
            where: { id: user.id },
            data: { role: invite.role },
          })

          // Delete the invite since it's been used
          await prisma.invite.delete({
            where: { email: user.email.toLowerCase() },
          })
        }
      }
    },
  },
})

// Type augmentation for NextAuth
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: Role
    }
  }
}

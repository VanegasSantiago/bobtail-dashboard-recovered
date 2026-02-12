import { handlers } from "@/lib/auth"

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = "nodejs"

export const { GET, POST } = handlers

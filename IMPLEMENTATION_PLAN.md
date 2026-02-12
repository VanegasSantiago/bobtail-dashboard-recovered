# Authentication & Authorization Implementation Plan

## Context

This is an **internal dashboard for Bobtail** (enterprise client), not a SaaS product.
- **You (Arav) are the only admin** - hardcoded via environment variable
- Users cannot self-register - they must be invited
- Simple role system: Admin, Operator, Viewer

---

## Requirements

### Roles & Permissions

| Role | View Data | Start/Pause Campaign | Upload CSV | Manage Users |
|------|-----------|---------------------|------------|--------------|
| **Viewer** | ✓ | ✗ | ✗ | ✗ |
| **Operator** | ✓ | ✓ | ✓ | ✗ |
| **Admin** | ✓ | ✓ | ✓ | ✓ |

### User Flow
1. Admin (you) is defined by `ADMIN_EMAIL` env var - always has admin access
2. Admin invites users from Settings page (email + role)
3. Invited user receives magic link email
4. User clicks link → authenticated → can access based on their role
5. Users without invites cannot access the system

---

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Auth Library | **NextAuth.js v5** | Industry standard, free, App Router support |
| Auth Method | **Email Magic Link** | No passwords, simple, secure |
| Email Provider | **Resend** | Free tier (3k/month), simple API |
| Session Storage | **Database** | Allows session revocation |

---

## Database Schema Changes

Add to `prisma/schema.prisma`:

```prisma
// ═══════════════════════════════════════════════════════════════════════════
// AUTH MODELS
// ═══════════════════════════════════════════════════════════════════════════

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  name          String?
  role          String    @default("VIEWER") // ADMIN, OPERATOR, VIEWER

  // NextAuth.js fields
  emailVerified DateTime? @map("email_verified")

  // Timestamps
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  // Relations
  accounts      Account[]
  sessions      Session[]

  @@map("users")
}

model Account {
  id                String  @id @default(uuid())
  userId            String  @map("user_id")
  type              String
  provider          String
  providerAccountId String  @map("provider_account_id")
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(uuid())
  sessionToken String   @unique @map("session_token")
  userId       String   @map("user_id")
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}

model Invite {
  id        String   @id @default(uuid())
  email     String   @unique
  role      String   @default("VIEWER") // Role to assign when user accepts
  token     String   @unique @default(uuid())
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@map("invites")
}
```

---

## File Structure (New/Modified Files)

```
src/
├── app/
│   ├── (app)/                      # Protected routes (existing)
│   │   ├── settings/
│   │   │   └── page.tsx            # NEW: Team management (admin only)
│   │   └── ...
│   ├── (auth)/                     # NEW: Public auth routes
│   │   ├── login/
│   │   │   └── page.tsx            # Login page
│   │   ├── verify/
│   │   │   └── page.tsx            # "Check your email" page
│   │   ├── invite/
│   │   │   └── [token]/
│   │   │       └── page.tsx        # Accept invite page
│   │   └── layout.tsx              # Minimal auth layout
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts        # NEW: NextAuth handler
│       └── users/
│           ├── route.ts            # NEW: GET list, POST invite
│           └── [id]/
│               └── route.ts        # NEW: PATCH role, DELETE user
├── lib/
│   ├── auth.ts                     # NEW: NextAuth config
│   └── auth-utils.ts               # NEW: Role helpers
├── components/
│   ├── auth/
│   │   ├── login-form.tsx          # NEW: Email input
│   │   └── user-menu.tsx           # NEW: User dropdown
│   └── layout/
│       └── nav-rail.tsx            # MODIFY: Add user menu, settings link
└── middleware.ts                   # NEW: Route protection
```

---

## Implementation Phases

### Phase 1: Database & Dependencies
**Goal:** Set up auth infrastructure

1. Update `prisma/schema.prisma` with auth models
2. Run `npm run db:push` to update database
3. Install dependencies:
   ```bash
   npm install next-auth@beta @auth/prisma-adapter resend
   ```
4. Update `.env.example` with new variables
5. Generate Prisma client

**Test:**
- [ ] Database migrates successfully
- [ ] Dependencies install without conflicts

---

### Phase 2: NextAuth Configuration
**Goal:** Core auth working with magic links

Files to create:
- `src/lib/auth.ts` - NextAuth configuration
- `src/app/api/auth/[...nextauth]/route.ts` - Auth API handler
- `src/middleware.ts` - Route protection

**Auth Logic:**
```
1. User requests login with email
2. Check: Does user exist in DB OR does invite exist for email?
   - Yes → Send magic link
   - No → Reject ("You need an invite to access this system")
3. User clicks magic link → Session created
4. If user was invited, create User record with role from Invite, delete Invite
```

**Admin Detection:**
```typescript
// In auth callbacks
const isAdmin = user.email === process.env.ADMIN_EMAIL;
if (isAdmin) {
  user.role = "ADMIN"; // Always admin regardless of DB
}
```

**Test:**
- [ ] Unauthenticated user visiting `/` redirects to `/login`
- [ ] Email not in system AND not invited → error message
- [ ] `ADMIN_EMAIL` can always log in
- [ ] Magic link arrives in email
- [ ] Clicking magic link logs user in

---

### Phase 3: Login UI
**Goal:** Clean login experience

Files to create:
- `src/app/(auth)/layout.tsx` - Minimal centered layout
- `src/app/(auth)/login/page.tsx` - Email input form
- `src/app/(auth)/verify/page.tsx` - "Check your email" message
- `src/components/auth/login-form.tsx` - Form component

**UI:**
- Centered card with Bobtail logo
- Email input + "Send magic link" button
- Error state for unauthorized emails
- Success state redirects to /verify

**Test:**
- [ ] Login page matches app theme (dark/light)
- [ ] Form validates email format
- [ ] Error shown for non-invited emails
- [ ] Success redirects to verify page
- [ ] Verify page shows "check your email" message

---

### Phase 4: User Menu & Session Display
**Goal:** Show logged-in user, allow logout

Files to create:
- `src/components/auth/user-menu.tsx` - Dropdown with user info

Files to modify:
- `src/components/layout/nav-rail.tsx` - Add user menu at bottom

**User Menu Contents:**
- User email
- User role badge
- "Settings" link (admin only)
- "Sign out" button

**Test:**
- [ ] User email displayed in nav
- [ ] Role badge shows correctly
- [ ] Sign out works
- [ ] After sign out, redirected to login

---

### Phase 5: Role-Based UI
**Goal:** Hide actions based on role

Files to create:
- `src/lib/auth-utils.ts` - Role checking helpers
- Hooks: `useCurrentUser()`, `useRequireRole()`

Files to modify:
- Dashboard page - hide upload for viewers
- Active calls bar - hide pause/resume for viewers
- Campaign pages - hide start/pause for viewers
- Nav rail - hide settings for non-admins

**Helper Functions:**
```typescript
// Check if user can perform action
function canPerform(role: string, action: 'view' | 'operate' | 'admin'): boolean

// React hook
function useCurrentUser(): { user: User | null, isAdmin: boolean, isOperator: boolean, isViewer: boolean }
```

**Test:**
- [ ] **Viewer** sees dashboard but no action buttons
- [ ] **Operator** sees action buttons, no settings link
- [ ] **Admin** sees everything including settings

---

### Phase 6: API Route Protection
**Goal:** Server-side authorization

Files to create:
- `src/lib/auth-utils.ts` - Add `requireRole()` helper

Files to modify:
- All mutation API routes need role checks

**Protected Endpoints:**

| Endpoint | Required Role |
|----------|---------------|
| `GET /api/*` (reads) | Any authenticated |
| `POST /api/upload` | Operator+ |
| `POST /api/campaign/start` | Operator+ |
| `POST /api/campaign/pause` | Operator+ |
| `POST /api/settings/reset-*` | Admin |
| `GET /api/users` | Admin |
| `POST /api/users` | Admin |
| `PATCH /api/users/[id]` | Admin |
| `DELETE /api/users/[id]` | Admin |

**Test:**
- [ ] Viewer calling `POST /api/campaign/start` → 403
- [ ] Operator calling `POST /api/campaign/start` → 200
- [ ] Operator calling `POST /api/users` → 403
- [ ] Admin calling any endpoint → allowed
- [ ] Unauthenticated calling any endpoint → 401

---

### Phase 7: Settings Page (Admin Only)
**Goal:** Admin can manage team

Files to create:
- `src/app/(app)/settings/page.tsx` - Settings page

**Page Sections:**

1. **Your Profile**
   - Email, role (read-only for admin)

2. **Team Members**
   - Table: Email | Role | Actions
   - Edit role dropdown
   - Remove button with confirmation

3. **Invite User**
   - Email input
   - Role dropdown (Viewer, Operator)
   - Send invite button

**Test:**
- [ ] Non-admins visiting `/settings` → redirected or 403
- [ ] Admin sees list of all users
- [ ] Admin can change user role
- [ ] Admin can remove user
- [ ] Admin can send invite

---

### Phase 8: Invite Flow
**Goal:** Complete invite-to-access flow

Files to create:
- `src/app/(auth)/invite/[token]/page.tsx` - Accept invite page
- `src/app/api/users/route.ts` - POST to create invite

**Flow:**
1. Admin enters email + role on settings page
2. API creates Invite record + sends email via Resend
3. Email contains link: `/invite/[token]`
4. User clicks link → page shows "You've been invited" + email field
5. User enters email → magic link sent
6. On auth callback:
   - Find invite by email
   - Create User with role from invite
   - Delete invite
   - Create session

**Email Template:**
```
Subject: You've been invited to Bobtail Collections

You've been invited to access the Bobtail Collections dashboard.

Click here to accept: {link}

This invite expires in 7 days.
```

**Test:**
- [ ] Admin invites user@example.com as Operator
- [ ] User receives email with invite link
- [ ] User clicks link, sees invite acceptance page
- [ ] User enters email, receives magic link
- [ ] User clicks magic link, logged in as Operator
- [ ] Invite is deleted after use
- [ ] Expired invite shows error

---

## Environment Variables

Add to `.env`:

```env
# ═══════════════════════════════════════════════════════════════════════════
# Authentication
# ═══════════════════════════════════════════════════════════════════════════

# NextAuth secret - generate with: openssl rand -base64 32
AUTH_SECRET="generate-a-secret-here"

# Your app URL (for callbacks)
NEXTAUTH_URL="http://localhost:3000"

# Admin email - this user ALWAYS has admin access
ADMIN_EMAIL="arav@happyrobot.ai"

# Resend API key for sending emails
RESEND_API_KEY="re_xxxxx"

# Email "from" address (must be verified in Resend)
EMAIL_FROM="Bobtail Collections <noreply@yourdomain.com>"
```

---

## Security Considerations

| Risk | Mitigation |
|------|------------|
| Unauthorized access | Only invited emails can authenticate |
| Session hijacking | httpOnly secure cookies, DB sessions |
| Role escalation | Server-side role checks on all mutations |
| Invite link theft | 7-day expiry, single-use tokens |
| Admin lockout | `ADMIN_EMAIL` env var always works |
| CSRF attacks | NextAuth handles CSRF tokens |

---

## Testing Checklist

### Authentication
- [ ] Unauthenticated → redirected to /login
- [ ] Non-invited email → "You need an invite" error
- [ ] `ADMIN_EMAIL` → always can log in as admin
- [ ] Magic link → logs user in
- [ ] Session persists across refreshes
- [ ] Sign out → session destroyed

### Authorization (UI)
- [ ] Viewer: No upload, no start/pause, no settings
- [ ] Operator: Has upload, start/pause; no settings
- [ ] Admin: Has everything including settings

### Authorization (API)
- [ ] Viewer → `POST /api/campaign/start` = 403
- [ ] Operator → `POST /api/campaign/start` = 200
- [ ] Operator → `POST /api/users` = 403
- [ ] Admin → all endpoints work

### Invite Flow
- [ ] Admin can invite user with role
- [ ] User receives email
- [ ] User can accept invite and log in
- [ ] User gets correct role
- [ ] Expired invite rejected
- [ ] Used invite deleted

### Settings Page
- [ ] Only admin can access
- [ ] Shows all users
- [ ] Can change roles
- [ ] Can remove users
- [ ] Can send invites

---

## Rollback Plan

If auth breaks in production:

1. The `ADMIN_EMAIL` user can always access with admin rights
2. Sessions stored in DB can be cleared: `DELETE FROM sessions`
3. If needed, remove middleware temporarily to bypass auth

---

## Post-Implementation

- [ ] Update README with auth documentation
- [ ] Add Resend setup instructions
- [ ] Document invite flow for future reference
- [ ] Test full flow in production environment

export default function VerifyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
      <div className="w-full max-w-md p-8 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-[var(--accent-primary)]/10 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[var(--accent-primary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[var(--fg-primary)] mb-2">
          Check your email
        </h1>
        <p className="text-[var(--fg-secondary)] mb-6">
          We sent you a magic link. Click the link in the email to sign in.
        </p>

        <div className="p-4 rounded-lg bg-[var(--bg-raised)] border border-[var(--border-primary)]">
          <p className="text-sm text-[var(--fg-muted)]">
            Didn&apos;t receive the email? Check your spam folder or{" "}
            <a
              href="/login"
              className="text-[var(--accent-primary)] hover:underline"
            >
              try again
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

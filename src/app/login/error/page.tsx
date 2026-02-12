"use client"

import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

function ErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get("error")

  const errorMessages: Record<string, string> = {
    Configuration: "There is a problem with the server configuration.",
    AccessDenied: "You need an invitation to access this app. Please contact your administrator.",
    Verification: "The magic link has expired or has already been used.",
    Default: "An error occurred during sign in.",
  }

  const message = errorMessages[error || ""] || errorMessages.Default

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
      <div className="w-full max-w-md p-8 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[var(--fg-primary)] mb-2">
          Sign in error
        </h1>
        <p className="text-[var(--fg-secondary)] mb-6">{message}</p>

        <a
          href="/login"
          className="inline-block py-3 px-6 rounded-lg bg-[var(--accent-primary)] text-white font-medium hover:opacity-90 transition-opacity"
        >
          Try again
        </a>
      </div>
    </div>
  )
}

export default function ErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
        <p className="text-[var(--fg-secondary)]">Loading...</p>
      </div>
    }>
      <ErrorContent />
    </Suspense>
  )
}

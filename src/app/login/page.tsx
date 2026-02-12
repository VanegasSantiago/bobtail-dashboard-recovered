"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [error, setError] = useState("")

  async function handleGoogleSignIn() {
    setIsGoogleLoading(true)
    setError("")
    try {
      await signIn("google", { callbackUrl: "/" })
    } catch {
      setError("Failed to sign in with Google. Please try again.")
      setIsGoogleLoading(false)
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const result = await signIn("resend", {
        email,
        callbackUrl: "/",
        redirect: false,
      })

      if (result?.error) {
        setError("Failed to send magic link. Please try again.")
        setIsLoading(false)
      } else {
        // Redirect to verify page
        window.location.href = "/login/verify"
      }
    } catch {
      setError("Something went wrong. Please try again.")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--fg-primary)] mb-2">
            Bobtail Collections
          </h1>
          <p className="text-[var(--fg-secondary)]">
            Sign in to continue
          </p>
        </div>

        <div className="space-y-4">
          {/* Google Sign In Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className="w-full py-3 px-4 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-raised)] text-[var(--fg-primary)] font-medium hover:bg-[var(--bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--bg-base)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-3"
          >
            {isGoogleLoading ? (
              <span>Signing in...</span>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border-primary)]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-[var(--bg-base)] text-[var(--fg-muted)]">
                or
              </span>
            </div>
          </div>

          {/* Magic Link Option */}
          {!showEmailForm ? (
            <button
              onClick={() => setShowEmailForm(true)}
              className="w-full py-3 px-4 rounded-lg border border-[var(--border-primary)] bg-transparent text-[var(--fg-secondary)] font-medium hover:bg-[var(--bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--bg-base)] transition-colors"
            >
              Continue with email
            </button>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-raised)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !email}
                className="w-full py-3 px-4 rounded-lg bg-[var(--accent-primary)] text-white font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--bg-base)] disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {isLoading ? "Sending..." : "Send magic link"}
              </button>
              <button
                type="button"
                onClick={() => setShowEmailForm(false)}
                className="w-full text-sm text-[var(--fg-muted)] hover:text-[var(--fg-secondary)] transition-colors"
              >
                Back
              </button>
            </form>
          )}

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}
        </div>

      </div>
    </div>
  )
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

// Navigation items
const navItems = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/campaigns", label: "Campaigns", icon: "folder" },
  { href: "/active", label: "Active Calls", icon: "activity" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/debtors", label: "Debtors", icon: "users" },
];

const bottomItems = [
  { label: "Reset", icon: "trash", action: "reset" },
];

// Simple SVG icons
function Icon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const icons: Record<string, React.ReactNode> = {
    dashboard: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="3" y="3" width="7" height="9" rx="1" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="14" y="3" width="7" height="5" rx="1" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="14" y="12" width="7" height="9" rx="1" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="16" width="7" height="5" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    users: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    play: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
        <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
      </svg>
    ),
    activity: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    history: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 7v5l4 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    chart: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <line x1="18" y1="20" x2="18" y2="10" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="20" x2="12" y2="4" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="6" y1="20" x2="6" y2="14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    settings: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    trash: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <polyline points="3,6 5,6 21,6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="10" y1="11" x2="10" y2="17" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="14" y1="11" x2="14" y2="17" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    phone: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    folder: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    sun: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="1" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="21" x2="12" y2="23" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="1" y1="12" x2="3" y2="12" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="21" y1="12" x2="23" y2="12" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    moon: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    logout: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="16,17 21,12 16,7" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    user: (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  };

  const icon = icons[name];
  if (!icon) return null;
  if (style) {
    return <span style={style}>{icon}</span>;
  }
  return icon;
}

export function NavRail() {
  const pathname = usePathname();
  const router = useRouter();
  const [isResetting, setIsResetting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { data: session } = useSession();

  // Avoid hydration mismatch by only rendering theme toggle after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await fetch("/api/settings/reset-all", { method: "POST" });
      if (!res.ok) throw new Error("Reset failed");

      toast.success("All data has been reset");
      setDialogOpen(false);
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Failed to reset data");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <nav className="flex h-screen w-[200px] flex-col border-r" style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}>
        {/* Logo */}
        <div className="flex h-14 items-center justify-center gap-3 border-b px-4" style={{ borderColor: "var(--border-subtle)" }}>
          <Image
            src="/bobtail/Bobtail-Logo.svg"
            alt="Bobtail"
            width={120}
            height={32}
            className="h-8 w-auto"
          />
        </div>

        {/* Main navigation */}
        <div className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex h-9 items-center gap-3 rounded-md px-3 transition-all duration-200",
                  isActive
                    ? ""
                    : "hover:bg-[var(--bg-hover)]"
                )}
                style={{
                  color: isActive ? "var(--fg-primary)" : "var(--fg-secondary)",
                  background: isActive ? "var(--bg-active)" : "transparent",
                }}
              >
                {/* Active indicator */}
                {isActive && (
                  <span
                    className="absolute left-0 h-5 w-0.5 rounded-r"
                    style={{ background: "var(--accent-primary)" }}
                  />
                )}
                <Icon name={item.icon} className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="text-[13px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Bottom navigation */}
        <div className="flex flex-col gap-3 border-t p-3" style={{ borderColor: "var(--border-subtle)" }}>
          {/* User info and sign out */}
          {session?.user && (
            <div className="flex flex-col gap-2 rounded-lg p-2" style={{ background: "var(--bg-raised)" }}>
              <div className="flex items-center gap-2">
                <Icon name="user" className="h-4 w-4 flex-shrink-0" style={{ color: "var(--fg-secondary)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate" style={{ color: "var(--fg-primary)" }}>
                    {session.user.email}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>
                    {session.user.role || "VIEWER"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex h-7 items-center justify-center gap-2 rounded-md transition-all duration-200 hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--fg-secondary)" }}
              >
                <Icon name="logout" className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">Sign out</span>
              </button>
            </div>
          )}

          {/* Settings link (admin only) */}
          {session?.user?.role === "ADMIN" && (
            <Link
              href="/settings"
              className={cn(
                "group relative flex h-9 items-center gap-3 rounded-md px-3 transition-all duration-200",
                pathname === "/settings"
                  ? ""
                  : "hover:bg-[var(--bg-hover)]"
              )}
              style={{
                color: pathname === "/settings" ? "var(--fg-primary)" : "var(--fg-secondary)",
                background: pathname === "/settings" ? "var(--bg-active)" : "transparent",
              }}
            >
              {pathname === "/settings" && (
                <span
                  className="absolute left-0 h-5 w-0.5 rounded-r"
                  style={{ background: "var(--accent-primary)" }}
                />
              )}
              <Icon name="settings" className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="text-[13px] font-medium">Settings</span>
            </Link>
          )}

          {/* Theme toggle */}
          {mounted && (
            <button
              onClick={toggleTheme}
              className="group relative flex h-9 items-center gap-3 rounded-md px-3 transition-all duration-200 hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--fg-secondary)" }}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="text-[13px] font-medium">
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </span>
            </button>
          )}

          {/* HappyRobot expanded logo */}
          <div className="flex items-center justify-center py-2">
            {mounted && (
              <Image
                src={theme === "light" ? "/happyrobot/Footer-expand-happyrobot_black.svg" : "/happyrobot/Footer-expand-happyrobot_white.svg"}
                alt="Powered by HappyRobot"
                width={140}
                height={32}
                className="h-8 w-auto opacity-60"
              />
            )}
          </div>

          {/* Only show Reset button for admins */}
          {session?.user?.role === "ADMIN" && bottomItems.map((item) => (
            <button
              key={item.label}
              onClick={() => item.action === "reset" && setDialogOpen(true)}
              className="group relative flex h-9 items-center gap-3 rounded-md px-3 transition-all duration-200 hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--color-danger)" }}
            >
              <Icon name={item.icon} className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="text-[13px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Reset Dialog */}
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all data including debtors, invoices, calls, and campaign state.
              You will need to re-import the CSV file to start again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              disabled={isResetting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isResetting ? "Resetting..." : "Yes, Reset Everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

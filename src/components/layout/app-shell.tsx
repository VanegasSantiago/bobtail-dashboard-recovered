"use client";

import { NavRail } from "./nav-rail";
import { ActiveCallsBar } from "./active-calls-bar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen" style={{ background: "var(--bg-base)" }}>
      <NavRail />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ActiveCallsBar />
        <main className="linear-page">{children}</main>
      </div>
    </div>
  );
}

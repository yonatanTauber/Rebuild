"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { RebuildLogo } from "@/components/logo";

const navItems: Array<{ href: Route; label: string; icon: string }> = [
  { href: "/today", label: "היום", icon: "🏠" },
  { href: "/log", label: "אימונים", icon: "📋" },
  { href: "/journal", label: "תזונה", icon: "🥗" },
  { href: "/analytics", label: "נתונים", icon: "📊" },
  { href: "/settings", label: "הגדרות", icon: "⚙️" }
];

const secondaryRoutes: Array<Route> = [
  "/forecast",
  "/insights",
  "/checkin",
  "/import",
  "/logic"
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const autoSyncStartedRef = useRef(false);

  const isActive = (href: Route) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const isSecondaryActive = secondaryRoutes.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  );

  useEffect(() => {
    if (autoSyncStartedRef.current) return;
    autoSyncStartedRef.current = true;
    void fetch("/api/ingest/rescan", { method: "POST" }).catch(() => {
      // Silent background sync; failures are handled in import/settings or manual sync controls.
    });
  }, []);

  return (
    <div className="app-shell top-tabs-shell">
      <header className="app-top-bar">
        <RebuildLogo />
      </header>
      <main className="content">{children}</main>
      <nav className="bottom-nav-dock" aria-label="ניווט ראשי">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive(item.href) || (item.href === "/today" && !navItems.some((n) => isActive(n.href)) && !isSecondaryActive)
                ? "bottom-nav-item active"
                : "bottom-nav-item"
            }
          >
            <span className="bottom-nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { RebuildLogo } from "@/components/logo";

const primaryTabs: Array<{ href: Route; label: string }> = [
  { href: "/today", label: "היום" },
  { href: "/log", label: "אימונים" },
  { href: "/journal", label: "תזונה" },
  { href: "/analytics", label: "נתונים והיסטוריה" },
  { href: "/settings", label: "הגדרות" }
];

const secondaryTabs: Array<{ href: Route; label: string }> = [
  { href: "/forecast", label: "תחזית" },
  { href: "/insights", label: "תובנות" },
  { href: "/checkin", label: "צ׳ק-אין" },
  { href: "/import", label: "ייבוא" },
  { href: "/logic", label: "Logic" }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const autoSyncStartedRef = useRef(false);
  const isActive = (href: Route) => pathname === href || pathname.startsWith(`${href}/`);
  const moreActive = secondaryTabs.some((item) => isActive(item.href));

  useEffect(() => {
    if (autoSyncStartedRef.current) return;
    autoSyncStartedRef.current = true;
    void fetch("/api/ingest/rescan", { method: "POST" }).catch(() => {
      // Silent background sync; failures are handled in import/settings or manual sync controls.
    });
  }, []);

  return (
    <div className="app-shell top-tabs-shell">
      <header className="app-top-nav">
        <div className="app-top-nav-inner">
          <RebuildLogo />
          <nav className="top-tabs" aria-label="ניווט ראשי">
            {primaryTabs.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(item.href) ? "top-tab active" : "top-tab"}
              >
                {item.label}
              </Link>
            ))}
            <details className={moreActive ? "top-more active" : "top-more"}>
              <summary className="top-tab top-more-trigger">עוד</summary>
              <div className="top-more-menu" role="menu" aria-label="ניווט משני">
                {secondaryTabs.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className={isActive(item.href) ? "top-more-item active" : "top-more-item"}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </details>
          </nav>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

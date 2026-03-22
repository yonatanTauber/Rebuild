"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RebuildLogo } from "@/components/logo";

const navItems: Array<{ href: Route; label: string; icon: string }> = [
  { href: "/today", label: "היום", icon: "dashboard" },
  { href: "/log", label: "אימונים", icon: "fitness_center" },
  { href: "/nutrition", label: "תזונה", icon: "nutrition" },
  { href: "/analytics", label: "נתונים", icon: "bar_chart" },
  { href: "/settings", label: "הגדרות", icon: "settings" }
];

const secondaryItems: Array<{ href: Route; label: string }> = [
  { href: "/forecast", label: "תחזית" },
  { href: "/insights", label: "תובנות" },
  { href: "/checkin", label: "צ׳ק-אין" },
  { href: "/import", label: "ייבוא" },
  { href: "/logic", label: "לוגיקה" }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const autoSyncStartedRef = useRef(false);
  const desktopMoreRef = useRef<HTMLDivElement | null>(null);
  const mobileMoreRef = useRef<HTMLDivElement | null>(null);
  const [desktopMoreOpen, setDesktopMoreOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const isActive = (href: Route) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const isSecondaryActive = secondaryItems.some(
    (r) => pathname === r.href || pathname.startsWith(`${r.href}/`)
  );
  const primaryForMore = navItems.filter((item) => item.href !== "/today");
  const mobilePrimaryVisible = navItems.filter((item) =>
    ["/today", "/log", "/nutrition", "/analytics"].includes(item.href)
  );
  const mobileOverflowItems = [...primaryForMore.slice(2), ...secondaryItems];
  const desktopMoreActive = isSecondaryActive;
  const mobileMoreActive = mobileOverflowItems.some((item) => isActive(item.href));
  const isHomeFallback =
    !navItems.some((n) => isActive(n.href)) && !isSecondaryActive;

  useEffect(() => {
    if (autoSyncStartedRef.current) return;
    autoSyncStartedRef.current = true;
    void fetch("/api/ingest/rescan", { method: "POST" }).catch(() => {
      // Silent background sync; failures are handled in import/settings or manual sync controls.
    });
  }, []);

  useEffect(() => {
    setDesktopMoreOpen(false);
    setMobileMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (desktopMoreRef.current && !desktopMoreRef.current.contains(target)) {
        setDesktopMoreOpen(false);
      }
      if (mobileMoreRef.current && !mobileMoreRef.current.contains(target)) {
        setMobileMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div className="app-shell top-tabs-shell">
      <header className="app-top-nav">
        <div className="app-top-nav-inner">
          <div className="brand-wrap">
            <RebuildLogo />
          </div>
          <nav className="top-tabs top-tabs-desktop" aria-label="ניווט ראשי">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  isActive(item.href) || (item.href === "/today" && isHomeFallback)
                    ? "top-tab active"
                    : "top-tab"
                }
              >
                {item.label}
              </Link>
            ))}
            <div
              ref={desktopMoreRef}
              className={[
                "top-more",
                desktopMoreActive ? "active" : "",
                desktopMoreOpen ? "open" : ""
              ].join(" ").trim()}
            >
              <button
                type="button"
                className="top-tab top-more-trigger"
                onClick={() => setDesktopMoreOpen((prev) => !prev)}
                aria-expanded={desktopMoreOpen}
              >
                עוד
              </button>
              <div className="top-more-menu" hidden={!desktopMoreOpen}>
                {secondaryItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={isActive(item.href) ? "top-more-item active" : "top-more-item"}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </nav>
          <nav className="top-tabs top-tabs-mobile" aria-label="ניווט מובייל">
            {mobilePrimaryVisible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  isActive(item.href) || (item.href === "/today" && isHomeFallback)
                    ? "top-tab active"
                    : "top-tab"
                }
              >
                {item.label}
              </Link>
            ))}
            <div
              ref={mobileMoreRef}
              className={[
                "top-more",
                mobileMoreActive ? "active" : "",
                mobileMoreOpen ? "open" : ""
              ].join(" ").trim()}
            >
              <button
                type="button"
                className="top-tab top-more-trigger"
                onClick={() => setMobileMoreOpen((prev) => !prev)}
                aria-expanded={mobileMoreOpen}
              >
                עוד
              </button>
              <div className="top-more-menu" hidden={!mobileMoreOpen}>
                {mobileOverflowItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={isActive(item.href) ? "top-more-item active" : "top-more-item"}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </nav>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

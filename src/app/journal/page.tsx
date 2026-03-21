"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DayJournalGrid, type DayJournalBundle } from "@/components/day-journal-grid";
import { addDaysISO, formatDisplayDate, formatISODate } from "@/lib/date";

function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export default function JournalPage() {
  const [activeDate, setActiveDate] = useState(formatISODate());
  const [journal, setJournal] = useState<DayJournalBundle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const requestedDate = new URLSearchParams(window.location.search).get("date");
    if (isIsoDate(requestedDate)) {
      setActiveDate(requestedDate);
    }
  }, []);

  async function loadJournal(date = activeDate) {
    setLoading(true);
    try {
      const res = await fetch(`/api/journal/day?date=${date}`);
      if (!res.ok) {
        setJournal(null);
        return;
      }
      const bundle = (await res.json()) as DayJournalBundle;
      setJournal(bundle);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadJournal(activeDate);
  }, [activeDate]);

  const prevDate = useMemo(() => addDaysISO(activeDate, -1), [activeDate]);
  const nextDate = useMemo(() => addDaysISO(activeDate, 1), [activeDate]);

  return (
    <div className="journal-page">
      <header className="page-header">
        <h1>תזונה</h1>
        <p>כל פירוט הארוחות, ההמלצות וההזנה המלאה נמצאים כאן.</p>
      </header>

      <section className="today-surface">
        <div className="journal-topbar">
          <div className="journal-topline">
            <button className="choice-btn journal-today-btn" onClick={() => setActiveDate(formatISODate())}>
              היום
            </button>
            <Link href="/today" className="inline-cta-link subtle-link">
              חזרה לדף היום
            </Link>
          </div>
          <div className="journal-nav">
            <button className="choice-btn journal-nav-btn" onClick={() => setActiveDate(prevDate)}>
              יום קודם
            </button>
            <strong className="journal-date-title">{formatDisplayDate(activeDate)}</strong>
            <button className="choice-btn journal-nav-btn" onClick={() => setActiveDate(nextDate)}>
              יום הבא
            </button>
          </div>
        </div>

        {loading ? <p className="note">טוען נתוני תזונה...</p> : null}
        <DayJournalGrid
          date={activeDate}
          journal={journal}
          onRefresh={() => loadJournal(activeDate)}
          hideMorning
          hideWorkouts
          hideFeedback
        />
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Section } from "@/components/cards";

type Rules = {
  weeklyTimeBudgetHours: number;
  runPriority: number;
  crossTrainingWeight: number;
  hardDaysPerWeek: number;
  noHardIfLowReadiness: number;
  minEasyBetweenHard: number;
  injuryFlags: string[];
};

export default function SettingsLogicPage() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void fetch("/api/logic/rules")
      .then((r) => r.json())
      .then((data) => setRules(data as Rules));
  }, []);

  async function save() {
    if (!rules) return;
    const res = await fetch("/api/logic/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rules)
    });

    setStatus(res.ok ? "הלוגיקה נשמרה." : "שמירה נכשלה.");
  }

  if (!rules) {
    return <p>טוען לוגיקה...</p>;
  }

  return (
    <>
      <header className="page-header">
        <h1>Logic Studio</h1>
        <p>כאן אתה מכוון את המנוע האישי.</p>
      </header>

      <Section title="כללי מנוע" subtitle="שינויים כאן משפיעים על המלצות היום הבא">
        <div className="row">
          <label className="field">
            תקציב זמן שבועי (שעות)
            <input
              type="number"
              value={rules.weeklyTimeBudgetHours}
              onChange={(e) => setRules((p) => (p ? { ...p, weeklyTimeBudgetHours: Number(e.target.value) } : p))}
            />
          </label>
          <label className="field">
            משקל קרוס-טריינינג
            <input
              type="number"
              step="0.05"
              value={rules.crossTrainingWeight}
              onChange={(e) => setRules((p) => (p ? { ...p, crossTrainingWeight: Number(e.target.value) } : p))}
            />
          </label>
          <label className="field">
            ימי איכות בשבוע
            <input
              type="number"
              value={rules.hardDaysPerWeek}
              onChange={(e) => setRules((p) => (p ? { ...p, hardDaysPerWeek: Number(e.target.value) } : p))}
            />
          </label>
          <label className="field">
            סף מוכנות לאיסור אימון קשה
            <input
              type="number"
              value={rules.noHardIfLowReadiness}
              onChange={(e) => setRules((p) => (p ? { ...p, noHardIfLowReadiness: Number(e.target.value) } : p))}
            />
          </label>
          <label className="field">
            ימי קל בין אימוני איכות
            <input
              type="number"
              value={rules.minEasyBetweenHard}
              onChange={(e) => setRules((p) => (p ? { ...p, minEasyBetweenHard: Number(e.target.value) } : p))}
            />
          </label>
          <label className="field">
            Injury flags (comma separated)
            <input
              value={rules.injuryFlags.join(",")}
              onChange={(e) =>
                setRules((p) => (p ? { ...p, injuryFlags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } : p))
              }
            />
          </label>
        </div>
        <div className="row">
          <button onClick={save}>שמור לוגיקה</button>
          <Link href="/settings" className="inline-cta-link subtle-link">
            חזרה להגדרות
          </Link>
          {status && <p className="note">{status}</p>}
        </div>
      </Section>
    </>
  );
}

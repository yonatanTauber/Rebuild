"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Section } from "@/components/cards";
import { formatDisplayDateTime } from "@/lib/date";

type IngestStatus = {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  pendingJobs: number;
  failedFiles: string[];
};

type AthleteProfile = {
  restingHrBaseline?: number | null;
  hrvBaseline?: number | null;
  vo2MaxBaseline?: number | null;
  sleepHoursBaseline?: number | null;
  importedAt?: string | null;
};

export default function SettingsImportPage() {
  const [status, setStatus] = useState<IngestStatus | null>(null);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const [statusRes, profileRes] = await Promise.all([fetch("/api/ingest/status"), fetch("/api/profile/baseline")]);
    const statusData = (await statusRes.json()) as IngestStatus;
    const profileData = (await profileRes.json()) as AthleteProfile;
    setStatus(statusData);
    setProfile(profileData);
  }

  useEffect(() => {
    void load();
  }, []);

  async function rescan() {
    setMessage("סורק תיקיית ייבוא...");
    const res = await fetch("/api/ingest/rescan", { method: "POST" });
    const data = (await res.json()) as { jobId: string; filesQueued: number; filesSkipped?: number };
    setMessage(`Job ${data.jobId} התחיל. נסרקו ${data.filesQueued} קבצים, דולגו ${data.filesSkipped ?? 0}.`);
    await load();
  }

  async function resetAndReload() {
    setMessage("מנקה נתונים ומטעין מחדש...");
    const res = await fetch("/api/ingest/reset", { method: "POST" });
    const data = (await res.json()) as {
      reset: boolean;
      jobId: string;
      filesQueued: number;
      filesIngested: number;
      filesSkipped: number;
      errors: number;
    };
    setMessage(
      `בוצע ניקוי + הטענה מחדש. Job ${data.jobId}: נקלטו ${data.filesIngested}, דולגו ${data.filesSkipped}, שגיאות ${data.errors}.`
    );
    await load();
  }

  return (
    <>
      <header className="page-header">
        <h1>ייבוא ותקינות</h1>
        <p>סנכרון מתיקייה מקומית כל 10 דקות + סריקה יזומה.</p>
      </header>

      <div className="two-col-panels">
        <Section title="מצב Ingestion" subtitle="ברירת מחדל: data/import">
          <ul className="kv compact-kv">
            <li>הרצה אחרונה: {status?.lastRunAt ? formatDisplayDateTime(status.lastRunAt) : "-"}</li>
            <li>הצלחה אחרונה: {status?.lastSuccessAt ? formatDisplayDateTime(status.lastSuccessAt) : "-"}</li>
            <li>Jobs ממתינים: {status?.pendingJobs ?? 0}</li>
          </ul>
          <div className="row">
            <button onClick={rescan}>הרץ סריקה עכשיו</button>
            <button className="alt" onClick={resetAndReload}>
              ניקוי נתונים והטענה מחדש
            </button>
            <Link href="/settings" className="inline-cta-link subtle-link">
              חזרה להגדרות
            </Link>
            {message && <p className="note">{message}</p>}
          </div>
        </Section>

        <Section title="Baseline פיזיולוגי אישי" subtitle="נגזר מייבוא חד-פעמי של Apple Health export.xml">
          <ul className="kv compact-kv">
            <li>Resting HR baseline: {profile?.restingHrBaseline ?? "-"}</li>
            <li>HRV baseline: {profile?.hrvBaseline ?? "-"}</li>
            <li>VO2max baseline: {profile?.vo2MaxBaseline ?? "-"}</li>
            <li>Sleep hours baseline: {profile?.sleepHoursBaseline ?? "-"}</li>
            <li>עודכן לאחרונה: {profile?.importedAt ? formatDisplayDateTime(profile.importedAt) : "-"}</li>
          </ul>
        </Section>
      </div>

      <Section title="קבצים שנכשלו" subtitle="אם קיימים, יוצגו כאן">
        <ul className="list">
          {(status?.failedFiles ?? []).map((file) => (
            <li key={file}>{file}</li>
          ))}
          {(!status?.failedFiles || status.failedFiles.length === 0) && <li>אין כשלים כרגע.</li>}
        </ul>
      </Section>
    </>
  );
}

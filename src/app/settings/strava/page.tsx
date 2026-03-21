"use client";

import { useEffect, useState } from "react";

type StravaStatus = {
  connected: boolean;
  athleteId?: string | null;
  expiresAt?: number | null;
  syncState?: { nextPage: number; done: boolean; updatedAt: string | null };
  webhook?: {
    subscribed: boolean;
    subscriptionId?: string | null;
    callbackUrl?: string | null;
  };
};

export default function StravaSettingsPage() {
  const [status, setStatus] = useState<StravaStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [sRes, wRes] = await Promise.all([fetch("/api/strava/status"), fetch("/api/strava/webhook/status")]);
        const sJson = (await sRes.json()) as StravaStatus;
        const wJson = (await wRes.json()) as { subscribed: boolean; subscriptionId?: string | null; callbackUrl?: string | null };
        setStatus({ ...sJson, webhook: wJson });
      } catch {
        setStatus({ connected: false });
      }
    })();
  }, []);

  async function triggerSync() {
    if (syncing) return;
    setSyncing(true);
    setToast("");
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; imported?: number; updated?: number; error?: string };
      if (!res.ok || !json.ok) {
        setToast(json.error || "הסנכרון נכשל.");
        return;
      }
      setToast(`סונכרנו ${json.imported ?? 0} פעילויות (עודכנו ${json.updated ?? 0}).`);
      const statusRes = await fetch("/api/strava/status");
      setStatus((await statusRes.json()) as StravaStatus);
    } catch {
      setToast("הסנכרון נכשל.");
    } finally {
      setSyncing(false);
    }
  }

  async function triggerBackfill() {
    if (syncing) return;
    setSyncing(true);
    setToast("");
    try {
      const res = await fetch("/api/strava/sync?mode=backfill&pages=6", { method: "POST" });
      const json = (await res.json()) as {
        ok?: boolean;
        imported?: number;
        updated?: number;
        error?: string;
        nextPage?: number;
        done?: boolean;
      };
      if (!res.ok || !json.ok) {
        setToast(json.error || "הסנכרון נכשל.");
        return;
      }
      if (json.done) {
        setToast(`סנכרון היסטוריה הושלם. (ייבוא ${json.imported ?? 0}, עדכון ${json.updated ?? 0})`);
      } else {
        setToast(`ייבוא ${json.imported ?? 0} (עודכנו ${json.updated ?? 0}). המשך: עמוד ${json.nextPage ?? "?"}`);
      }
      const statusRes = await fetch("/api/strava/status");
      setStatus((await statusRes.json()) as StravaStatus);
    } catch {
      setToast("הסנכרון נכשל.");
    } finally {
      setSyncing(false);
    }
  }

  async function enableWebhook() {
    if (subscribing) return;
    setSubscribing(true);
    setToast("");
    try {
      const res = await fetch("/api/strava/webhook/subscribe", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setToast(json.error || "ההפעלה נכשלה.");
        return;
      }
      setToast("סנכרון אוטומטי הופעל. פעילות חדשה ב־Strava תיכנס אוטומטית.");
      const [sRes, wRes] = await Promise.all([fetch("/api/strava/status"), fetch("/api/strava/webhook/status")]);
      const sJson = (await sRes.json()) as StravaStatus;
      const wJson = (await wRes.json()) as { subscribed: boolean; subscriptionId?: string | null; callbackUrl?: string | null };
      setStatus({ ...sJson, webhook: wJson });
    } catch {
      setToast("ההפעלה נכשלה.");
    } finally {
      setSubscribing(false);
    }
  }

  const connected = Boolean(status?.connected);
  const webhookSubscribed = Boolean(status?.webhook?.subscribed);

  return (
    <div className="settings-page">
      <header className="page-header">
        <h1>Strava</h1>
        <p>חיבור Strava מאפשר לסנכרן אימונים לגרסת האתר (Vercel) בלי תיקיות iCloud.</p>
      </header>

      <section className="panel">
        <h2>סטטוס</h2>
        <ul className="kv compact-kv">
          <li>מחובר: {connected ? "כן" : "לא"}</li>
          <li>Athlete ID: {status?.athleteId ?? "-"}</li>
          <li>סנכרון אוטומטי: {webhookSubscribed ? "פעיל" : "כבוי"}</li>
          <li>
            היסטוריה:{" "}
            {status?.syncState?.done
              ? "הושלם"
              : status?.syncState?.nextPage
                ? `עמוד הבא ${status.syncState.nextPage}`
                : "לא התחיל"}
          </li>
        </ul>

        <div className="btn-row">
          {connected ? null : (
            <a className="choice-btn selected" href="/api/strava/auth">
              חבר Strava
            </a>
          )}
          {connected ? (
            <button className="choice-btn" onClick={triggerSync} disabled={syncing}>
              {syncing ? "מסנכרן..." : "סנכרון עכשיו"}
            </button>
          ) : null}
          {connected ? (
            <button className="choice-btn" onClick={triggerBackfill} disabled={syncing}>
              {syncing ? "מסנכרן..." : "סנכרון היסטוריה"}
            </button>
          ) : null}
          {connected && !webhookSubscribed ? (
            <button className="choice-btn selected" onClick={enableWebhook} disabled={subscribing}>
              {subscribing ? "מפעיל..." : "הפעל סנכרון אוטומטי"}
            </button>
          ) : null}
        </div>

        {toast ? <p className="note">{toast}</p> : null}
      </section>
    </div>
  );
}

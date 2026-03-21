import Link from "next/link";
import { RebuildLogo } from "@/components/logo";
import { formatDisplayDateTime } from "@/lib/date";
import { cloudEnabled } from "@/lib/cloud-db";

const settingsGroups = [
  {
    title: "פרופיל אימון",
    rows: [
      { href: "/settings/shoes", title: "נעלי ריצה", desc: "ניהול זוגות, ברירת מחדל וק״מ מצטבר." },
      { href: "/log", title: "יומן אימונים", desc: "מעבר מהיר ליומן ולפירוט אימון." }
    ]
  },
  {
    title: "מערכת וסנכרון",
    rows: [
      { href: "/settings/strava", title: "Strava", desc: "חיבור אונליין וסנכרון פעילויות לגרסת האתר." },
      { href: "/settings/import", title: "ייבוא ותקינות", desc: "סטטוס סנכרון, סריקה יזומה וניקוי." },
      { href: "/settings/logic", title: "Logic Studio", desc: "כוונון כללי המנוע האישי." }
    ]
  },
  {
    title: "פרטיות ונתונים",
    rows: [
      { href: "/journal", title: "תזונה", desc: "תזונה יומית, ארוחות, פנטרי ומועדפים." }
    ]
  }
] as const;

export default function SettingsPage() {
  const now = formatDisplayDateTime(new Date());
  const storageLabel = cloudEnabled() ? "אונליין (Vercel Postgres)" : "לוקאלי (SQLite)";
  const storageHint = cloudEnabled()
    ? "כל מה שמזינים באתר (בוקר/תזונה/משובים/נעליים) נשמר בענן ונשאר קבוע."
    : "הנתונים נשמרים במחשב בלבד. כדי לעבור לענן: חבר Postgres בהגדרות ותריץ מיגרציה חד־פעמית.";

  return (
    <div className="settings-page">
      <header className="page-header">
        <h1>הגדרות</h1>
        <p>אותה היררכיה כמו המובייל: קבוצות רציפות, סטטוסים ברורים ופעולות מהירות.</p>
      </header>

      <section className="settings-surface">
        <div className="settings-surface-head">
          <RebuildLogo />
          <span className="settings-sync-pill">עודכן לאחרונה: {now}</span>
        </div>

        <div className="settings-groups">
          {settingsGroups.map((group) => (
            <article key={group.title} className="settings-group-card">
              <header>
                <h2>{group.title}</h2>
              </header>
              <div className="settings-group-rows">
                {group.rows.map((item) => (
                  <Link key={item.title} href={item.href} className="settings-row-link">
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.desc}</p>
                    </div>
                    <span aria-hidden>←</span>
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>

        <ul className="kv settings-kv">
          <li>אחסון: {storageLabel}</li>
          <li>ייבוא: תיקייה מקומית או Strava</li>
          <li>{storageHint}</li>
        </ul>
      </section>
    </div>
  );
}

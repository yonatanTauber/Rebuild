import type { ReactNode } from "react";

type MetricRange = {
  label: string;
  from: number;
  to: number;
  meaning: string;
};

type ScoreCardProps = {
  title: string;
  value: string | number;
  tone?: "red" | "yellow" | "black" | "orange";
  ranges?: MetricRange[];
};

export function ScoreCard({ title, value, tone, ranges }: ScoreCardProps) {
  const toneClass = tone ? `score-card ${tone}` : "score-card";
  const numeric = typeof value === "number" ? Math.max(0, Math.min(100, value)) : null;
  const currentRange = ranges?.find((r) => numeric != null && numeric >= r.from && numeric <= r.to);
  return (
    <article className={toneClass}>
      <p className="score-label">{title}</p>
      <strong className="score-value">{value}</strong>
      <div className="score-card-studs" aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>
      {numeric != null && (
        <div className="metric-bar-wrap" aria-label={`${title} bar`}>
          <div className="metric-bar">
            <span className="metric-fill" style={{ width: `${numeric}%` }} />
          </div>
          <span className="metric-current">{numeric}</span>
        </div>
      )}
      {ranges && numeric != null && (
        <div className="metric-hint" role="note">
          <p>
            מצב נוכחי: <strong>{numeric}</strong> {currentRange ? `(${currentRange.label})` : ""}
          </p>
          <ul>
            {ranges.map((range) => (
              <li key={`${range.label}-${range.from}`}>
                {range.from}-{range.to}: {range.meaning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

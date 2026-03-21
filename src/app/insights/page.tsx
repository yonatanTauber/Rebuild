'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { Section } from '@/components/cards';
import FoldSection from '@/components/fold-section';
import UiSelect from '@/components/ui-select';
import type { InsightOptions, InsightQueryInput, InsightResult, InsightVisualSpec } from '@/lib/insights';

type RangeKey = '30d' | '12w' | '365d' | 'all';
type SportFilter = 'run' | 'bike' | 'swim' | 'all';
type QueryState = InsightQueryInput;
type QueryFilters = NonNullable<QueryState['filters']>;

const defaultQuery: QueryState = {
  entity: 'workout',
  aggregate: 'avg',
  metric: 'paceMinPerKm',
  groupBy: 'month',
  range: '12w',
  sport: 'run',
  filters: {}
};

function formatValue(value: string) {
  return value;
}

function RenderVisual({ visual }: { visual: InsightVisualSpec }) {
  if (visual.kind === 'compare') {
    return (
      <div className="insight-visual compare-visual">
        <div className="compare-visual-head">
          <strong>{visual.label}</strong>
          <span>{visual.left.label} מול {visual.right.label}</span>
        </div>
        <div className="compare-visual-columns">
          <article>
            <small>{visual.left.label}</small>
            <strong>{visual.left.value}</strong>
          </article>
          <article>
            <small>{visual.right.label}</small>
            <strong>{visual.right.value}</strong>
          </article>
        </div>
        <div className="compare-metric-list">
          {visual.metrics.map((metric) => (
            <div key={metric.label} className="compare-metric-row">
              <span>{metric.label}</span>
              <strong>{metric.left}</strong>
              <strong>{metric.right}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const max = Math.max(1, ...visual.series.map((item) => item.value));
  return (
    <div className="insight-visual bars-visual">
      <div className="bars-visual-head">
        <strong>{visual.label}</strong>
      </div>
      <div className="bars-visual-list">
        {visual.series.map((item) => (
          <div key={item.label} className="bars-visual-row">
            <span>{item.label}</span>
            <div className="bars-visual-track">
              <div
                className={`bars-visual-fill ${item.tone ?? 'default'}`}
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function EvidenceRows({ rows }: { rows: InsightResult['rows'] }) {
  if (!rows.length) {
    return <p className="empty-note">אין כרגע שורות תומכות להצגה.</p>;
  }
  return (
    <div className="insight-evidence-list">
      {rows.map((row) => {
        const content = (
          <>
            <div className="insight-evidence-head">
              <div>
                <strong>{row.title}</strong>
                {row.subtitle && <small>{row.subtitle}</small>}
              </div>
            </div>
            <div className="insight-evidence-metrics">
              {row.metrics.map((metric) => (
                <span key={`${row.id}-${metric.label}`} className="insight-evidence-chip">
                  <small>{metric.label}</small>
                  <strong>{metric.value}</strong>
                </span>
              ))}
            </div>
          </>
        );
        return row.href ? (
          <Link key={row.id} href={row.href as Route} className="insight-evidence-card">
            {content}
          </Link>
        ) : (
          <article key={row.id} className="insight-evidence-card">
            {content}
          </article>
        );
      })}
    </div>
  );
}

export default function InsightsPage() {
  const [options, setOptions] = useState<InsightOptions | null>(null);
  const [range, setRange] = useState<RangeKey>('12w');
  const [sport, setSport] = useState<SportFilter>('run');
  const [presets, setPresets] = useState<InsightResult[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [queryState, setQueryState] = useState<QueryState>(defaultQuery);
  const [queryResult, setQueryResult] = useState<InsightResult | null>(null);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);

  useEffect(() => {
    void fetch('/api/insights/options')
      .then((res) => res.json())
      .then((json: InsightOptions) => setOptions(json));
  }, []);

  useEffect(() => {
    setLoadingPresets(true);
    void fetch(`/api/insights/presets?range=${range}&sport=${sport}`)
      .then((res) => res.json())
      .then((json: { presets: InsightResult[] }) => {
        setPresets(json.presets ?? []);
        setSelectedId((prev) => (json.presets?.some((item) => item.id === prev) ? prev : json.presets?.[0]?.id ?? ''));
      })
      .finally(() => setLoadingPresets(false));
  }, [range, sport]);

  useEffect(() => {
    setQueryState((prev) => ({ ...prev, range, sport }));
  }, [range, sport]);

  const metricOptions = useMemo(
    () => options?.metricOptions.filter((metric) => metric.entity.includes(queryState.entity)) ?? [],
    [options, queryState.entity]
  );
  const aggregateOptions = useMemo(() => {
    const metric = metricOptions.find((item) => item.value === queryState.metric);
    const allowed = metric?.aggregates ?? [];
    return (options?.aggregateOptions ?? []).filter((item) => allowed.includes(item.value));
  }, [metricOptions, options, queryState.metric]);
  const groupOptions = useMemo(
    () => options?.groupOptions.filter((group) => group.entity.includes(queryState.entity)) ?? [],
    [options, queryState.entity]
  );

  useEffect(() => {
    if (!metricOptions.some((item) => item.value === queryState.metric)) {
      const nextMetric = metricOptions[0]?.value;
      if (nextMetric) setQueryState((prev) => ({ ...prev, metric: nextMetric }));
    }
  }, [metricOptions, queryState.metric]);

  useEffect(() => {
    if (!aggregateOptions.some((item) => item.value === queryState.aggregate)) {
      const nextAggregate = aggregateOptions[0]?.value;
      if (nextAggregate) setQueryState((prev) => ({ ...prev, aggregate: nextAggregate }));
    }
  }, [aggregateOptions, queryState.aggregate]);

  useEffect(() => {
    if (!groupOptions.some((item) => item.value === queryState.groupBy)) {
      const nextGroup = groupOptions[0]?.value;
      if (nextGroup) setQueryState((prev) => ({ ...prev, groupBy: nextGroup }));
    }
  }, [groupOptions, queryState.groupBy]);

  const selectedPreset = presets.find((item) => item.id === selectedId) ?? presets[0] ?? null;
  const activeResult = queryResult ?? selectedPreset;

  async function submitQuery() {
    setQueryLoading(true);
    try {
      const res = await fetch('/api/insights/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryState)
      });
      const json = (await res.json()) as InsightResult;
      setQueryResult(json);
      setSelectedId('');
    } finally {
      setQueryLoading(false);
    }
  }

  function updateFilter<K extends keyof QueryFilters>(key: K, value: QueryFilters[K] | undefined) {
    setQueryState((prev) => ({
      ...prev,
      filters: {
        ...(prev.filters ?? {}),
        [key]: value
      }
    }));
  }

  return (
    <>
      <header className="page-header">
        <h1>תובנות</h1>
        <p>שאלות של מאמן למעלה, חיפוש מתקדם למטה. אותו דאטה, פחות רעש.</p>
      </header>

      <Section title="טווח עבודה" subtitle="ברירת מחדל: 12 שבועות אחרונים">
        <div className="insights-toolbar">
          <div className="segmented-row">
            {(options?.rangeOptions ?? []).map((item) => (
              <button
                key={item.value}
                className={range === item.value ? 'segmented-btn selected' : 'segmented-btn'}
                onClick={() => {
                  setRange(item.value);
                  setQueryResult(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="insights-inline-filter">
            <label>ענף</label>
            <UiSelect
              value={sport}
              onChange={(nextValue) => {
                setSport(nextValue as SportFilter);
                setQueryResult(null);
              }}
              options={(options?.sportOptions ?? []).map((item) => ({ value: item.value, label: item.label }))}
            />
          </div>
        </div>
      </Section>

      <Section title="שאלות מוכנות של מאמן" subtitle="נקודת התחלה טובה לפני חיפוש חופשי יותר">
        {loadingPresets ? (
          <p className="empty-note">טוען תובנות...</p>
        ) : (
          <div className="insight-card-grid">
            {presets.map((preset) => (
              <button
                key={preset.id}
                className={selectedId === preset.id && !queryResult ? 'insight-card selected' : 'insight-card'}
                onClick={() => {
                  setSelectedId(preset.id);
                  setQueryResult(null);
                }}
              >
                <strong>{preset.title}</strong>
                <p>{preset.question}</p>
                <small>{preset.summary}</small>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title={activeResult?.title ?? 'תוצאה'} subtitle={activeResult?.question}>
        {activeResult ? (
          <div className="insight-result-grid">
            <div className="insight-summary-card">
              <strong>{activeResult.summary}</strong>
              {activeResult.summaryDetail && <p>{activeResult.summaryDetail}</p>}
              <div className="insight-summary-strip">
                <span className="journal-status-pill">מדגם: {activeResult.sampleSize}</span>
                {activeResult.links.map((link) => (
                  <Link key={link.href} href={link.href as Route} className="inline-cta-link subtle-link">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <RenderVisual visual={activeResult.visualSpec} />
            <EvidenceRows rows={activeResult.rows} />
          </div>
        ) : (
          <p className="empty-note">בחר שאלה מוכנה או הרץ חיפוש מתקדם.</p>
        )}
      </Section>

      <FoldSection title="חיפוש מתקדם" subtitle="Query builder מובנה, לא שדה חופשי" defaultOpen={false}>
        <div className="insight-query-grid">
          <div className="insights-inline-filter">
            <label>גרעין</label>
            <UiSelect
              value={queryState.entity}
              onChange={(nextValue) => setQueryState((prev) => ({ ...prev, entity: nextValue as QueryState['entity'] }))}
              options={(options?.entityOptions ?? []).map((item) => ({ value: item.value, label: item.label }))}
            />
          </div>
          <div className="insights-inline-filter">
            <label>מדד</label>
            <UiSelect
              value={queryState.metric}
              onChange={(nextValue) => setQueryState((prev) => ({ ...prev, metric: nextValue as QueryState['metric'] }))}
              options={metricOptions.map((item) => ({ value: item.value, label: item.label }))}
            />
          </div>
          <div className="insights-inline-filter">
            <label>חישוב</label>
            <UiSelect
              value={queryState.aggregate}
              onChange={(nextValue) => setQueryState((prev) => ({ ...prev, aggregate: nextValue as QueryState['aggregate'] }))}
              options={aggregateOptions.map((item) => ({ value: item.value, label: item.label }))}
            />
          </div>
          <div className="insights-inline-filter">
            <label>קיבוץ</label>
            <UiSelect
              value={queryState.groupBy}
              onChange={(nextValue) => setQueryState((prev) => ({ ...prev, groupBy: nextValue as QueryState['groupBy'] }))}
              options={groupOptions.map((item) => ({ value: item.value, label: item.label }))}
            />
          </div>
          <div className="insights-inline-filter">
            <label>מתאריך</label>
            <input type="date" value={queryState.from ?? ''} onChange={(e) => setQueryState((prev) => ({ ...prev, from: e.target.value || undefined }))} />
          </div>
          <div className="insights-inline-filter">
            <label>עד תאריך</label>
            <input type="date" value={queryState.to ?? ''} onChange={(e) => setQueryState((prev) => ({ ...prev, to: e.target.value || undefined }))} />
          </div>
          <div className="insights-inline-filter">
            <label>נעל</label>
            <UiSelect
              value={queryState.filters?.shoeId ?? ''}
              onChange={(nextValue) => updateFilter('shoeId', nextValue || undefined)}
              options={[
                { value: '', label: 'כל הנעליים' },
                ...(options?.shoes ?? []).map((shoe) => ({ value: shoe.id, label: shoe.name }))
              ]}
            />
          </div>
          <div className="insights-inline-filter">
            <label>אזור כאב</label>
            <UiSelect
              value={queryState.filters?.painArea ?? ''}
              onChange={(nextValue) => updateFilter('painArea', nextValue || undefined)}
              options={[
                { value: '', label: 'כל האזורים' },
                ...(options?.painAreas ?? []).map((area) => ({ value: area, label: area }))
              ]}
            />
          </div>
          <div className="insights-inline-filter">
            <label>ארוחה מאושרת</label>
            <UiSelect
              value={queryState.filters?.mealSlot ?? ''}
              onChange={(nextValue) => updateFilter('mealSlot', (nextValue || undefined) as QueryFilters['mealSlot'])}
              options={[
                { value: '', label: 'כל הארוחות' },
                ...(options?.mealSlotOptions ?? []).map((slot) => ({ value: slot.value, label: slot.label }))
              ]}
            />
          </div>
          <div className="insights-inline-filter">
            <label>שעת אימון</label>
            <UiSelect
              value={queryState.filters?.timeOfDay ?? ''}
              onChange={(nextValue) => updateFilter('timeOfDay', (nextValue || undefined) as QueryFilters['timeOfDay'])}
              options={[
                { value: '', label: 'כל היום' },
                ...(options?.timeOfDayOptions ?? []).map((slot) => ({ value: slot.value, label: slot.label }))
              ]}
            />
          </div>
          <div className="insights-inline-filter short-field">
            <label>מרחק מינ׳</label>
            <input type="number" step="0.1" value={queryState.filters?.minDistanceKm ?? ''} onChange={(e) => updateFilter('minDistanceKm', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="insights-inline-filter short-field">
            <label>מרחק מקס׳</label>
            <input type="number" step="0.1" value={queryState.filters?.maxDistanceKm ?? ''} onChange={(e) => updateFilter('maxDistanceKm', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="insights-inline-filter short-field">
            <label>משך מינ׳</label>
            <input type="number" step="1" value={queryState.filters?.minDurationMin ?? ''} onChange={(e) => updateFilter('minDurationMin', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="insights-inline-filter short-field">
            <label>משך מקס׳</label>
            <input type="number" step="1" value={queryState.filters?.maxDurationMin ?? ''} onChange={(e) => updateFilter('maxDurationMin', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="insights-inline-filter short-field">
            <label>עומס מינ׳</label>
            <input type="number" step="1" value={queryState.filters?.minLoad ?? ''} onChange={(e) => updateFilter('minLoad', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="insights-inline-filter short-field">
            <label>עומס מקס׳</label>
            <input type="number" step="1" value={queryState.filters?.maxLoad ?? ''} onChange={(e) => updateFilter('maxLoad', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="insights-inline-filter short-field">
            <label>Readiness מינ׳</label>
            <input type="number" step="1" value={queryState.filters?.minReadiness ?? ''} onChange={(e) => updateFilter('minReadiness', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="insights-inline-filter short-field">
            <label>Fatigue מקס׳</label>
            <input type="number" step="1" value={queryState.filters?.maxFatigue ?? ''} onChange={(e) => updateFilter('maxFatigue', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="insights-inline-filter short-field">
            <label>דופק ממוצע מינ׳</label>
            <input type="number" step="1" value={queryState.filters?.minAvgHr ?? ''} onChange={(e) => updateFilter('minAvgHr', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="insights-inline-filter short-field">
            <label>קצב מקס׳</label>
            <input type="number" step="0.1" value={queryState.filters?.maxPace ?? ''} onChange={(e) => updateFilter('maxPace', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
        </div>

        <div className="insight-boolean-row">
          <button className={queryState.filters?.hasPain ? 'segmented-btn selected' : 'segmented-btn'} onClick={() => updateFilter('hasPain', queryState.filters?.hasPain ? undefined : true)}>רק ימים/אימונים עם כאב</button>
          <button className={queryState.filters?.hasPreRunMeal ? 'segmented-btn selected' : 'segmented-btn'} onClick={() => updateFilter('hasPreRunMeal', queryState.filters?.hasPreRunMeal ? undefined : true)}>רק עם מזון לפני ריצה</button>
          <button className={queryState.filters?.hasFueling ? 'segmented-btn selected' : 'segmented-btn'} onClick={() => updateFilter('hasFueling', queryState.filters?.hasFueling ? undefined : true)}>רק עם תדלוק</button>
        </div>

        <div className="insight-actions-row">
          <button className="primary-btn" onClick={() => void submitQuery()} disabled={queryLoading}>
            {queryLoading ? 'מריץ...' : 'הרץ חיפוש'}
          </button>
        </div>
      </FoldSection>
    </>
  );
}

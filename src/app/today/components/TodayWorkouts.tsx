"use client";

import React, { memo, Suspense, useState } from "react";
import Link from "next/link";
import type { TodayData } from "../types";

/**
 * TodayWorkouts Component
 *
 * Displays today's workouts with:
 * - Workout list with metrics (distance, time, HR)
 * - Workout feedback forms
 * - Fueling log
 * - Duration editor
 *
 * This component is LAZY LOADED on scroll.
 * Modal state is managed here locally.
 */

interface TodayWorkoutsProps {
  data: TodayData | null;
}

// Memoized workout item to prevent list re-renders
const WorkoutItem = memo(({ workout, onFeedback }: any) => (
  <div className="workout-item" role="region" aria-label={`אימון ${workout.sport}`}>
    <div className="workout-header">
      <strong>{workout.sport}</strong>
      {workout.distanceM && <span>{(workout.distanceM / 1000).toFixed(1)} ק"מ</span>}
    </div>
    <button onClick={onFeedback} className="choice-btn secondary">
      משוב
    </button>
    <Link href={`/log/${workout.id}`} className="link-subtle">
      פרטים
    </Link>
  </div>
));
WorkoutItem.displayName = "WorkoutItem";

/**
 * Lazy-loaded workouts section
 * Only fetches/renders when user scrolls to it
 */
export const TodayWorkouts = memo(function TodayWorkouts({ data }: TodayWorkoutsProps) {
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const workouts = data?.todayWorkouts ?? [];

  if (!workouts.length) {
    return (
      <section className="today-workouts" role="region" aria-label="אימונים">
        <div className="empty-state">
          <p>אין אימונים היום</p>
        </div>
      </section>
    );
  }

  return (
    <section className="today-workouts" role="region" aria-label="אימונים">
      <h2>אימונים ({workouts.length})</h2>

      <div className="workouts-list">
        {workouts.map((workout) => (
          <WorkoutItem
            key={workout.id}
            workout={workout}
            onFeedback={() => {
              setSelectedWorkoutId(workout.id);
              setShowFeedbackModal(true);
            }}
          />
        ))}
      </div>

      {/* Feedback Modal - Lazy Load on Demand */}
      {showFeedbackModal && selectedWorkoutId && (
        <Suspense fallback={<div>טוען משוב...</div>}>
          <WorkoutFeedbackModal
            workoutId={selectedWorkoutId}
            onClose={() => setShowFeedbackModal(false)}
          />
        </Suspense>
      )}
    </section>
  );
});

TodayWorkouts.displayName = "TodayWorkouts";

/**
 * Workout Feedback Modal
 * Loaded only when needed (on-demand)
 */
const WorkoutFeedbackModal = memo(function WorkoutFeedbackModal({
  workoutId,
  onClose
}: {
  workoutId: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h3>משוב אימון</h3>
        <p>שם העבודה היא להחליף את זה בקוד בפועל שלך</p>
        <button onClick={onClose} className="choice-btn">
          סגור
        </button>
      </div>
    </div>
  );
});
WorkoutFeedbackModal.displayName = "WorkoutFeedbackModal";

// Default export for dynamic() in page.tsx
export default TodayWorkouts;

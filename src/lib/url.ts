export type WorkoutDetailHref = `/log/${string}`;

export function workoutDetailPath(workoutId: string): WorkoutDetailHref {
  return `/log/${encodeURIComponent(workoutId)}` as WorkoutDetailHref;
}

export function decodeRouteParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

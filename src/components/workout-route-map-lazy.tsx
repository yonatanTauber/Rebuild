"use client";

import dynamic from "next/dynamic";

type RoutePoint = { lat: number; lon: number };

const WorkoutRouteMap = dynamic(() => import("./workout-route-map"), {
  ssr: false,
  loading: () => <p className="note">טוען מפה...</p>
});

export default function WorkoutRouteMapLazy({ segments }: { segments: RoutePoint[][] }) {
  return <WorkoutRouteMap segments={segments} />;
}


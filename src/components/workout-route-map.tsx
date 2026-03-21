"use client";

import { MapContainer, Polyline, TileLayer } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

type RoutePoint = { lat: number; lon: number };

function buildBounds(segments: RoutePoint[][]): LatLngBoundsExpression | null {
  const points = segments.flat();
  if (!points.length) {
    return null;
  }
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;

  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLon = Math.min(minLon, point.lon);
    maxLon = Math.max(maxLon, point.lon);
  }

  return [
    [minLat, minLon],
    [maxLat, maxLon]
  ];
}

function toPolyline(points: RoutePoint[]): LatLngExpression[] {
  return points.map((point) => [point.lat, point.lon]);
}

export default function WorkoutRouteMap({ segments }: { segments: RoutePoint[][] }) {
  const filteredSegments = segments.filter((segment) => segment.length >= 2);
  const bounds = buildBounds(filteredSegments);

  if (!bounds || filteredSegments.length === 0) {
    return <p className="note">אין נתוני מסלול זמינים לאימון הזה.</p>;
  }

  return (
    <div className="route-map-wrap">
      <MapContainer
        className="route-leaflet-map"
        bounds={bounds}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {filteredSegments.map((segment, index) => (
          <Polyline
            key={`segment-${index}`}
            positions={toPolyline(segment)}
            color="#b84242"
            weight={4}
            lineCap="round"
            lineJoin="round"
          />
        ))}
      </MapContainer>
      <p className="note">המסלול מוצג ישירות על המפה, כולל זום וגרירה מסונכרנים.</p>
    </div>
  );
}


// Agrupamos pings en una grilla de ~110m (1 milésima de grado): no es un
// clustering sofisticado, pero alcanza para detectar "pasó tiempo cerca de
// acá" sin inventar nada que no esté en los datos reales.
const GRID_FACTOR = 1000;

export type PingForClustering = { lat: number; lng: number; recordedAt: Date };

export type FrequentPlace = {
  lat: number;
  lng: number;
  visitDays: number;
  totalPings: number;
  typicalFromHour: number;
  typicalToHour: number;
};

export function clusterPings(
  pings: PingForClustering[],
  opts: { minPings: number; minDistinctDays: number; maxPlaces: number },
): FrequentPlace[] {
  type Cluster = { lat: number; lng: number; count: number; days: Set<string>; hours: number[] };
  const clusters = new Map<string, Cluster>();

  for (const ping of pings) {
    const key = `${Math.round(ping.lat * GRID_FACTOR)},${Math.round(ping.lng * GRID_FACTOR)}`;
    const existing = clusters.get(key);
    const dayKey = ping.recordedAt.toISOString().slice(0, 10);
    const hour = ping.recordedAt.getUTCHours();
    if (existing) {
      existing.lat += ping.lat;
      existing.lng += ping.lng;
      existing.count += 1;
      existing.days.add(dayKey);
      existing.hours.push(hour);
    } else {
      clusters.set(key, { lat: ping.lat, lng: ping.lng, count: 1, days: new Set([dayKey]), hours: [hour] });
    }
  }

  return Array.from(clusters.values())
    .filter((c) => c.count >= opts.minPings && c.days.size >= opts.minDistinctDays)
    .map((c) => ({
      lat: c.lat / c.count,
      lng: c.lng / c.count,
      visitDays: c.days.size,
      totalPings: c.count,
      typicalFromHour: Math.min(...c.hours),
      typicalToHour: Math.max(...c.hours),
    }))
    .sort((a, b) => b.totalPings - a.totalPings)
    .slice(0, opts.maxPlaces);
}

// Tramos seguidos con un mismo activityType (ej. "vehicle"), para armar la
// lista de viajes del día sin tener que repetir esta lógica en cada lado.
export type ActivitySegment = { activityType: string; startAt: Date; endAt: Date; pingCount: number };

export function detectActivitySegments(
  pingsAsc: { activityType: string | null; recordedAt: Date }[],
): ActivitySegment[] {
  const segments: ActivitySegment[] = [];
  let current: ActivitySegment | null = null;

  for (const ping of pingsAsc) {
    if (!ping.activityType) {
      current = null;
      continue;
    }
    if (current && current.activityType === ping.activityType) {
      current.endAt = ping.recordedAt;
      current.pingCount += 1;
    } else {
      current = { activityType: ping.activityType, startAt: ping.recordedAt, endAt: ping.recordedAt, pingCount: 1 };
      segments.push(current);
    }
  }
  return segments;
}

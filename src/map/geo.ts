// Small geodesy helpers. Everything is in degrees / metres unless stated.

export const EARTH_R = 6371000
export const deg2rad = (d: number) => (d * Math.PI) / 180
export const rad2deg = (r: number) => (r * 180) / Math.PI

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(a))
}

/** Initial bearing from point 1 to point 2, 0..360 clockwise from north. */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = deg2rad(lat1)
  const p2 = deg2rad(lat2)
  const dl = deg2rad(lon2 - lon1)
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (rad2deg(Math.atan2(y, x)) + 360) % 360
}

/** Point reached after travelling `distM` metres on `bearingDeg` from a start. */
export function destinationPoint(lat: number, lon: number, bearingDeg: number, distM: number) {
  const d = distM / EARTH_R
  const b = deg2rad(bearingDeg)
  const p1 = deg2rad(lat)
  const l1 = deg2rad(lon)
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b))
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2))
  return { lat: rad2deg(p2), lon: ((rad2deg(l2) + 540) % 360) - 180 }
}

/** Local flat projection: metres east (x) and north (y) of a centre point. */
export function localMeters(lat: number, lon: number, cLat: number, cLon: number) {
  const mPerDegLat = 111320
  const mPerDegLon = 111320 * Math.cos(deg2rad(cLat))
  return { x: (lon - cLon) * mPerDegLon, y: (lat - cLat) * mPerDegLat }
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export function cardinal(deg: number): string {
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

export type Units = 'metric' | 'imperial'

export function formatDistance(m: number, units: Units): string {
  if (units === 'imperial') {
    const ft = m * 3.28084
    if (ft < 1000) return `${Math.round(ft)} ft`
    const mi = m / 1609.344
    return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`
  }
  if (m < 1000) return `${Math.round(m)} m`
  const km = m / 1000
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

export function speedValue(mps: number, units: Units): number {
  return units === 'imperial' ? mps * 2.236936 : mps * 3.6
}

export function speedUnit(units: Units): string {
  return units === 'imperial' ? 'mph' : 'km/h'
}

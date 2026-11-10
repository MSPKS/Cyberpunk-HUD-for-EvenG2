// Nominatim (OpenStreetMap) reverse geocoding for the street label and
// forward geocoding for the destination box. Nominatim asks for at most one
// request per second and no bulk use; we only call it when you've moved.

import { haversine } from '../map/geo'

const BASE = 'https://nominatim.openstreetmap.org'
const MIN_MOVE_M = 35
const MIN_GAP_MS = 12000

export interface Place {
  street: string | null
  locality: string | null
}

export class ReverseGeocoder {
  private lastLat: number | null = null
  private lastLon: number | null = null
  private lastAt = 0
  private inflight = false
  status = 'idle'

  constructor(private onPlace: (p: Place) => void) {}

  update(lat: number, lon: number): void {
    if (this.inflight) return
    const now = Date.now()
    if (this.lastLat !== null && this.lastLon !== null) {
      if (haversine(lat, lon, this.lastLat, this.lastLon) < MIN_MOVE_M) return
      if (now - this.lastAt < MIN_GAP_MS) return
    }
    this.inflight = true
    this.lastAt = now
    this.lastLat = lat
    this.lastLon = lon
    fetch(`${BASE}/reverse?format=jsonv2&zoom=17&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`, {
      headers: { Accept: 'application/json' },
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { address?: Record<string, string> }) => {
        const a = j.address ?? {}
        const street = a.road ?? a.pedestrian ?? a.footway ?? a.neighbourhood ?? null
        const locality = a.neighbourhood ?? a.suburb ?? a.quarter ?? a.city_district ?? a.city ?? a.town ?? a.village ?? null
        this.status = 'ok'
        this.onPlace({ street, locality: locality === street ? a.city ?? a.town ?? null : locality })
      })
      .catch(err => {
        this.status = `error: ${err instanceof Error ? err.message : String(err)}`
      })
      .finally(() => {
        this.inflight = false
      })
  }
}

export async function searchPlace(query: string, near?: { lat: number; lon: number }) {
  const params = new URLSearchParams({ format: 'jsonv2', q: query, limit: '1' })
  if (near) {
    // Bias results to the user's surroundings (±0.5°).
    params.set('viewbox', `${near.lon - 0.5},${near.lat + 0.5},${near.lon + 0.5},${near.lat - 0.5}`)
  }
  const res = await fetch(`${BASE}/search?${params}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string; name?: string }[]
  if (!rows.length) return null
  const r = rows[0]
  return { name: r.name || r.display_name.split(',')[0], lat: parseFloat(r.lat), lon: parseFloat(r.lon) }
}

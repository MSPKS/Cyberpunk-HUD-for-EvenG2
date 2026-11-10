// Pulls real road / water / park geometry from OpenStreetMap through the
// Overpass API and keeps a small cache of "chunks" (≈1.3 km squares) so the
// minimap can rotate and pan locally without touching the network.
//
// Buildings are deliberately excluded: a dense downtown box with buildings
// makes the public Overpass servers time out and returns several megabytes.

import { haversine } from './geo'

export type WayKind = 'road' | 'water' | 'park'

export interface MapWay {
  kind: WayKind
  /** highway class for roads (e.g. "primary"), empty otherwise */
  cls: string
  /** flat [lat0, lon0, lat1, lon1, ...] */
  pts: Float64Array
}

export interface MapChunk {
  lat: number
  lon: number
  ways: MapWay[]
  fetchedAt: number
}

/** Half-size of the fetched box in degrees of latitude (≈670 m). */
const HALF_DEG_LAT = 0.006
/** A cached chunk is reused while the user stays within this many metres of its centre. */
const REUSE_RADIUS_M = 350
const MAX_CHUNKS = 8
const MIN_GAP_MS = 8000
const BACKOFF_MS = 30000

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const ROAD_CLASSES =
  '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$'

interface OverpassElement {
  type: string
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
}

export class OverpassSource {
  private chunks: MapChunk[] = []
  private inflight: Promise<void> | null = null
  private nextAllowedAt = 0
  private endpointIdx = 0

  status = 'idle'
  onChange: (() => void) | null = null

  /** Nearest cached chunk (may be stale/far); null if nothing cached yet. */
  best(lat: number, lon: number): MapChunk | null {
    let best: MapChunk | null = null
    let bestD = Infinity
    for (const c of this.chunks) {
      const d = haversine(lat, lon, c.lat, c.lon)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    return best
  }

  /** Kick off a fetch if no cached chunk covers this position. */
  ensure(lat: number, lon: number): void {
    const b = this.best(lat, lon)
    if (b && haversine(lat, lon, b.lat, b.lon) <= REUSE_RADIUS_M) return
    if (this.inflight || Date.now() < this.nextAllowedAt) return
    this.inflight = this.fetchChunk(lat, lon).finally(() => {
      this.inflight = null
    })
  }

  private buildQuery(lat: number, lon: number): string {
    const dLat = HALF_DEG_LAT
    const dLon = HALF_DEG_LAT / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
    const bbox = `${(lat - dLat).toFixed(5)},${(lon - dLon).toFixed(5)},${(lat + dLat).toFixed(5)},${(lon + dLon).toFixed(5)}`
    return (
      `[out:json][timeout:25];(` +
      `way["highway"~"${ROAD_CLASSES}"](${bbox});` +
      `way["natural"="water"](${bbox});` +
      `way["leisure"="park"](${bbox});` +
      `way["landuse"~"^(grass|park|recreation_ground)$"](${bbox});` +
      `);out geom;`
    )
  }

  private async fetchChunk(lat: number, lon: number): Promise<void> {
    this.status = 'fetching'
    this.onChange?.()
    const url = ENDPOINTS[this.endpointIdx % ENDPOINTS.length]
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(this.buildQuery(lat, lon)),
      })
      if (!res.ok) throw new Error(`Overpass ${res.status}`)
      const json = (await res.json()) as { elements: OverpassElement[] }
      const ways: MapWay[] = []
      for (const el of json.elements) {
        if (el.type !== 'way' || !el.geometry || !el.tags) continue
        let kind: WayKind
        if (el.tags.highway) kind = 'road'
        else if (el.tags.natural === 'water') kind = 'water'
        else kind = 'park'
        const pts = new Float64Array(el.geometry.length * 2)
        el.geometry.forEach((g, i) => {
          pts[i * 2] = g.lat
          pts[i * 2 + 1] = g.lon
        })
        ways.push({ kind, cls: el.tags.highway ?? '', pts })
      }
      this.chunks.push({ lat, lon, ways, fetchedAt: Date.now() })
      if (this.chunks.length > MAX_CHUNKS) this.chunks.shift()
      this.status = `ok (${ways.length} ways)`
      this.nextAllowedAt = Date.now() + MIN_GAP_MS
    } catch (err) {
      this.endpointIdx++
      this.status = `error: ${err instanceof Error ? err.message : String(err)}`
      this.nextAllowedAt = Date.now() + BACKOFF_MS
    }
    this.onChange?.()
  }
}

// Current temperature from Open-Meteo (free, no key, CORS enabled).
// Refetched at most every 10 minutes, or sooner after moving ~2 km.

import { haversine } from '../map/geo'

const REFRESH_MS = 10 * 60 * 1000
const MOVE_M = 2000
const URL = 'https://api.open-meteo.com/v1/forecast'

export class WeatherSource {
  tempC: number | null = null
  status = 'idle'
  private at: { lat: number; lon: number; t: number } | null = null
  private inflight = false

  update(lat: number, lon: number): void {
    if (this.inflight) return
    const a = this.at
    if (a && Date.now() - a.t < REFRESH_MS && haversine(a.lat, a.lon, lat, lon) < MOVE_M) return
    this.inflight = true
    this.status = 'fetching'
    const q = `?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m`
    fetch(URL + q)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { current?: { temperature_2m?: number } }) => {
        const t = j.current?.temperature_2m
        this.tempC = typeof t === 'number' ? t : null
        this.status = this.tempC === null ? 'no data' : `${this.tempC.toFixed(1)} °C`
        this.at = { lat, lon, t: Date.now() }
      })
      .catch(err => {
        this.status = `error: ${err instanceof Error ? err.message : String(err)}`
        // Back off for a minute before retrying.
        this.at = { lat, lon, t: Date.now() - REFRESH_MS + 60_000 }
      })
      .finally(() => {
        this.inflight = false
      })
  }
}

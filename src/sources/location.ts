// Position source with graceful fallbacks:
//   1. Even App bridge location (the phone's GPS, needs "location" permission)
//   2. WebView navigator.geolocation
//   3. Demo walk (simulated stroll around downtown San Francisco) — used by
//      the desktop simulator, or when nothing else delivers a fix.

import { AppLocationAccuracy, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { destinationPoint } from '../map/geo'
import type { LocationSource } from '../hud/state'

export interface Fix {
  lat: number
  lon: number
  accuracy: number | null
  altitude: number | null
  speed: number | null
  heading: number | null
  ts: number
}

const FIX_TIMEOUT_MS = 12000
const DEMO_START = { lat: 37.7873, lon: -122.4071 } // Union Square, SF

export class LocationService {
  private source: LocationSource = 'none'
  private unsub: (() => void) | null = null
  private watchId: number | null = null
  private demoTimer: number | null = null
  private fallbackTimer: number | null = null
  private forcedDemo = false
  private gotFix = false

  constructor(
    private bridge: EvenAppBridge | null,
    private onFix: (fix: Fix, source: LocationSource) => void,
    private onSource: (source: LocationSource, detail: string) => void,
  ) {}

  get current(): LocationSource {
    return this.source
  }

  async start(): Promise<void> {
    if (this.forcedDemo) return this.startDemo('demo mode enabled')
    if (this.bridge) {
      const ok = await this.tryEven()
      if (ok) return
    }
    if (this.tryBrowser()) return
    this.unavailable('no location API available')
  }

  /** Nothing delivers a fix: stay in a clear "no signal" state (no fake data). */
  private unavailable(reason: string) {
    this.source = 'none'
    this.onSource('none', reason)
  }

  setDemo(on: boolean): void {
    this.forcedDemo = on
    this.stop()
    void this.start()
  }

  stop(): void {
    this.unsub?.()
    this.unsub = null
    if (this.watchId !== null) navigator.geolocation?.clearWatch(this.watchId)
    this.watchId = null
    if (this.demoTimer !== null) window.clearInterval(this.demoTimer)
    this.demoTimer = null
    if (this.fallbackTimer !== null) window.clearTimeout(this.fallbackTimer)
    this.fallbackTimer = null
    if (this.source === 'even') void this.bridge?.stopAppLocationUpdates().catch(() => {})
    this.gotFix = false
  }

  private armFallback(next: () => void) {
    this.fallbackTimer = window.setTimeout(() => {
      if (!this.gotFix) {
        this.stop()
        next()
      }
    }, FIX_TIMEOUT_MS)
  }

  private deliver(fix: Fix) {
    this.gotFix = true
    this.onFix(fix, this.source)
  }

  private async tryEven(): Promise<boolean> {
    const bridge = this.bridge!
    try {
      this.source = 'even'
      this.onSource('even', 'requesting phone GPS via Even App')
      this.unsub = bridge.onAppLocationChanged(loc => {
        this.deliver({
          lat: loc.latitude,
          lon: loc.longitude,
          accuracy: loc.accuracy ?? null,
          altitude: loc.altitude ?? null,
          speed: loc.speed ?? null,
          heading: loc.heading ?? null,
          ts: loc.timestamp ?? Date.now(),
        })
      })
      const started = await withTimeout(
        bridge.startAppLocationUpdates({ accuracy: AppLocationAccuracy.High, intervalMs: 1000, distanceFilter: 0 }),
        6000,
        false,
      )
      if (!started) throw new Error('startAppLocationUpdates returned false')
      // One-shot fix so the HUD populates immediately.
      const first = await withTimeout(bridge.getAppLocation({ accuracy: AppLocationAccuracy.High, timeoutMs: 8000 }), 9000, null)
      if (first) {
        this.deliver({
          lat: first.latitude,
          lon: first.longitude,
          accuracy: first.accuracy ?? null,
          altitude: first.altitude ?? null,
          speed: first.speed ?? null,
          heading: first.heading ?? null,
          ts: first.timestamp ?? Date.now(),
        })
      }
      this.armFallback(() => {
        this.onSource('none', 'Even location denied or silent — falling back')
        if (!this.tryBrowser()) this.unavailable('no browser geolocation either')
      })
      return true
    } catch (err) {
      this.onSource('none', `Even location unavailable: ${err instanceof Error ? err.message : String(err)}`)
      this.unsub?.()
      this.unsub = null
      return false
    }
  }

  private tryBrowser(): boolean {
    if (!('geolocation' in navigator)) return false
    this.source = 'browser'
    this.onSource('browser', 'using navigator.geolocation')
    this.watchId = navigator.geolocation.watchPosition(
      pos => {
        const c = pos.coords
        this.deliver({
          lat: c.latitude,
          lon: c.longitude,
          accuracy: c.accuracy ?? null,
          altitude: c.altitude ?? null,
          speed: c.speed ?? null,
          heading: c.heading !== null && !Number.isNaN(c.heading) ? c.heading : null,
          ts: pos.timestamp,
        })
      },
      err => {
        this.stop()
        this.unavailable(`geolocation error: ${err.message}`)
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    )
    this.armFallback(() => this.unavailable('no geolocation fix'))
    return true
  }

  private startDemo(reason: string) {
    this.source = 'demo'
    this.onSource('demo', reason)
    let lat = DEMO_START.lat
    let lon = DEMO_START.lon
    let heading = 20
    let legMeters = 0
    const speed = 1.5 // m/s, brisk walk
    const tick = () => {
      // Walk a rough rectangle: turn 90° every ~180 m.
      const step = speed
      const p = destinationPoint(lat, lon, heading, step)
      lat = p.lat
      lon = p.lon
      legMeters += step
      if (legMeters > 180) {
        legMeters = 0
        heading = (heading + 90) % 360
      }
      this.deliver({ lat, lon, accuracy: 6, altitude: 24, speed, heading, ts: Date.now() })
    }
    tick()
    this.demoTimer = window.setInterval(tick, 1000)
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const t = window.setTimeout(() => resolve(fallback), ms)
    p.then(v => {
      window.clearTimeout(t)
      resolve(v)
    }).catch(() => {
      window.clearTimeout(t)
      resolve(fallback)
    })
  })
}

import type { Units } from '../map/geo'

export interface Destination {
  name: string
  lat: number
  lon: number
}

export interface HudNotification {
  title: string
  body: string
  until: number
}

export type LocationSource = 'even' | 'browser' | 'demo' | 'none'

export interface HudState {
  now: Date
  lat: number | null
  lon: number | null
  accuracy: number | null
  altitude: number | null
  speedMps: number | null
  /** Degrees clockwise from north; null until known. */
  heading: number | null
  headingUp: boolean
  zoomIndex: number
  units: Units
  street: string | null
  locality: string | null
  destination: Destination | null
  /** When the tracker last became empty; it hides 30 s later. */
  noJobSince: number
  /** Current outdoor temperature in °C, null until fetched. */
  tempC: number | null
  crosshair: boolean
  /** 0..100 */
  glassesBattery: number | null
  glassesConnected: boolean
  locationSource: LocationSource
  notification: HudNotification | null
}

export function initialState(): HudState {
  return {
    now: new Date(),
    lat: null,
    lon: null,
    accuracy: null,
    altitude: null,
    speedMps: null,
    heading: null,
    headingUp: true,
    zoomIndex: 1,
    units: 'metric',
    street: null,
    locality: null,
    destination: null,
    noJobSince: Date.now(),
    tempC: null,
    crosshair: false,
    glassesBattery: null,
    glassesConnected: false,
    locationSource: 'none',
    notification: null,
  }
}

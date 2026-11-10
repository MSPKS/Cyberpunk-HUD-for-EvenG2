// Entry point. Runs inside the Even App WebView (real glasses), inside the
// desktop evenhub-simulator, or in a plain browser (preview only).

import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  waitForEvenAppBridge,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { CANVAS_H, CANVAS_W, CONTAINERS, EVENT_LAYER_ID, ZOOM_METERS } from './hud/layout'
import { initialState, type Destination, type HudState } from './hud/state'
import { drawHud } from './hud/draw'
import { OverpassSource } from './map/overpass'
import { LocationService, type Fix } from './sources/location'
import { ReverseGeocoder, searchPlace } from './sources/geocode'
import { watchGlassesBattery } from './sources/battery'
import { enableCompass } from './sources/compass'
import { WeatherSource } from './sources/weather'
import { GlassesPusher } from './glasses/pusher'
import type { Units } from './map/geo'

const BRIDGE_WAIT_MS = 2500
const TICK_MS = 500
const SETTINGS_KEY = 'cphud.settings'

interface Settings {
  units: Units
  headingUp: boolean
  zoomIndex: number
  destination: Destination | null
  mapIntervalMs: number
  demo: boolean
  crosshair: boolean
}

const MENU = [
  new MenuItemProperty({ itemName: 'Zoom in', itemID: 1 }),
  new MenuItemProperty({ itemName: 'Zoom out', itemID: 2 }),
  new MenuItemProperty({ itemName: 'Heading up / North up', itemID: 3 }),
  new MenuItemProperty({ itemName: 'Metric / Imperial', itemID: 4 }),
  new MenuItemProperty({ itemName: 'Clear destination', itemID: 5 }),
]

// ── boot ─────────────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const log = (msg: string) => {
  const el = $('log')
  const line = `${new Date().toLocaleTimeString()}  ${msg}`
  el.textContent = (line + '\n' + (el.textContent ?? '')).split('\n').slice(0, 40).join('\n')
  console.log(msg)
}

const state: HudState = initialState()
const settings = loadSettings()
// `?demo=1` forces the simulated walk (handy for the desktop simulator and
// for capturing store screenshots). It is never persisted.
const DEMO_TARGET: Destination = { name: 'Ferry Building', lat: 37.7955, lon: -122.3935 }
const qs = new URLSearchParams(window.location.search)
if (qs.get('demo') === '1') settings.demo = true
// Dev-only overrides for screenshots; like `demo`, never persisted.
if (qs.get('crosshair') === '1') settings.crosshair = true
if (qs.get('units') === 'imperial' || qs.get('units') === 'metric') settings.units = qs.get('units') as Units
state.units = settings.units
state.headingUp = settings.headingUp
state.zoomIndex = settings.zoomIndex
state.destination = settings.destination
state.crosshair = settings.crosshair
CONTAINERS.map.minIntervalMs = settings.mapIntervalMs

const master = document.createElement('canvas')
master.width = CANVAS_W
master.height = CANVAS_H
const ctx = master.getContext('2d', { willReadFrequently: true })!
const preview = $<HTMLCanvasElement>('preview')
const pctx = preview.getContext('2d')!

await Promise.allSettled([
  document.fonts.load('500 12px Rajdhani'),
  document.fonts.load('600 12px Rajdhani'),
  document.fonts.load('700 12px Rajdhani'),
])

const bridge = await connectBridge()
const overpass = new OverpassSource()
overpass.onChange = () => log(`map data: ${overpass.status}`)
const weather = new WeatherSource()
const pusher = new GlassesPusher(bridge, master)
pusher.onStats = refreshStatus

let compassHeading: number | null = null
let pageActive = false

const geocoder = new ReverseGeocoder(p => {
  state.street = p.street
  state.locality = p.locality
})

const location = new LocationService(
  bridge,
  onFix,
  (source, detail) => {
    const wasNone = state.locationSource === 'none'
    state.locationSource = source
    log(`location: ${source} — ${detail}`)
    if (source === 'demo') {
      notify('Demo mode', 'Simulated walk around San Francisco')
      if (!state.destination) state.destination = DEMO_TARGET // showcase the tracker; not saved
    }
    if (source === 'none' && !wasNone) {
      notify('Location unavailable', 'Allow location for Cyberpunk HUD in the Even app', 12000)
    }
  },
)

if (bridge) {
  watchGlassesBattery(bridge, (level, connected) => {
    if (level !== null && state.glassesBattery !== null && level <= 15 && state.glassesBattery > 15) {
      notify('Glasses battery low', `${level}% remaining`)
    }
    state.glassesBattery = level
    state.glassesConnected = connected
  })
  const created = await createPage(bridge)
  log(created ? 'glasses page created' : 'glasses page creation FAILED')
  pageActive = created
  if (created) wireGlassesEvents(bridge)
} else {
  log('no Even bridge — preview only (open this page inside the Even app)')
}

if (settings.demo) location.setDemo(true)
else void location.start()

wirePhoneUi()
tick()
window.setInterval(tick, TICK_MS)

// Close the glasses page when the WebView goes away (dev reloads included).
window.addEventListener('pagehide', () => {
  if (bridge && pageActive) void bridge.shutDownPageContainer(0)
})

// ── loop ─────────────────────────────────────────────────────────────────────
function tick() {
  state.now = new Date()
  state.tempC = weather.tempC
  if (state.notification && state.notification.until < Date.now()) state.notification = null
  const chunk = state.lat !== null && state.lon !== null ? overpass.best(state.lat, state.lon) : null
  drawHud(ctx, state, chunk)
  drawPreview()
  if (pageActive) pusher.sync()
  refreshStatus()
}

function onFix(fix: Fix, source: HudState['locationSource']) {
  const first = state.lat === null
  state.lat = fix.lat
  state.lon = fix.lon
  state.accuracy = fix.accuracy
  state.altitude = fix.altitude
  state.speedMps = fix.speed !== null && fix.speed >= 0 ? fix.speed : 0
  if (fix.heading !== null && (fix.speed ?? 0) > 0.7) state.heading = fix.heading
  else if (compassHeading !== null) state.heading = compassHeading
  else if (state.heading === null && fix.heading !== null) state.heading = fix.heading
  state.locationSource = source
  overpass.ensure(fix.lat, fix.lon)
  geocoder.update(fix.lat, fix.lon)
  weather.update(fix.lat, fix.lon)
  state.tempC = weather.tempC
  if (first) notify('GPS lock acquired', `Position via ${source === 'even' ? 'Even App' : source}`)
}

function notify(title: string, body: string, ms = 6000) {
  state.notification = { title, body, until: Date.now() + ms }
}

// ── glasses ──────────────────────────────────────────────────────────────────
function connectBridge(): Promise<EvenAppBridge | null> {
  // The SDK hands back a bridge object even in a plain browser; only the Even
  // App WebView (and the simulator) install the Flutter handler it talks to.
  const w = window as Window & { flutter_inappwebview?: { callHandler?: unknown } }
  if (typeof w.flutter_inappwebview?.callHandler !== 'function') return Promise.resolve(null)
  return new Promise(resolve => {
    const t = window.setTimeout(() => resolve(null), BRIDGE_WAIT_MS)
    waitForEvenAppBridge()
      .then(b => {
        window.clearTimeout(t)
        resolve(b)
      })
      .catch(() => {
        window.clearTimeout(t)
        resolve(null)
      })
  })
}

async function createPage(b: EvenAppBridge): Promise<boolean> {
  // Image containers can't capture input, so an invisible full-screen text
  // container sits at the back and receives the touchpad events.
  const eventLayer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: CANVAS_W,
    height: CANVAS_H,
    borderWidth: 0,
    borderColor: 0,
    paddingLength: 0,
    containerID: EVENT_LAYER_ID,
    containerName: 'events',
    content: ' ',
    isEventCapture: 1,
    zOrderIndex: 1,
  })
  const images = Object.values(CONTAINERS).map(
    (c, i) =>
      new ImageContainerProperty({
        xPosition: c.rect.x,
        yPosition: c.rect.y,
        width: c.rect.w,
        height: c.rect.h,
        containerID: c.id,
        containerName: c.name,
        zOrderIndex: 2 + i,
      }),
  )
  const page = {
    containerTotalNum: 1 + images.length,
    textObject: [eventLayer],
    imageObject: images,
    menuObject: new MenuContainerProperty({ menuItems: MENU }),
  }
  const result = await b.createStartUpPageContainer(new CreateStartUpPageContainer(page))
  pusher.invalidate()
  if (result === StartUpPageCreateResult.success) return true
  // A page from a previous run may still be open (dev reloads, relaunch from
  // the glasses menu). Rebuilding replaces it in place.
  console.warn('createStartUpPageContainer:', result, '— trying rebuildPageContainer')
  const rebuilt = await b.rebuildPageContainer(new RebuildPageContainer(page))
  if (!rebuilt) console.error('rebuildPageContainer failed')
  return rebuilt
}

// CLICK_EVENT is 0 and protobuf drops zero fields, so a tap arrives with no
// eventType at all. Resolve the default inside the envelope check.
function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

function wireGlassesEvents(b: EvenAppBridge) {
  const unsub = b.onEvenHubEvent(ev => {
    if (ev.menuItemClickEvent) {
      handleMenu(ev.menuItemClickEvent.itemID ?? 0)
      return
    }
    const sys = eventTypeOf(ev.sysEvent)
    const txt = eventTypeOf(ev.textEvent)
    const is = (t: OsEventTypeList) => sys === t || txt === t

    if (is(OsEventTypeList.DOUBLE_CLICK_EVENT)) {
      pageActive = false
      void b.shutDownPageContainer(1)
      log('glasses page closed (double-tap)')
      return
    }
    if (is(OsEventTypeList.SCROLL_TOP_EVENT)) return setZoom(state.zoomIndex - 1)
    if (is(OsEventTypeList.SCROLL_BOTTOM_EVENT)) return setZoom(state.zoomIndex + 1)
    if (is(OsEventTypeList.LONG_PRESS_EVENT)) return setHeadingUp(!state.headingUp)
    if (is(OsEventTypeList.LONG_PRESS_RELEASE_EVENT)) return
    if (is(OsEventTypeList.CLICK_EVENT)) return setZoom((state.zoomIndex + 1) % ZOOM_METERS.length)
    if (sys === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
      pusher.invalidate()
      return
    }
    if (sys === OsEventTypeList.SYSTEM_EXIT_EVENT || sys === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      pageActive = false
      unsub()
      location.stop()
      log('glasses page exited')
    }
  })
}

function handleMenu(id: number) {
  switch (id) {
    case 1:
      return setZoom(state.zoomIndex - 1)
    case 2:
      return setZoom(state.zoomIndex + 1)
    case 3:
      return setHeadingUp(!state.headingUp)
    case 4:
      return setUnits(state.units === 'metric' ? 'imperial' : 'metric')
    case 5:
      return setDestination(null)
  }
}

// ── settings ─────────────────────────────────────────────────────────────────
function setZoom(i: number) {
  state.zoomIndex = Math.max(0, Math.min(ZOOM_METERS.length - 1, i))
  saveSettings()
  syncControls()
}
function setHeadingUp(v: boolean) {
  state.headingUp = v
  saveSettings()
  syncControls()
}
function setUnits(u: Units) {
  state.units = u
  saveSettings()
  syncControls()
}
function setDestination(d: Destination | null) {
  state.destination = d
  if (d) notify('New job', d.name)
  else state.noJobSince = Date.now() // show "NO ACTIVE JOB" briefly, then hide
  saveSettings()
  syncControls()
}
function setCrosshair(v: boolean) {
  state.crosshair = v
  saveSettings()
  syncControls()
}

function loadSettings(): Settings {
  const def: Settings = {
    units: 'metric', headingUp: true, zoomIndex: 1, destination: null, mapIntervalMs: 2000, demo: false, crosshair: false,
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...def, ...(JSON.parse(raw) as Partial<Settings>) } : def
  } catch {
    return def
  }
}
function saveSettings() {
  const s: Settings = {
    units: state.units,
    headingUp: state.headingUp,
    zoomIndex: state.zoomIndex,
    destination: state.destination,
    mapIntervalMs: CONTAINERS.map.minIntervalMs,
    demo: $<HTMLInputElement>('demo').checked,
    crosshair: state.crosshair,
  }
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable */
  }
}

// ── phone page ───────────────────────────────────────────────────────────────
function drawPreview() {
  pctx.setTransform(1, 0, 0, 1, 0, 0)
  pctx.globalCompositeOperation = 'source-over'
  pctx.fillStyle = '#000'
  pctx.fillRect(0, 0, preview.width, preview.height)
  pctx.drawImage(master, 0, 0)
  // Tint to the glasses' green.
  pctx.globalCompositeOperation = 'multiply'
  pctx.fillStyle = '#5cff7a'
  pctx.fillRect(0, 0, preview.width, preview.height)
  pctx.globalCompositeOperation = 'source-over'
}

function wirePhoneUi() {
  $<HTMLInputElement>('demo').checked = settings.demo
  $<HTMLInputElement>('demo').addEventListener('change', e => {
    location.setDemo((e.target as HTMLInputElement).checked)
    saveSettings()
  })
  $<HTMLSelectElement>('units').addEventListener('change', e => setUnits((e.target as HTMLSelectElement).value as Units))
  $<HTMLInputElement>('crosshair').addEventListener('change', e => setCrosshair((e.target as HTMLInputElement).checked))
  $<HTMLSelectElement>('orientation').addEventListener('change', e => setHeadingUp((e.target as HTMLSelectElement).value === 'heading'))
  $<HTMLSelectElement>('zoom').addEventListener('change', e => setZoom(Number((e.target as HTMLSelectElement).value)))
  $<HTMLSelectElement>('interval').addEventListener('change', e => {
    CONTAINERS.map.minIntervalMs = Number((e.target as HTMLSelectElement).value)
    saveSettings()
  })
  $<HTMLButtonElement>('dest-set').addEventListener('click', async () => {
    const q = $<HTMLInputElement>('dest').value.trim()
    if (!q) return
    log(`searching "${q}"…`)
    try {
      const near = state.lat !== null && state.lon !== null ? { lat: state.lat, lon: state.lon } : undefined
      const found = await searchPlace(q, near)
      if (!found) return log('no results')
      setDestination(found)
      log(`destination: ${found.name} (${found.lat.toFixed(4)}, ${found.lon.toFixed(4)})`)
    } catch (err) {
      log(`search failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  })
  $<HTMLButtonElement>('dest-clear').addEventListener('click', () => setDestination(null))
  $<HTMLButtonElement>('compass').addEventListener('click', async () => {
    const ok = await enableCompass(h => {
      compassHeading = h
      if ((state.speedMps ?? 0) <= 0.7) state.heading = h
    })
    log(ok ? 'phone compass enabled' : 'compass permission denied / unsupported')
  })
  $<HTMLButtonElement>('resend').addEventListener('click', () => pusher.invalidate())
  $<HTMLButtonElement>('notify-test').addEventListener('click', () => notify('Message received', 'Test notification from the phone'))
  const zoomSel = $<HTMLSelectElement>('zoom')
  ZOOM_METERS.forEach((m, i) => {
    const o = document.createElement('option')
    o.value = String(i)
    o.textContent = `${m} m across`
    zoomSel.appendChild(o)
  })
  $<HTMLSelectElement>('interval').value = String(CONTAINERS.map.minIntervalMs)
  syncControls()
}

function syncControls() {
  $<HTMLSelectElement>('units').value = state.units
  $<HTMLInputElement>('crosshair').checked = state.crosshair
  $<HTMLSelectElement>('orientation').value = state.headingUp ? 'heading' : 'north'
  $<HTMLSelectElement>('zoom').value = String(state.zoomIndex)
  $<HTMLInputElement>('dest').value = state.destination?.name ?? ''
}

function refreshStatus() {
  const fmt = (v: number | null, d = 0) => (v === null ? '—' : v.toFixed(d))
  const rows: [string, string][] = [
    ['Bridge', bridge ? 'Even App connected' : 'not in Even App (preview only)'],
    ['Glasses', state.glassesConnected ? `connected · ${fmt(state.glassesBattery)}%` : 'not connected'],
    ['Location', `${state.locationSource} · ${fmt(state.lat, 5)}, ${fmt(state.lon, 5)} ±${fmt(state.accuracy)} m`],
    ['Heading', `${fmt(state.heading)}° (${state.headingUp ? 'heading-up' : 'north-up'})`],
    ['Speed', `${fmt(state.speedMps, 1)} m/s`],
    ['Street', `${state.street ?? '—'} / ${state.locality ?? '—'}`],
    ['Map data', overpass.status],
    ['Geocoder', geocoder.status],
    ['Weather', weather.status],
    ['Pushes', `${pusher.stats.sent} sent · last ${pusher.stats.lastResult}`],
    [
      'Push time',
      Object.entries(pusher.stats.lastMs)
        .map(([k, v]) => `${k} ${v} ms`)
        .join(' · ') || '—',
    ],
  ]
  $('status').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('')
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}

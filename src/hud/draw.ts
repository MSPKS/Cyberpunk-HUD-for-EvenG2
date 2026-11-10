// Paints the whole HUD onto a 576x288 canvas. Layout mirrors the CP2077 2.x
// HUD: clock + minimap + street top-right, quest tracker beneath it, weapon /
// ammo panel bottom-right, health + stamina + quickslots bottom-left,
// notification popups top-left.
//
// Real-world data mapping:
//   minimap ........ OpenStreetMap roads around you, heading-up
//   clock .......... real time (24h, like the game) + date + temperature
//   street ......... reverse-geocoded street + locality
//   quest tracker .. destination set on the phone: name, distance, bearing
//                    (the empty "NO ACTIVE JOB" panel hides after 30 s)
//   ammo counter ... current speed ("42 / km/h")
//   weapon name .... movement mode (ON FOOT / RUNNING / VEHICLE)
//   stamina bar .... glasses battery
//   quickslot ...... GPS accuracy
//   crosshair ...... optional, toggled from the phone page

import {
  CANVAS_H, CANVAS_W, CLOCK, CROSSHAIR, DATE, LOCALITY, MINIMAP, NOTIFY, NO_JOB_VISIBLE_MS,
  QUICKSLOTS, STAMINA_BAR, STREET, TEMP, TRACKER, WEAPON, ZOOM_METERS,
} from './layout'
import { G, L, bracket, chamferPath, font, hline, segmentedBar, tracked, vline } from './paint'
import type { HudState } from './state'
import { cardinal, formatDistance, speedUnit, speedValue } from '../map/geo'
import { drawMinimap, objectiveInfo } from '../map/minimap'
import type { MapChunk } from '../map/overpass'

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function drawHud(ctx: CanvasRenderingContext2D, s: HudState, chunk: MapChunk | null): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = G(0)
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  drawNotification(ctx, s)
  drawMapBlock(ctx, s, chunk)
  drawTracker(ctx, s)
  drawWeapon(ctx, s)
  drawVitals(ctx, s)
  if (s.crosshair) drawCrosshair(ctx)
}

// ── Top-right: clock, minimap, street ────────────────────────────────────────
function drawMapBlock(ctx: CanvasRenderingContext2D, s: HudState, chunk: MapChunk | null) {
  const hh = String(s.now.getHours()).padStart(2, '0')
  const mm = String(s.now.getMinutes()).padStart(2, '0')
  ctx.fillStyle = G(L.primary)
  ctx.font = font(600, 22)
  ctx.textAlign = 'right'
  ctx.fillText(`${hh}:${mm}`, CLOCK.right, CLOCK.baseline)
  ctx.textAlign = 'left'

  ctx.fillStyle = G(L.dim)
  ctx.font = font(600, 11)
  tracked(ctx, `${DAYS[s.now.getDay()]} ${MONTHS[s.now.getMonth()]} ${String(s.now.getDate()).padStart(2, '0')}`, DATE.right, DATE.baseline, 1.2, 'right')

  // Zoom scale hint under the date, like the game's map scale.
  ctx.fillStyle = G(L.faint)
  ctx.font = font(500, 8)
  tracked(ctx, formatDistance(ZOOM_METERS[s.zoomIndex], s.units).toUpperCase(), DATE.right, DATE.baseline + 13, 1, 'right')

  // Current temperature, in the units the rest of the HUD uses.
  if (s.tempC !== null) {
    const t = s.units === 'imperial' ? `${Math.round(s.tempC * 9 / 5 + 32)}°F` : `${Math.round(s.tempC)}°C`
    ctx.fillStyle = G(L.primary)
    ctx.font = font(700, 18)
    ctx.textAlign = 'right'
    ctx.fillText(t, TEMP.right, TEMP.baseline)
    ctx.textAlign = 'left'
    ctx.fillStyle = G(L.faint)
    ctx.font = font(600, 8)
    tracked(ctx, 'TEMP', TEMP.right, TEMP.baseline + 11, 1.5, 'right')
  }

  drawMinimap(ctx, {
    rect: MINIMAP,
    metersAcross: ZOOM_METERS[s.zoomIndex],
    heading: s.heading ?? 0,
    headingUp: s.headingUp,
    lat: s.lat,
    lon: s.lon,
    chunk,
    destination: s.destination,
    noFix: s.lat === null,
    locationOff: s.locationSource === 'none',
  })

  const street = (s.street ?? (s.lat === null ? (s.locationSource === 'none' ? 'LOCATION OFF' : 'NO SIGNAL') : 'UNKNOWN STREET')).toUpperCase()
  ctx.fillStyle = G(L.text)
  ctx.font = font(600, 11)
  tracked(ctx, fit(ctx, street, MINIMAP.w + 40), STREET.right, STREET.baseline, 0.8, 'right')
  if (s.locality) {
    ctx.fillStyle = G(L.dim)
    ctx.font = font(500, 9)
    tracked(ctx, fit(ctx, s.locality.toUpperCase(), MINIMAP.w + 40), LOCALITY.right, LOCALITY.baseline, 1, 'right')
  }
}

// ── Right-middle: quest tracker ──────────────────────────────────────────────
function drawTracker(ctx: CanvasRenderingContext2D, s: HudState) {
  // With no job, the panel shows for a while and then clears off the display.
  if (!s.destination && Date.now() - s.noJobSince > NO_JOB_VISIBLE_MS) return
  const r = TRACKER
  vline(ctx, r.x, r.y, r.y + r.h - 12, L.accent, 2)

  const title = s.destination ? s.destination.name : 'NO ACTIVE JOB'
  ctx.fillStyle = G(s.destination ? L.accent : L.dim)
  ctx.font = font(700, 13)
  tracked(ctx, fit(ctx, title.toUpperCase(), r.w - 12), r.x + 8, r.y + 12, 0.6)

  ctx.font = font(500, 11)
  ctx.fillStyle = G(L.text)
  if (s.destination && s.lat !== null && s.lon !== null) {
    const info = objectiveInfo(s.lat, s.lon, s.destination)
    ctx.fillText('Reach the destination', r.x + 8, r.y + 27)
    // Distance, right-aligned, with a small diamond like the objective marker.
    ctx.font = font(700, 12)
    ctx.fillStyle = G(L.primary)
    const dist = formatDistance(info.distM, s.units)
    ctx.textAlign = 'right'
    ctx.fillText(dist, r.x + r.w, r.y + 27)
    const dw = ctx.measureText(dist).width
    ctx.textAlign = 'left'
    diamond(ctx, r.x + r.w - dw - 9, r.y + 23, 3, L.accent)
    ctx.font = font(500, 9)
    ctx.fillStyle = G(L.dim)
    tracked(ctx, `BEARING ${String(Math.round(info.bearing)).padStart(3, '0')}° ${cardinal(info.bearing)}`, r.x + 8, r.y + 40, 1)
  } else if (s.destination) {
    ctx.fillText('Waiting for GPS fix', r.x + 8, r.y + 27)
  } else {
    ctx.fillStyle = G(L.dim)
    ctx.fillText('Set a destination on your phone', r.x + 8, r.y + 27)
  }
  // Ornament: thin rule with a tick, the game's tracker underline.
  hline(ctx, r.x + 8, r.x + r.w, r.y + r.h - 8, L.faint)
  hline(ctx, r.x + 8, r.x + 26, r.y + r.h - 8, L.accent)
}

// ── Bottom-right: weapon / ammo panel (speed) ────────────────────────────────
function drawWeapon(ctx: CanvasRenderingContext2D, s: HudState) {
  const r = WEAPON
  chamferPath(ctx, r.x, r.y, r.w, r.h, 9, { tl: true, br: true })
  ctx.fillStyle = G(L.panel)
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = G(L.frame)
  ctx.stroke()
  bracket(ctx, r.x + r.w - 1, r.y + 4, 6, L.dim, -1, 1)

  const mps = s.speedMps ?? 0
  const spd = speedValue(mps, s.units)
  const mode = mps < 0.5 ? 'STANDING' : mps < 2.2 ? 'ON FOOT' : mps < 7 ? 'RUNNING' : 'VEHICLE'

  // "Weapon name" row.
  ctx.fillStyle = G(L.text)
  ctx.font = font(600, 10)
  tracked(ctx, mode, r.x + 14, r.y + 15, 1.6)
  hline(ctx, r.x + 14, r.x + r.w - 10, r.y + 20, L.faint)

  // Ammo readout: big current value, small "/ unit".
  const big = s.speedMps === null ? '--' : String(Math.round(spd))
  ctx.fillStyle = G(L.primary)
  ctx.font = font(700, 34)
  ctx.textAlign = 'right'
  ctx.fillText(big, r.x + 92, r.y + 52)
  ctx.textAlign = 'left'
  ctx.fillStyle = G(L.dim)
  ctx.font = font(600, 14)
  ctx.fillText('/', r.x + 98, r.y + 50)
  ctx.font = font(600, 12)
  ctx.fillStyle = G(L.text)
  ctx.fillText(speedUnit(s.units), r.x + 108, r.y + 50)

  // Ammo-type pips (decorative, three dashes like the game's fire-mode indicator).
  for (let i = 0; i < 3; i++) hline(ctx, r.x + 14 + i * 9, r.x + 20 + i * 9, r.y + 28, i === 0 ? L.primary : L.faint, 2)

  // Heading / altitude, where the game shows the fire mode + crouch state.
  ctx.fillStyle = G(L.dim)
  ctx.font = font(500, 9)
  const hdg = s.heading === null ? '---' : `${String(Math.round(s.heading)).padStart(3, '0')}° ${cardinal(s.heading)}`
  tracked(ctx, `HDG ${hdg}`, r.x + 14, r.y + 42, 1)
  if (s.altitude !== null) {
    const alt = s.units === 'imperial' ? `${Math.round(s.altitude * 3.28084)} FT` : `${Math.round(s.altitude)} M`
    tracked(ctx, `ALT ${alt}`, r.x + 14, r.y + 54, 1)
  }
}

// ── Bottom-left: glasses battery + GPS quickslot ─────────────────────────────
function drawVitals(ctx: CanvasRenderingContext2D, s: HudState) {
  // Quickslot: GPS accuracy.
  const q = QUICKSLOTS
  const ok = s.lat !== null && (s.accuracy ?? 999) < 50
  const value = s.accuracy === null ? '--' : `±${Math.round(s.accuracy)}m`
  chamferPath(ctx, q.x, q.y, q.size, q.size, 5, { tl: true, br: true })
  ctx.fillStyle = G(L.panel)
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = G(ok ? L.text : L.frame)
  ctx.stroke()
  ctx.fillStyle = G(ok ? L.primary : L.dim)
  ctx.font = font(700, 10)
  tracked(ctx, 'GPS', q.x + q.size / 2, q.y + 13, 1, 'center')
  ctx.font = font(600, 9)
  ctx.fillStyle = G(ok ? L.text : L.faint)
  tracked(ctx, value, q.x + q.size / 2, q.y + 25, 0.5, 'center')
  // Slot index numeral like the game's hotkeys.
  ctx.fillStyle = G(L.faint)
  ctx.font = font(600, 8)
  ctx.fillText('1', q.x + 1, q.y - 3)

  // Stamina = glasses battery.
  const sb = STAMINA_BAR
  const gb = s.glassesBattery === null ? null : s.glassesBattery / 100
  ctx.fillStyle = G(L.dim)
  ctx.font = font(600, 9)
  tracked(ctx, 'G2', sb.x, sb.y - 4, 1.5)
  ctx.fillStyle = G(L.health)
  ctx.font = font(700, 17)
  ctx.textAlign = 'right'
  ctx.fillText(gb === null ? '--' : String(Math.round(gb * 100)), sb.x - 8, sb.y + sb.h + 2)
  ctx.textAlign = 'left'
  segmentedBar(ctx, sb.x, sb.y, sb.w, sb.h, gb, 20, L.health, L.empty)

  // Corner ornament.
  bracket(ctx, sb.x - 44, sb.y + sb.h + 16, 8, L.faint, 1, -1)
}

// ── Centre: optional crosshair ───────────────────────────────────────────────
function drawCrosshair(ctx: CanvasRenderingContext2D) {
  const { cx, cy, gap, len } = CROSSHAIR
  hline(ctx, cx - gap - len, cx - gap, cy, L.text, 1)
  hline(ctx, cx + gap, cx + gap + len, cy, L.text, 1)
  vline(ctx, cx, cy - gap - len, cy - gap, L.text, 1)
  vline(ctx, cx, cy + gap, cy + gap + len, L.text, 1)
  ctx.fillStyle = G(L.primary)
  ctx.fillRect(cx - 1, cy - 1, 2, 2)
}

// ── Top-left: notification popup ─────────────────────────────────────────────
function drawNotification(ctx: CanvasRenderingContext2D, s: HudState) {
  const n = s.notification
  if (!n || n.until < Date.now()) return
  const r = NOTIFY
  chamferPath(ctx, r.x, r.y, r.w, r.h, 8, { tl: true, br: true })
  ctx.fillStyle = G(L.panel)
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = G(L.frame)
  ctx.stroke()
  // Title bar: bright fill with dark text, like the game's popup header.
  ctx.save()
  chamferPath(ctx, r.x, r.y, r.w, 16, 8, { tl: true })
  ctx.clip()
  ctx.fillStyle = G(L.accent)
  ctx.fillRect(r.x, r.y, r.w, 16)
  ctx.restore()
  ctx.fillStyle = G(0)
  ctx.font = font(700, 10)
  tracked(ctx, n.title.toUpperCase(), r.x + 12, r.y + 12, 1.4)
  ctx.fillStyle = G(L.text)
  ctx.font = font(500, 11)
  ctx.fillText(fit(ctx, n.body, r.w - 16), r.x + 8, r.y + 34)
}

// ── helpers ──────────────────────────────────────────────────────────────────
function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, level: number) {
  ctx.fillStyle = G(level)
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx + r, cy)
  ctx.lineTo(cx, cy + r)
  ctx.lineTo(cx - r, cy)
  ctx.closePath()
  ctx.fill()
}

/** Truncates text with an ellipsis so it fits `maxW` in the current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

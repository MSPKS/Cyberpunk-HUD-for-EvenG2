// Renders the real-world minimap in the Cyberpunk 2077 style: dark rounded
// panel, roads as bright lines, compass strip along the top, player arrow
// fixed at the centre with a view cone, objective marker clamped to the edge.

import type { Rect } from '../hud/layout'
import { COMPASS_H } from '../hud/layout'
import type { Destination } from '../hud/state'
import { G, L, font, lvl, roundedPath, tracked } from '../hud/paint'
import { bearing, haversine, localMeters } from './geo'
import type { MapChunk } from './overpass'

export interface MinimapOpts {
  rect: Rect
  metersAcross: number
  heading: number
  headingUp: boolean
  lat: number | null
  lon: number | null
  chunk: MapChunk | null
  destination: Destination | null
  /** Draw a "searching" state instead of map data. */
  noFix: boolean
  /** No location source at all (permission denied) vs. still acquiring. */
  locationOff?: boolean
}

// [line width px, brightness] per OSM highway class.
const ROAD_STYLE: Record<string, [number, number]> = {
  motorway: [4, 245],
  trunk: [4, 245],
  motorway_link: [2.5, 225],
  trunk_link: [2.5, 225],
  primary: [3, 230],
  primary_link: [2, 210],
  secondary: [2.5, 210],
  secondary_link: [1.8, 190],
  tertiary: [2, 190],
  tertiary_link: [1.5, 170],
  residential: [1.5, 165],
  unclassified: [1.5, 160],
  living_street: [1.2, 145],
  pedestrian: [1, 125],
}
// Draw minor roads first so major ones sit on top.
const ROAD_ORDER = [
  'pedestrian', 'living_street', 'unclassified', 'residential',
  'tertiary_link', 'tertiary', 'secondary_link', 'secondary',
  'primary_link', 'primary', 'trunk_link', 'motorway_link', 'trunk', 'motorway',
]

export function drawMinimap(ctx: CanvasRenderingContext2D, o: MinimapOpts): void {
  const { rect } = o
  const mapTop = rect.y + COMPASS_H
  const mapH = rect.h - COMPASS_H
  const cx = rect.x + rect.w / 2
  const cy = mapTop + mapH / 2
  const rot = o.headingUp ? -o.heading : 0

  ctx.save()
  roundedPath(ctx, rect.x, rect.y, rect.w, rect.h, 6)
  ctx.clip()
  ctx.fillStyle = G(L.panel)
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)

  if (o.lat !== null && o.lon !== null && o.chunk) {
    const scale = rect.w / o.metersAcross // px per metre
    const lat0 = o.lat
    const lon0 = o.lon
    const toScreen = (lat: number, lon: number) => {
      const m = localMeters(lat, lon, lat0, lon0)
      return { x: m.x * scale, y: -m.y * scale }
    }

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const tracePath = (pts: Float64Array) => {
      ctx.beginPath()
      for (let i = 0; i < pts.length; i += 2) {
        const p = toScreen(pts[i], pts[i + 1])
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      }
    }

    // Area fills first.
    for (const w of o.chunk.ways) {
      if (w.kind === 'road') continue
      tracePath(w.pts)
      ctx.closePath()
      ctx.fillStyle = G(w.kind === 'water' ? lvl(3) : lvl(2))
      ctx.fill()
    }
    // Roads, minor to major.
    for (const cls of ROAD_ORDER) {
      const style = ROAD_STYLE[cls]
      ctx.lineWidth = style[0]
      ctx.strokeStyle = G(style[1])
      for (const w of o.chunk.ways) {
        if (w.kind !== 'road' || w.cls !== cls) continue
        tracePath(w.pts)
        ctx.stroke()
      }
    }

    // Objective: dotted straight line + marker (clamped to the panel edge).
    if (o.destination) {
      const d = toScreen(o.destination.lat, o.destination.lon)
      const maxR = Math.min(rect.w, mapH) / 2 - 8
      const dist = Math.hypot(d.x, d.y)
      const inside = dist <= maxR
      const k = inside ? 1 : maxR / dist
      const mx = d.x * k
      const my = d.y * k
      ctx.setLineDash([2, 3])
      ctx.lineWidth = 1
      ctx.strokeStyle = G(L.accent)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(mx, my)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.save()
      ctx.translate(mx, my)
      ctx.rotate((-rot * Math.PI) / 180) // keep the glyph upright
      ctx.fillStyle = G(L.accent)
      if (inside) {
        ctx.beginPath() // diamond
        ctx.moveTo(0, -6)
        ctx.lineTo(5, 0)
        ctx.lineTo(0, 6)
        ctx.lineTo(-5, 0)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = G(L.black)
        ctx.fillRect(-1, -1, 2, 2)
      } else {
        // Chevron pointing towards the objective.
        const a = Math.atan2(d.y, d.x) + (rot * Math.PI) / 180
        ctx.rotate(a)
        ctx.beginPath()
        ctx.moveTo(6, 0)
        ctx.lineTo(-3, -5)
        ctx.lineTo(-1, 0)
        ctx.lineTo(-3, 5)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    }
    ctx.restore()

    // Player: view cone + arrow, fixed at the centre.
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(((o.headingUp ? 0 : o.heading) * Math.PI) / 180)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, 24, (-120 * Math.PI) / 180, (-60 * Math.PI) / 180)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = G(L.primary)
    ctx.beginPath()
    ctx.moveTo(0, -7)
    ctx.lineTo(5, 6)
    ctx.lineTo(0, 3)
    ctx.lineTo(-5, 6)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  } else {
    // No fix / no data yet: pulsing "searching" text in the panel.
    ctx.fillStyle = G(L.dim)
    ctx.font = font(600, 10)
    ctx.textBaseline = 'middle'
    tracked(ctx, o.noFix ? (o.locationOff ? 'LOCATION OFF' : 'ACQUIRING GPS') : 'LOADING MAP', cx, cy, 1.5, 'center')
    ctx.textBaseline = 'alphabetic'
  }

  drawCompass(ctx, rect, o.heading, o.headingUp)
  ctx.restore()

  // Border.
  roundedPath(ctx, rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 6)
  ctx.lineWidth = 1
  ctx.strokeStyle = G(L.frame)
  ctx.stroke()
}

function drawCompass(ctx: CanvasRenderingContext2D, rect: Rect, heading: number, _headingUp: boolean) {
  const h = COMPASS_H
  const cx = rect.x + rect.w / 2
  ctx.fillStyle = G(lvl(1))
  ctx.fillRect(rect.x, rect.y, rect.w, h)
  ctx.fillStyle = G(L.faint)
  ctx.fillRect(rect.x, rect.y + h - 1, rect.w, 1)

  const visibleDeg = 140
  const pxPerDeg = rect.w / visibleDeg
  const labels: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }
  ctx.font = font(700, 9)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (let a = -180; a < 540; a += 15) {
    const rel = a - heading
    if (rel < -visibleDeg / 2 || rel > visibleDeg / 2) continue
    const x = Math.round(cx + rel * pxPerDeg)
    const norm = ((a % 360) + 360) % 360
    const label = labels[norm]
    if (label) {
      if (Math.abs(rel) <= visibleDeg / 2 - 6) {
        ctx.fillStyle = G(norm === 0 ? L.accent : L.text)
        ctx.fillText(label, x, rect.y + h / 2)
      }
    } else {
      const major = norm % 45 === 0
      ctx.fillStyle = G(major ? L.dim : L.faint)
      ctx.fillRect(x, rect.y + (major ? 3 : 6), 1, major ? 7 : 4)
    }
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // Centre marker (small triangle pointing down onto the map).
  ctx.fillStyle = G(L.primary)
  ctx.beginPath()
  ctx.moveTo(cx - 3, rect.y + h - 1)
  ctx.lineTo(cx + 3, rect.y + h - 1)
  ctx.lineTo(cx, rect.y + h + 3)
  ctx.closePath()
  ctx.fill()
}

/** Distance and bearing to the objective, for the tracker panel. */
export function objectiveInfo(lat: number, lon: number, d: Destination) {
  return { distM: haversine(lat, lon, d.lat, d.lon), bearing: bearing(lat, lon, d.lat, d.lon) }
}

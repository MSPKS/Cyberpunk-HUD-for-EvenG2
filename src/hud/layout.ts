// Pixel geometry of the HUD on the 576x288 glasses canvas.
//
// The glasses can show at most 4 image containers, each at most 288x144.
// We split the canvas into four regions and only re-send a region whose
// pixels changed, so the busiest region (the minimap) is kept small.

export const CANVAS_W = 576
export const CANVAS_H = 288

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ContainerSpec {
  id: number
  name: string
  rect: Rect
  /** Minimum time between pushes of this region to the glasses. */
  minIntervalMs: number
}

export const CONTAINERS: Record<'notify' | 'map' | 'vitals' | 'weapon', ContainerSpec> = {
  // Top-left: notification popups (mostly black, rarely changes).
  notify: { id: 11, name: 'notify', rect: { x: 0, y: 0, w: 288, h: 144 }, minIntervalMs: 500 },
  // Top-right: clock, minimap, compass, street name. Busiest region — kept narrow.
  map: { id: 12, name: 'map', rect: { x: 400, y: 0, w: 176, h: 144 }, minIntervalMs: 2000 },
  // Bottom-left: glasses battery bar and GPS quickslot.
  vitals: { id: 13, name: 'vitals', rect: { x: 0, y: 144, w: 288, h: 144 }, minIntervalMs: 5000 },
  // Bottom-right: quest tracker + weapon/ammo panel (speed).
  weapon: { id: 14, name: 'weapon', rect: { x: 288, y: 144, w: 288, h: 144 }, minIntervalMs: 2000 },
}

/** Full-screen invisible text container that receives touchpad events. */
export const EVENT_LAYER_ID = 1

// Element placement (absolute canvas coordinates).
export const MINIMAP: Rect = { x: 462, y: 8, w: 106, h: 106 }
export const COMPASS_H = 13
export const CLOCK = { right: 452, baseline: 27 }
export const DATE = { right: 452, baseline: 42 }
export const TEMP = { right: 452, baseline: 84 }
export const STREET = { right: 568, baseline: 128 }
export const LOCALITY = { right: 568, baseline: 140 }

export const TRACKER: Rect = { x: 404, y: 152, w: 164, h: 56 }
export const WEAPON: Rect = { x: 396, y: 220, w: 172, h: 62 }

export const QUICKSLOTS = { x: 16, y: 190, size: 30, gap: 8 }
export const STAMINA_BAR: Rect = { x: 56, y: 246, w: 214, h: 6 }

/** Optional crosshair, centred on the canvas (phone-page toggle only). */
export const CROSSHAIR = { cx: CANVAS_W / 2, cy: CANVAS_H / 2, gap: 5, len: 8 }

/** How long the empty "NO ACTIVE JOB" tracker stays visible. */
export const NO_JOB_VISIBLE_MS = 30_000

export const NOTIFY: Rect = { x: 16, y: 16, w: 220, h: 50 }

/** Metres shown edge-to-edge on the minimap for each zoom step. */
export const ZOOM_METERS = [200, 400, 800, 1600]

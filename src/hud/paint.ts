// Canvas helpers. The glasses are monochrome (16 levels of green, black =
// transparent), so everything is drawn in greyscale: G(255) is full-bright
// green on the glasses, G(0) is invisible.

export const G = (v: number) => `rgb(${v},${v},${v})`

// Brightness palette — the Cyberpunk colour roles mapped to the glasses'
// 16 grey levels (level n = n * 17). The glasses apply a strong display
// gamma: even level 1–2 is clearly visible, so "translucent" panels use the
// lowest non-zero levels. Tune on hardware if panels look too loud.
export const lvl = (n: number) => n * 17
export const L = {
  primary: lvl(15), // cyan UI text / player arrow
  accent: lvl(13), // yellow highlights
  health: lvl(12), // red health bar
  text: lvl(11),
  dim: lvl(8),
  frame: lvl(6),
  faint: lvl(4),
  empty: lvl(2), // empty bar segments
  panel: lvl(1), // translucent dark panels
  black: 0,
}

export function font(weight: 500 | 600 | 700, px: number): string {
  return `${weight} ${px}px Rajdhani, "Segoe UI", Arial, sans-serif`
}

/** Draws text with manual letter-spacing (canvas letterSpacing is not universal). */
export function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'right' | 'center' = 'left',
): number {
  const chars = [...text]
  const widths = chars.map(ch => ctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1)
  let cur = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x
  const prevAlign = ctx.textAlign
  ctx.textAlign = 'left'
  chars.forEach((ch, i) => {
    ctx.fillText(ch, cur, y)
    cur += widths[i] + spacing
  })
  ctx.textAlign = prevAlign
  return total
}

export interface Corners {
  tl?: boolean
  tr?: boolean
  br?: boolean
  bl?: boolean
}

/** Rectangle path with 45° chamfers on the chosen corners (the CP2077 panel shape). */
export function chamferPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cut: number,
  c: Corners = { tl: true, br: true },
): void {
  ctx.beginPath()
  ctx.moveTo(x + (c.tl ? cut : 0), y)
  ctx.lineTo(x + w - (c.tr ? cut : 0), y)
  if (c.tr) ctx.lineTo(x + w, y + cut)
  ctx.lineTo(x + w, y + h - (c.br ? cut : 0))
  if (c.br) ctx.lineTo(x + w - cut, y + h)
  ctx.lineTo(x + (c.bl ? cut : 0), y + h)
  if (c.bl) ctx.lineTo(x, y + h - cut)
  ctx.lineTo(x, y + (c.tl ? cut : 0))
  ctx.closePath()
}

export function roundedPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/** Crisp 1px horizontal/vertical line. */
export function hline(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, level: number, w = 1) {
  ctx.fillStyle = G(level)
  ctx.fillRect(Math.min(x1, x2), y, Math.abs(x2 - x1), w)
}
export function vline(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number, level: number, w = 1) {
  ctx.fillStyle = G(level)
  ctx.fillRect(x, Math.min(y1, y2), w, Math.abs(y2 - y1))
}

/** Segmented bar in the CP2077 health-bar style. */
export function segmentedBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number | null,
  segments: number,
  fill: number,
  empty: number,
): void {
  const gap = 2
  const segW = (w - gap * (segments - 1)) / segments
  const filled = frac === null ? 0 : Math.round(Math.max(0, Math.min(1, frac)) * segments)
  for (let i = 0; i < segments; i++) {
    const sx = x + i * (segW + gap)
    ctx.fillStyle = G(i < filled ? fill : empty)
    ctx.fillRect(sx, y, segW, h)
  }
}

/** Small "corner bracket" ornaments the game scatters on panels. */
export function bracket(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, level: number, dirX: 1 | -1, dirY: 1 | -1) {
  hline(ctx, x, x + len * dirX, y, level)
  vline(ctx, dirX === 1 ? x : x - 1, y, y + len * dirY, level)
}

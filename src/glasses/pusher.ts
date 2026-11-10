// Sends HUD regions to the glasses as image containers. Each region is
// re-encoded as PNG and pushed with updateImageRawData only when its pixels
// changed and its minimum interval elapsed. Pushes are strictly serial —
// the SDK requires one image transfer in flight at a time.

import { ImageRawDataUpdate, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { CONTAINERS, type ContainerSpec } from '../hud/layout'

type Key = keyof typeof CONTAINERS

const RETRY_BACKOFF_MS = 5000

export interface PushStats {
  lastMs: Record<string, number>
  lastAt: Record<string, number>
  lastResult: string
  sent: number
}

export class GlassesPusher {
  private hashes = new Map<Key, number>()
  private lastSent = new Map<Key, number>()
  private queue: Key[] = []
  private pumping = false
  private scratch = document.createElement('canvas')
  stats: PushStats = { lastMs: {}, lastAt: {}, lastResult: '-', sent: 0 }
  onStats: (() => void) | null = null

  constructor(private bridge: EvenAppBridge | null, private master: HTMLCanvasElement) {}

  /** Call after every HUD render; enqueues regions that changed. */
  sync(): void {
    const ctx = this.master.getContext('2d')!
    const now = Date.now()
    for (const key of Object.keys(CONTAINERS) as Key[]) {
      const c = CONTAINERS[key]
      const data = ctx.getImageData(c.rect.x, c.rect.y, c.rect.w, c.rect.h).data
      const h = fnv1a(data)
      if (this.hashes.get(key) === h) continue
      if (now - (this.lastSent.get(key) ?? 0) < c.minIntervalMs) continue
      if (!this.queue.includes(key)) this.queue.push(key)
      this.hashes.set(key, h)
    }
    void this.pump()
  }

  /** Forget what was sent so every region is pushed again (after a rebuild). */
  invalidate(): void {
    this.hashes.clear()
    this.lastSent.clear()
  }

  private async pump(): Promise<void> {
    if (this.pumping) return
    this.pumping = true
    try {
      while (this.queue.length) {
        const key = this.queue.shift()!
        await this.push(key, CONTAINERS[key])
      }
    } finally {
      this.pumping = false
    }
  }

  private async push(key: Key, c: ContainerSpec): Promise<void> {
    this.lastSent.set(key, Date.now())
    const bytes = await this.encode(c)
    if (!this.bridge) return
    const t0 = performance.now()
    let result: string
    try {
      result = await this.bridge.updateImageRawData(
        new ImageRawDataUpdate({ containerID: c.id, containerName: c.name, imageData: bytes }),
      )
    } catch (err) {
      result = `threw: ${err instanceof Error ? err.message : String(err)}`
    }
    this.stats.lastMs[key] = Math.round(performance.now() - t0)
    this.stats.lastAt[key] = Date.now()
    this.stats.lastResult = `${key}: ${result}`
    this.stats.sent++
    if (result !== 'success') {
      console.warn('updateImageRawData', key, result)
      this.hashes.delete(key) // retry after a back-off
      this.lastSent.set(key, Date.now() + RETRY_BACKOFF_MS)
    }
    this.onStats?.()
  }

  private encode(c: ContainerSpec): Promise<Uint8Array> {
    this.scratch.width = c.rect.w
    this.scratch.height = c.rect.h
    const sctx = this.scratch.getContext('2d')!
    sctx.fillStyle = '#000'
    sctx.fillRect(0, 0, c.rect.w, c.rect.h)
    sctx.drawImage(this.master, c.rect.x, c.rect.y, c.rect.w, c.rect.h, 0, 0, c.rect.w, c.rect.h)
    return new Promise((resolve, reject) => {
      this.scratch.toBlob(async b => {
        if (!b) return reject(new Error('toBlob failed'))
        resolve(new Uint8Array(await b.arrayBuffer()))
      }, 'image/png')
    })
  }
}

function fnv1a(data: Uint8ClampedArray): number {
  let h = 0x811c9dc5
  // Sample the red channel only — the canvas is greyscale.
  for (let i = 0; i < data.length; i += 4) {
    h ^= data[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

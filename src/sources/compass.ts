// Phone compass heading, used when standing still (GPS course is only valid
// while moving). iOS needs a user-gesture permission prompt, so this is
// enabled from a button on the phone page.

type OrientationEvt = DeviceOrientationEvent & { webkitCompassHeading?: number; absolute?: boolean }

let listening = false

export async function enableCompass(cb: (headingDeg: number) => void): Promise<boolean> {
  if (listening) return true
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> }
  try {
    if (typeof DOE.requestPermission === 'function') {
      const res = await DOE.requestPermission()
      if (res !== 'granted') return false
    }
  } catch {
    return false
  }
  const handler = (e: Event) => {
    const ev = e as OrientationEvt
    let h: number | null = null
    if (typeof ev.webkitCompassHeading === 'number') h = ev.webkitCompassHeading
    else if (ev.absolute && ev.alpha !== null) h = (360 - ev.alpha) % 360
    if (h !== null && !Number.isNaN(h)) cb(h)
  }
  const w = window as Window & { ondeviceorientationabsolute?: unknown }
  const evName = 'ondeviceorientationabsolute' in w ? 'deviceorientationabsolute' : 'deviceorientation'
  w.addEventListener(evName, handler as EventListener)
  listening = true
  return true
}

// Glasses battery and connection state via the Even bridge.

import { DeviceConnectType, type EvenAppBridge } from '@evenrealities/even_hub_sdk'

export function watchGlassesBattery(
  bridge: EvenAppBridge,
  cb: (level: number | null, connected: boolean) => void,
): () => void {
  bridge
    .getDeviceInfo()
    .then(info => {
      if (!info) return
      cb(info.status?.batteryLevel ?? null, info.status?.connectType === DeviceConnectType.Connected)
    })
    .catch(() => {})
  return bridge.onDeviceStatusChanged(st => {
    cb(st.batteryLevel ?? null, st.connectType === DeviceConnectType.Connected)
  })
}

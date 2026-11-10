# Cyberpunk HUD for Even G2

A Cyberpunk 2077 heads-up display for Even Realities G2 glasses, driven by the
real world: a real map of the streets around you, real time, real speed and
heading, real batteries. Built on the Even Hub SDK, so it runs inside the Even
App on your phone and paints onto the glasses.

```
┌─────────────────────────────────────────────────┬──────────────────────┐
│ notification popups (top-left)                  │ 17:38   ┌──────────┐ │
│                                                 │ SAT SEP │ compass  │ │
│                                                 │  800 M  │  minimap │ │
│                                                 │  18°C   └──────────┘ │
│                                                 │       GEARY STREET   │
├─────────────────────────────────────────────────┼──────────────────────┤
│                                                 │ ▌FERRY BUILDING      │
│  [GPS]                  ·                       │  Reach the dest 1.2km│
│                      (crosshair, optional)      │ ┌ ON FOOT ─────────┐ │
│  100 ████████████████████  G2                   │ │ HDG 020° N  5/kmh│ │
└─────────────────────────────────────────────────┴──────────────────────┘
```

## What maps to what

| Game HUD element        | Real-world data                                                    |
| ----------------------- | ------------------------------------------------------------------ |
| Minimap (top-right)     | OpenStreetMap roads, water and parks around you, heading-up        |
| Compass strip           | Your heading (GPS course while moving, phone compass when still)   |
| Clock                   | Real time, 24h like the game, with the date and map scale below    |
| Street name under map   | Reverse-geocoded street and neighbourhood                          |
| Quest tracker           | A destination you type on the phone: name, distance, bearing. The empty "NO ACTIVE JOB" panel hides itself after 30 s |
| Objective marker        | Diamond on the minimap, chevron on the edge when out of view       |
| Ammo counter            | Your speed (`42 / km/h`)                                           |
| Weapon name             | Movement mode: STANDING / ON FOOT / RUNNING / VEHICLE              |
| Fire-mode line          | Heading and altitude                                               |
| Temperature             | Current outdoor temperature (Open-Meteo), °C or °F with the units  |
| Health bar              | Glasses battery                                                    |
| Quickslot               | GPS accuracy                                                       |
| Crosshair               | Optional, switched on from the phone page only                     |
| Notification popup      | GPS lock, new job, low battery, demo mode                          |

Everything is painted onto a 576x288 canvas in Rajdhani, the typeface the
game's HUD uses, then shipped to the glasses as four image containers. The
glasses are monochrome green with 16 brightness levels and black is
transparent, so the game's cyan / yellow / red become brightness roles (see
`L` in `src/hud/paint.ts`).

## Controls on the glasses

| Gesture          | Action                                  |
| ---------------- | --------------------------------------- |
| Tap              | Cycle minimap zoom (200 m to 1.6 km)    |
| Swipe up / down  | Zoom in / out                           |
| Hold             | Toggle heading-up / north-up            |
| Double tap       | Exit                                    |
| Context menu     | Zoom, orientation, units, clear job     |

The phone page has the same settings plus the destination box, a demo mode,
a phone-compass button (needed on iOS for heading while standing still), and
live status: location source, map data, push timings.

## Run it

```bash
npm install
npm run dev
```

Desktop simulator (no glasses needed; it drives the page like the Even App):

```bash
npm run simulate
```

Real glasses: with `npm run dev` running, generate a QR code with your
computer's LAN IP and scan it from the Even App on the paired phone:

```bash
npx evenhub qr --url http://<your-lan-ip>:5173
```

Package for the Even Hub portal:

```bash
npm run pack
```

That produces `cyberpunk-hud.ehpk` from `app.json` and `dist/`. The full
submission walkthrough (portal, beta testing, reviewer checklist, store
assets in `store/`) is in [PUBLISHING.md](PUBLISHING.md).

Demo mode for the desktop simulator or screenshots: open the app with `?demo=1`
(`npx evenhub-simulator "http://localhost:5173/?demo=1"`). `&crosshair=1` and
`&units=imperial` force those settings for the session without saving them.

## How it works

- `src/main.ts` boots the bridge, creates the glasses page (one invisible
  full-screen text container for touch input plus four image containers),
  and runs a 500 ms tick that redraws the HUD and pushes changed regions.
- `src/hud/draw.ts` paints the HUD. `src/hud/layout.ts` holds every pixel
  position and the container split. `src/hud/paint.ts` has the brightness
  palette and the chamfered-panel / tracked-text helpers.
- `src/map/overpass.ts` fetches roads, water and parks from the Overpass API
  in ~1.3 km chunks and caches them; `src/map/minimap.ts` projects and
  rotates them, draws the compass, player arrow and objective marker.
- `src/glasses/pusher.ts` hashes each region, encodes it to PNG and calls
  `updateImageRawData` serially, honouring a per-region minimum interval.
- `src/sources/` provides location (Even bridge, then browser geolocation,
  plus an opt-in simulated walk), Nominatim geocoding, batteries and the
  phone compass.

## Limits you should know about

- **Bandwidth.** Images go over Bluetooth LE. The minimap region is 176x144
  and is re-sent at most every 2 s (configurable on the phone page). Expect a
  second or two of latency per map update on hardware; the phone page shows
  the measured push time per region. If it is too slow, shrink `MINIMAP` and
  the `map` container in `src/hud/layout.ts` or raise the refresh interval.
- **Location when sideloaded.** Community reports say location can be denied
  for QR-sideloaded apps and works once the app is uploaded to Even Hub. The
  app falls back to browser geolocation; if that is denied too it shows
  `LOCATION OFF` on the glasses and a popup explaining what to allow. The
  phone page tells you which source is active, and demo mode is a switch you
  turn on yourself.
- **Brightness levels.** The simulator renders even level 1 of 15 as a clearly
  visible green. Panels and empty bar segments use levels 1–2; if they look
  loud on the real glasses, lower or zero `L.panel` / `L.empty` in
  `src/hud/paint.ts`.
- **Heading while standing still.** GPS course is only valid while moving.
  Tap "Enable phone compass" on the phone page to use the phone's compass
  when still (the glasses' IMU is accelerometer-only in the public SDK).
- **Map data.** Buildings are not drawn; a dense downtown box with buildings
  makes the public Overpass servers time out. Roads, water and parks are.

## Data sources and fair use

- Map geometry: OpenStreetMap contributors via the public Overpass API
  (overpass-api.de, overpass.kumi.systems). One request per ~350 m moved.
- Street names and destination search: Nominatim. Throttled to one reverse
  lookup per 35 m / 12 s and one search per button press.
- Font: Rajdhani (SIL Open Font License), bundled in `public/fonts`.

Both OSM services are shared community infrastructure with usage policies.
This app is well within them for personal use; do not point a fleet at them.

## License

MIT, see [LICENSE](LICENSE). The bundled Rajdhani font is under the SIL Open
Font License (`public/fonts/OFL.txt`). Not affiliated with CD PROJEKT RED.

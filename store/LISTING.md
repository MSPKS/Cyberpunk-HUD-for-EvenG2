# Store listing copy (paste into the Even Hub portal)

**Display name** (must match `app.json` `name`, ≤ 20 chars, no "Even"):
Cyberpunk HUD

**Package ID:** com.matthewspokes.cyberpunkhud
**Version:** 1.1.0

**Short description (one line):**
A Cyberpunk 2077 style heads-up display driven by the real world: live map, time, speed, heading and batteries.

**Long description:**
Cyberpunk HUD turns your G2 into the Night City interface, powered by where you actually are.

- Minimap of the real streets around you (OpenStreetMap), rotating with your heading, with a compass strip and your position at the centre.
- Real time and date, and the name of the street you are on.
- Quest tracker: type a destination on your phone and see its name, distance and bearing on the glasses, with an objective marker on the map.
- Ammo counter shows your speed; the weapon slot shows whether you are standing, walking, running or in a vehicle; heading and altitude underneath.
- Current outdoor temperature under the clock, glasses battery as the health bar, GPS accuracy in the quickslot, and an optional crosshair.
- Metric or imperial units for speed, distance, altitude and temperature.

Controls on the glasses: tap to cycle zoom, swipe to zoom in or out, hold to switch between heading-up and north-up, double-tap to exit. The context menu also switches metric / imperial and clears the destination.

No account, no server, no tracking. Map data and street names come from the OpenStreetMap community services and the temperature from Open-Meteo; see the privacy policy.

**Category suggestion:** Navigation / Utilities

**Changelog for 1.1.0:**
Added current outdoor temperature under the clock (°C/°F follows the units setting). Added an optional crosshair, toggled from the phone page. The empty job tracker now hides itself after 30 seconds. Larger date. Removed the phone battery bar and the glasses link slot. Imperial units option renamed and now also switches the temperature.

**Changelog for 1.0.0:**
Initial release: real-world minimap, clock, street name, destination tracker, speed and heading, phone and glasses battery, notifications, glasses touchpad controls and context menu.

**Privacy policy URL:** https://YOUR-DOMAIN/cyberpunk-hud/privacy.html
(host `store/privacy.html` anywhere public and put its URL here; fill in the contact email inside the file first)

**Assets in this folder:**
- `icon.png` — greyscale foreground icon, 1024×1024, transparent background
- `icon-bg.png` — greyscale background, 1024×1024
- `screenshots/*.png` — 576×288 captures from the official simulator

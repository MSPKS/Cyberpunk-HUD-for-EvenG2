# Publishing Cyberpunk HUD to Even Hub

Everything the portal asks for is prepared in this repo. Follow the steps in
order; the portal's build states only move forward (Draft → Test → Submitted →
Released) and a Released version number can never be edited or rolled back,
so test as a beta build before you submit.

## 0. One-time setup

1. Create a developer account at <https://hub.evenrealities.com/login> (same
   email as your Even App account, so you can beta-install on your own phone).
2. Log the CLI in:

   ```bash
   cd even-cyberpunk-hud
   npx evenhub login -e you@example.com
   ```

3. Fill in the contact email in `store/privacy.html`, then host that file
   somewhere public. Easiest: it is already copied to
   `Website/public/cyberpunk-hud/privacy.html`, so once your site deploys it
   is at `https://<your-domain>/cyberpunk-hud/privacy.html`. Any static host
   works (GitHub Pages, Netlify). Reviewers open this link.

## 1. Build, validate, pack

```bash
cd even-cyberpunk-hud
npm run build
npx evenhub pack app.json dist -o cyberpunk-hud.ehpk -c
```

`-c` checks that `com.matthewspokes.cyberpunkhud` is free on Even Hub (needs
the login from step 0). If it is taken, change `package_id` in `app.json`
(reverse-domain, lowercase, letters and digits only, at least two segments).
The command validates the manifest and prints the stamped `min_app_version`.

## 2. Create the project in the portal

At <https://hub.evenrealities.com/hub> → New project:

| Field            | Value                                                |
| ---------------- | ---------------------------------------------------- |
| Name             | `Cyberpunk HUD` (must equal `name` in app.json)      |
| Package ID       | `com.matthewspokes.cyberpunkhud`                     |
| Description      | copy from `store/LISTING.md`                         |
| Icon             | `store/icon.png` (greyscale, transparent background) |
| Background       | `store/icon-bg.png` (greyscale)                      |
| Screenshots      | `store/screenshots/*.png` (simulator captures)       |
| Privacy policy   | the URL from step 0                                  |
| Changelog        | copy from `store/LISTING.md`                         |

Colour artwork is rejected; the supplied assets are pure greyscale. Screenshots
must match what the app renders, which is why they come from the official
simulator's framebuffer.

## 3. Upload the build and beta-test it (required)

QR sideloading dies when the phone locks, so the reviewer checks below can
only be reproduced with a beta build.

1. Project → **Beta groups** → create a group (e.g. `self-test`) and add your
   own email.
2. Project → **Builds** → upload `cyberpunk-hud.ehpk`, assign it to the group.
   The build is now in **Test**.
3. On your phone: Even App → **Me → Beta tester** → Cyberpunk HUD → **Install**.
4. Launch it from the glasses menu and run the reviewer checklist:
   - First launch shows something meaningful on the glasses, never black. If
     location is denied you should see `LOCATION OFF` on the minimap and a
     popup telling you to allow location for the app.
   - Allow location, walk outside: minimap, street, speed and heading update.
   - Type a destination on the phone page → tracker shows name, distance,
     bearing; marker appears on the map.
   - Tap / swipe / hold on the touchpad → zoom and orientation change.
   - Lock the phone, background the Even App, wait 5 minutes → the HUD is
     still updating (clock advances, map follows you).
   - Unlock, use another app, re-lock → glasses session unaffected.
   - Double-tap on the root page → the **system** exit dialog appears (the
     app calls `shutDownPageContainer(1)`, which is what reviewers require),
     and after confirming, the phone WebView closes too.
   - Open Conversate (first-party app) afterwards without restarting the
     glasses.
5. Watch the phone page's Status/Log panel and the push timings. If map
   pushes take longer than you like, raise "Map refresh" on the phone page or
   shrink the `map` container in `src/hud/layout.ts`, rebuild, bump `version`
   in `app.json`, re-pack, re-upload.

## 4. Submit

Project → Builds → move the tested build from **Test** to **Submitted**.
Metadata locks at this point. Every app is reviewed manually; you get the
result in the portal. Common rejections and how this app already avoids them:

| Rejection reason                          | Status here                                              |
| ----------------------------------------- | -------------------------------------------------------- |
| Unused permission in manifest             | only `location` and `network`, both used                 |
| Network permission without whitelist      | whitelist lists the three OSM hosts the app calls        |
| Colour / illegible icon                   | greyscale icon + background generated in `tools/icon.html` |
| Screenshots not matching the app          | captured from the simulator framebuffer                  |
| Black screen on first launch / no fix     | on-glasses `ACQUIRING GPS` / `LOCATION OFF` states       |
| No system exit dialog on double-tap       | uses `shutDownPageContainer(1)` on the root page         |
| Name contains "Even"                      | name is `Cyberpunk HUD`                                  |
| Privacy policy gaps                       | `store/privacy.html` covers location, network, storage   |

If the reviewer asks for changes: fix, bump `version` in `app.json` (x.y.z,
no `v`), write a changelog line, re-pack, upload as a new build, beta-test,
submit again. Released versions are permanent; you always fix forward.

## 5. After release

- Updates follow the same path: new version → Test → Submitted → Released.
- Never bundle secrets in the `.ehpk`; anyone can unzip a released build.
  This app has none.
- The OpenStreetMap services are shared community infrastructure. Usage is
  throttled in code (one Overpass fetch per ~350 m, one geocode per 35 m /
  12 s). If the app gets popular, stand up your own Overpass/Nominatim mirror
  and change the hosts in `src/map/overpass.ts`, `src/sources/geocode.ts`,
  and the whitelist in `app.json`.

## Trademark note

"Cyberpunk 2077" is a trademark of CD PROJEKT S.A. This app recreates the HUD
style and uses none of the game's assets, fonts or logos (the typeface is the
open-licensed Rajdhani). The name "Cyberpunk HUD" refers to the genre; if
review flags it, "Night City HUD" or "Chrome HUD" are safe alternatives.

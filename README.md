# Xizana Spinner

An original local-first wheel picker with a custom ink, white and spectral-color design. No framework, account, database or build step is needed for its core features.

## Run

Use Node.js 22 or later:

```sh
npm start
```

Open `http://127.0.0.1:4173`. For deployment, serve `dist/` over HTTPS with any static host. All paths are relative. Never open `index.html` directly from the filesystem: browser modules, secure randomness, storage and service workers require an HTTP or HTTPS origin.

```sh
npm install
npm test
```

## Included

- Weighted selection using 53-bit `crypto.getRandomValues` randomness; the animation resolves the segment under the fixed pointer. Disabled entries contribute no probability.
- Simple live text editor; advanced entry weights, enabled states, colors, images, ordering, duplicates and search. Each wheel supports 1,000,000 entries. Large lists use typed geometry buffers, bounded canvas sampling, chunked generation/import/storage and a paginated editor. Very large wheels simplify the drawing while retaining exact weighted probabilities; browser memory and storage remain practical constraints. The advanced editor mounts at most 40 rows; history mounts at most 50 rows. Wheel graphics are painted once and transformed during spins.
- Brief acceleration, a constant two-turns-per-second cruise for spins of two seconds or longer, and gradual deceleration only near the end. Presets and custom durations (0.1–86,400 seconds) wait for their full selected time. Keyboard shortcuts, reduced-motion decoration, and undo/redo with a bounded memory budget.
- Multiple independent wheels, concurrent Spin All, 11 templates, number and team generators.
- IndexedDB autosave and a named session library. Images are validated, decoded, resized to 256 pixels and encoded as WebP.
- Winner dialogs, manual and automatic removal, history, confetti, synthesized spin/tick/winner/celebration sounds and optional background music with independent volume controls.
- Palettes, labels, dividers, pointer, center text/image/size/behavior and presentation background customization.
- TXT/CSV/JSON/Xizana Spinner imports, spreadsheet paste, column mapping and preview; TXT/CSV/JSON/Xizana Spinner exports. CSV exports escape potential spreadsheet formulas.
- Self-contained compressed share snapshots with editor, spin, view and presentation interface modes. Shared data is strictly validated and never executed.
- Light/dark/system themes, semantic dialogs, visible focus, screen-reader announcements, presentation/streamer modes, PWA manifest and offline shell.
- Feature-detected WebMCP spin tool plus `window.Orbit` integration hooks and `orbit:winner` events.

## Data and sharing boundaries

Sessions, images, saved wheels and history are device-local in IndexedDB. Export portable `.orbit` backups. Browser storage can be cleared or unavailable; the app reports storage failures and continues to permit exports. Shared snapshots do not overwrite the local workspace.

Share permissions are interface modes, **not access-control security**: recipients possess the embedded configuration. Share links are snapshots, not live collaboration. Large image-rich configurations should be exported as files instead. This release does not implement cloud accounts, cloud storage or synchronization. The Sites deployment starts private; its audience is controlled separately from app snapshot modes. A private deployment link is usable only by people granted access to that Site.

Google Sheets imports use a supplied, website-restricted Google API key and a publicly readable spreadsheet. The key remains in tab memory and is not persisted or exported. OAuth/private-sheet authorization is not included. Other core features need no internet connection after the app shell has been cached. Google-hosted fonts are optional; system font fallbacks work offline.

## Architecture

`engine.js`: geometry, secure randomness, entry operations and strict schema/import validation. `spin.js`: animation timing, selection, pointer detection and boundary notifications. `renderer.js`: Canvas wheel geometry, text fitting and image caching. `storage.js`: IndexedDB, image optimization and downloads. `sharing.js`: bounded compressed link parsing. `history.js`: records, validation and export. `audio.js`: Web Audio synthesis. `app.js`: UI state and event coordination. `icons.js`: consistent SVG icons. `i18n.js`: message catalog and gettext-style source keys; English ships today and RTL layout is supported. Add language catalogs and connect a locale selector to `setLocale` to ship more languages.

Events:

```js
window.addEventListener('orbit:winner', ({ detail }) => {
  // detail: { winner, wheelId, wheelName, date }
});
await window.Orbit.spin();
await window.Orbit.spinAll();
window.Orbit.getWheels();
window.Orbit.getHistory();
window.Orbit.getSpinState();
```

No remote commands or cross-origin message listeners are enabled. Any future remote integration must authenticate its callers and validate origin and command schemas.

## Verification

Automated Node tests cover equal/weighted distributions, crypto sampling, 5,000 pointer agreement cases, animation phases, single-segment ticks, reduced motion, disabled/invalid weights, duplicate removal, one-million-entry generation/geometry/rendering, chunked save/load, constant cruise speed across durations, full-duration completion, large lists, shuffle identity preservation, multiple-wheel configuration round trips, malicious import rejection, Unicode CSV/JSON/TXT/TSV imports, history and share round trips. Browser checks cover Georgian editing, weights, spins, imports, search, local saves, refresh restoration, light/dark appearance, desktop and mobile layout, and valid/invalid WebMCP calls. Google API imports require a configured key and were not exercised against an external account.



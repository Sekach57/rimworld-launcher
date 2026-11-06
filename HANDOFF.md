# HANDOFF: rimworld-launcher UI redesign

Branch: `task/launcher-design` (not pushed, not merged).

## Goal
Game-launcher look (Onyx / Steam library feel) for the Electron + React + TS RimWorld mod launcher.

## Done
- Hero banner from mod previews, big name, stats, one Play button, overflow menu.
- Sidebar as library with cover thumbnails.
- Virtualised dual-list mod editor (rows: thumb, name, author, source chip, badges; hover/selected/drag states).
- Problems panel grouped by severity, click selects mod.
- Details panel: big preview, dependency chips, versions.
- Warm earth-tone dark palette, bundled Fraunces + Instrument Sans, lucide icons, reduced-motion respected.
- CSS split into `src/renderer/src/styles/{base,library,editor}.css`.
- Checks: typecheck clean, 41 tests in 6 files pass, build OK.

## Next
- Hero text contrast over busy preview images (stronger scrim).
- Order badges sit far from the row's right edge at 1920.
- Author names truncate in the active column at 1200.
- Renderer bundle is one ~973 kB chunk; consider code splitting.
- New-instance dialog screenshot was not captured properly; recheck dialog styling.

## Key files
- `src/renderer/src/App.tsx`, `components/{InstanceHeader,Sidebar,ModEditor,DetailsPanel}.tsx`
- `src/renderer/src/styles/*.css`, `src/renderer/src/format.ts`
- `src/main/index.ts` (test hooks `LAUNCHER_USER_DATA`, `LAUNCHER_SCREENSHOT`)

## Open questions
- Keep the single-chunk bundle or split it?

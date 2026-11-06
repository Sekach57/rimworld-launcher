# Handoff: rimworld-launcher

Branch: task/launcher-design (no remote).

## Goal
Polish pass on the launcher UI after the design review.

## Done
1. Active mod column: badge sits in its own right-aligned slot, author/name truncate before it. Below 520px column width the badge shows an icon only and the version is hidden. On hover or selection the badge moves left to make room for the toggle.
2. At 1920 the badges line up on the row's right edge.
3. Hero banner: darker scrim, lower image opacity, stronger text-shadow on title, stats, notes, eyebrow.
4. New-instance dialog: Name and Letter share one row (grid), visible focus ring, no textarea resize, spacing matches the rest of the app.
5. Renderer bundle split: SettingsView, DetailsPanel and Dialogs are lazy chunks, react and dnd-kit are vendor chunks. Largest chunk went from 973 kB to 564 kB (react-dom).

## Checks
typecheck, 41 tests, build all pass. Screenshots at 1200 and 1920 (main view, dialog) checked by eye.

## Next
- Optional: whole app sits in one Suspense (fallback null). Narrow it if a flash shows when a dialog opens the first time.
- Merge into main only when the user says so.

## Key files
src/renderer/src/styles/{editor,library,base}.css, components/ModEditor.tsx, App.tsx, electron.vite.config.ts

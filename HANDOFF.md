# Handoff: launcher features (branch task/launcher-achievements)

Goal: five launcher features. A (2d25dcd), B (6fcf37b), C/Steam (51ab1d0)
and D (local profile achievements) are done and committed.

Stage D summary
- src/shared/achievements.ts: 17 achievements, evaluate, stampUnlocks.
- src/main/stats.ts: StatsStore, writes userData/stats.json.
- src/main/index.ts: track()/trackMax() hooks in handlers, getProfile IPC.
- Renderer: ProfileView.tsx (tiles + 17 cards with progress), Profile button
  in Sidebar, view 'profile' in App, CSS in styles/tools.css.
- Test hook: LAUNCHER_OPEN_VIEW=profile opens the profile on start.
- Checks: typecheck clean, npm test 111/111, npm run dist ok, screenshot of
  the built app with seeded stats shows 17 cards (5 unlocked).

Next
- User asked for Steam login via the web (Steam OpenID 2.0 in an Electron
  window). Ask before starting it, on a new branch task/<slug> from this one.

Notes
- Nothing merged into main; branches chain A -> B -> C -> D.
- Never show the Steam key, account name or ID.
- Commits go without Co-Authored-By trailers.

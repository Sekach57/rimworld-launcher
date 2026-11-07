# Handoff: Stage D, profile achievements (branch task/launcher-achievements)

Goal: five launcher features. A (2d25dcd), B (6fcf37b), C/Steam (51ab1d0) are
done. D (local achievements) is half done and NOT committed yet.

Done in D (untracked files, keep them)
- src/shared/achievements.ts: StatKey list, 17 ACHIEVEMENTS, evaluate,
  stampUnlocks, normalizeStats.
- src/main/stats.ts: StatsStore (userData/stats.json, write queue, bump, max,
  profile()).
- tests/achievements.test.ts: 8 tests, pass.

Next (in this order)
1. src/main/index.ts: import StatsStore and StatKey; lazy stats() and a
   fire-and-forget track(key) helper that never throws. Hook handlers:
   setCategory, createInstance, importCurrent, setActiveMods, analyzeLog,
   steamSetKey (only when key set), bisectAnswer (when done), snapshotSave,
   snapshotRestore, exportList, importList, launch (launches, maxActiveMods,
   cleanExits or crashes on exit). Add handle('getProfile').
   index.ts is too big for Read: use sed -n.
2. src/shared/api.ts getProfile(): Promise<Profile>; preload call('getProfile').
3. Renderer: Trophy button in Sidebar.tsx, lazy ProfileView in App.tsx
   (view === 'profile'), new ProfileView.tsx (summary tiles, 17 cards with
   progress), CSS in the existing stylesheet.
4. npm test (expect 111), npm run typecheck, npm run dist, CDP check that the
   Profile view shows 17 cards. Commit with explicit paths, no trailer.

After D
- User asked for Steam login via the web (Steam OpenID 2.0 in an Electron
  window). Ask before starting it.

Notes
- Nothing merged into main; branches chain A -> B -> C -> D.
- Never show the Steam key, account name or ID.

# Handoff: five launcher features (branch task/launcher-steam)

Goal: drag-and-drop, categories, three list densities, Steam link, profile
achievements.

Done
- Stage A (densities, drag-and-drop): 2d25dcd.
- Stage B (categories: auto plus manual override, list filter): 6fcf37b.
- Stage C (Steam): 51ab1d0. Local account, avatar and Workshop install data
  from Steam files; optional Web API key (read-only) stored with safeStorage
  in userData/steam.json, renderer sees only the last 4 chars. Workshop
  details cache in steam-cache.json, errors redact `key=`.
- 103 tests pass, typecheck clean, exe built and checked over CDP: Settings
  shows the Steam section, no key text in the DOM.

Next
- Stage D: local profile achievements (pure rules in src/shared, stats kept
  in userData, a Profile view).
- Try a real key: Settings, Steam, Save key, Refresh.

Key files
- src/main/steam.ts, src/main/steamParse.ts, tests/steam.test.ts
- src/renderer/src/components/SettingsView.tsx (SteamSection), DetailsPanel.tsx

Open questions
- Nothing merged into main yet; branches chain A -> B -> C.

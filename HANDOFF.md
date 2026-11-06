# Handoff: launcher core (stage 1)

Goal: Electron + Vite + React + TS desktop launcher for RimWorld mods with separate instances (own save folder and mod list each).

Done (branch `task/launcher-core`):
- Settings autodetect (Steam libraryfolders.vdf), edit, persist in userData/settings.json.
- Scanner for Data, Mods and Workshop: full About.xml, case-insensitive Preview.png, Steam id from folder, broken XML falls back to a regex read.
- Instances in userData/instances/<id>/data, launched with `-savedatafolder`. Create, edit, duplicate, delete to recycle bin, import from the default ModsConfig.xml (read only).
- Mod editor: two lists, search, dnd-kit reorder, toggle, details panel; ModsConfig.xml written in game format (BOM, CRLF).
- Auto-sort (topological, official first), warnings (not installed, missing deps, order, cycles, incompatible, version, duplicate ids).
- Tests: 41 Vitest cases, including the launch command builder. `npm run scan` checks real folders.

Next:
- Try launch by hand once (never done by the agent), confirm the game uses the instance folder.
- UI polish: keyboard reorder hints, virtualised lists if 500+ mods feel slow, filter by source.
- Stage 2 ideas: Player.log reader, bisect, companion mod.

Key files: src/main/{scanner,instances,detect,launch}.ts, src/shared/{about,sort,checks,modsConfig}.ts, src/renderer/src/App.tsx and components/, scripts/scan-real.ts.

Dev tips: `LAUNCHER_USER_DATA=<dir>` isolates userData; `LAUNCHER_SCREENSHOT=<png>` captures the window and quits. Instance ids must match `[a-z0-9]{6,32}`.

Open questions:
- 35 active mods in the current game list do not declare 1.7. Show as warning (current) or hide?
- Renderer bundle is one 866 kB chunk; fine for desktop, revisit if startup feels slow.

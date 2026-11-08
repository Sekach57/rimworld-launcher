# RimWorld Launcher

A desktop launcher for RimWorld on Windows. It keeps separate game instances with their own mod lists, sorts mods, warns about problems before you start the game, and reads the game log afterwards to tell you which mod broke what.

Version 0.1.0. Built with Electron, React and TypeScript.

## What it does

### Instances
- Several game setups side by side. Each instance has its own name, color, letter badge, notes and data folder, so saves and configs don't mix.
- The launcher builds the launch command for the chosen instance and starts the game with it.

### Mod list editor
- Library sidebar with every installed mod (local folder and Steam Workshop), rich rows with preview images, and a details panel.
- Drag and drop ordering. A bad drop (a mod placed before something it must load after) shows a warning right away.
- Auto-sort based on `About.xml`: `loadAfter`, `loadBefore`, dependencies, and the fixed order of Core and the official DLCs.
- Categories (framework, UI, content, and so on) are guessed from the mod's id, name and description. You can override any of them by hand and filter the list by category.
- Three list densities.
- Links to each mod's Workshop page.

### Pre-launch checks
Before the game starts, the launcher looks for:
- missing dependencies
- mods marked incompatible with each other
- mods built for another game version
- wrong load order
- duplicate package ids
- mods that are active but not installed
- dependency cycles

Problems appear in a panel next to the list, attached to the mod they belong to.

### Log analysis
- After the game exits, the launcher reads `Player.log`, groups errors and warnings, and attributes them to mods where it can.
- Diagnosis rules turn raw errors into likely causes (for example a missing Harmony, or a mod loaded too early) and offer one-click fixes for the mod list. Known harmless noise is filtered out.
- The report can be copied as text, which helps when asking for help on a mod's page or Discord.

### Bisect assistant
When something is broken and the log doesn't point at one mod, the bisect assistant halves the active list step by step, keeping dependencies together, until it finds the culprit. When you finish, it restores your original list.

### Snapshots and backups
- Every change to a mod list can be saved as a snapshot. Automatic snapshots rotate and keep the last 30.
- Diff between any two snapshots: added, removed and moved mods.
- Backups panel with a diff preview before restore.
- Export and import of mod lists, as XML (the same shape as `ModsConfig.xml`) or JSON. On import it lists the mods you don't have installed.

### Steam and profile
- Reads the local Steam account and Workshop data from disk. No sign-in needed for that.
- Optional sign-in through Steam OpenID 2.0 (see Privacy below).
- Optional Steam Web API key for extra profile data.
- Local profile with play stats and 17 achievements: first launch, clean runs, big mod packs, finding a broken mod with bisect, and others. They are the launcher's own and live only on your machine.

## Download

Get `RimWorldLauncher-0.1.0-portable.exe` from the [Releases](../../releases) page. It's a single portable file, no installer: put it anywhere and run it.

The exe is not code-signed, so Windows SmartScreen may show "Windows protected your PC". Click "More info", then "Run anyway". If you'd rather not trust a prebuilt binary, build it yourself from source (below).

## Requirements

- Windows 10 or 11, x64
- RimWorld installed (Steam or standalone). The launcher tries to find the game and Workshop folders on its own; you can set them by hand in Settings.

To build from source you also need Node.js 20 or newer and npm.

## Build from source

```bash
git clone https://github.com/Sekach57/rimworld-launcher.git
cd rimworld-launcher
npm install
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app in development mode with hot reload |
| `npm run typecheck` | TypeScript checks for main, preload and renderer |
| `npm test` | Unit tests (vitest) |
| `npm run build` | Production build into `out/` |
| `npm run dist` | Build and package the portable exe into `dist/` |
| `npm run scan` | Scan installed mods from the command line |

## Project structure

```
src/
  main/       Electron main process: game detection, mod scanner, instances,
              settings, stats, Steam link and OpenID sign-in, VDF parser
  preload/    The bridge that exposes a typed API to the renderer
  renderer/   React UI: sidebar, mod editor, panels for problems, details,
              log, bisect, backups, profile and settings
  shared/     Pure logic shared by both sides and covered by tests:
              About.xml parsing, sorting, checks, diagnosis, log parser,
              bisect, snapshots, categories, achievements, list import/export
tests/        vitest tests
```

Most of the logic lives in `src/shared` as plain functions without Electron imports, so it can be tested directly.

## Privacy and Steam

- **No password ever reaches the launcher.** Steam sign-in opens the official Steam login page in a separate, sandboxed window. Steam returns only your public SteamID64, and the launcher checks that answer with Steam before trusting it.
- **The Web API key is optional.** If you enter one, it stays in the main process and is stored encrypted with the OS keychain (Electron `safeStorage`). The UI never gets the key back, only whether one is set.
- **Nothing is sent anywhere else.** Mod lists, stats, logs and achievements stay in the app's data folder on your machine. Network requests go only to Steam, and only for the features above.

## Environment variables for testing

These are meant for development and automated screenshots, not everyday use.

| Variable | Effect |
| --- | --- |
| `LAUNCHER_USER_DATA` | Use another folder for app data instead of the default |
| `LAUNCHER_STEAM_PATH` | Point Steam detection at a specific folder |
| `LAUNCHER_OPEN_VIEW` | Open a view on start: `log`, `bisect`, `backups`, `profile` or `settings` |
| `LAUNCHER_SCREENSHOT` | Save a screenshot of the window to this path and quit |
| `LAUNCHER_SCREENSHOT_DELAY` | Wait this many milliseconds before the screenshot (default 3500) |
| `LAUNCHER_SCREENSHOT_SCROLL` | CSS selector to scroll into view before the screenshot |

## Status

This is an early release. The mod list, checks, log analysis, bisect, snapshots and profile are covered by unit tests. Steam OpenID sign-in passes its tests against recorded responses, but hasn't yet been tried with a live Steam login. Bug reports are welcome in Issues.

RimWorld is a trademark of Ludeon Studios. This project is a fan-made tool and is not affiliated with Ludeon Studios or Valve.

# Handoff: error breakdown (branch task/launcher-errors)

Goal: turn Player.log errors and Problems-list entries into a few plain
diagnoses with one-click fixes.

Done
- src/shared/diagnosis.ts: pure rules (dependency, incompatible, load order,
  version info, XML defs with author report, Harmony patch errors, noise,
  root-cause collapsing), applyFix, applyAllSafe, summarize.
- tests/diagnosis.test.ts: 9 tests; full suite 81 passing.
- openUrl IPC (steamcommunity.com links only) for Workshop fix buttons.
- DiagnosisSection at the top of the Log panel; link from the Problems list.
  Fixes go through App.setActive -> api.setActiveMods, which snapshots first.
- Typecheck and build clean.

Next
- Try it against a real Player.log after a game run.
- Add more noise patterns and mod-specific rules as real logs show them.
- Narrow Log panel: cards scroll under the buttons; consider a wider panel.

Key files
- src/shared/diagnosis.ts, tests/diagnosis.test.ts
- src/renderer/src/components/DiagnosisSection.tsx, LogPanel.tsx, DetailsPanel.tsx
- src/renderer/src/styles/tools.css (.diag-*)

Open questions
- "Fix all safe" applies every list fix, including enabling mods. Keep as is?
- Incompatible-mod cards offer disable on either side; no preferred side.

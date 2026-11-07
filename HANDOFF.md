# Handoff: Steam sign-in through the web (branch task/launcher-steam-openid)

Goal: learn the SteamID64 through Steam OpenID 2.0, without relying on loginusers.vdf.
Status: built and committed on this branch. Not merged, not pushed, version unchanged.

Key files
- src/main/steamOpenId.ts: pure OpenID code (login URL, reply checks,
  check_authentication body and reply, verifyReturn, host allow lists).
- src/main/steamSignIn.ts: modal sandboxed window on an in-memory partition.
  It catches and cancels the return URL, allows only Steam hosts and denies
  window.open. Closing the window counts as a cancel.
- src/main/steam.ts: signIn/signOut store the id in userData/steam-openid.json.
  status() prefers that id (source 'openid'), and refresh uses it.
- IPC steamSignIn/steamSignOut in shared/api.ts, preload, main/index.ts
  (a sign-in also counts as steamLinked). The button sits in the Steam card in SettingsView.tsx.
- Tests: tests/steamOpenId.test.ts, plus sign-in cases in tests/steam.test.ts.
  Only fake ids 765611900000000xx.

Test hooks (new)
- LAUNCHER_STEAM_PATH=<folder> (or "") replaces Steam detection, so a run never
  reads the real account.
- LAUNCHER_SCREENSHOT_SCROLL=<css selector> scrolls to an element before the shot.

Checks: typecheck clean, npm test 145/145, npm run dist ok. A screenshot of the
built app from scratch userData shows the sign-in button.

Open questions
- A real sign-in and the live check_authentication POST are untested.
  The user should try it once by hand.
- The Steam login page may load assets from hosts outside the allow list
  (isAllowedResource). If the page looks broken, check what gets blocked.

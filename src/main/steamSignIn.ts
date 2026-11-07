/** The Steam sign-in window. It only shows Steam's own page; the launcher never sees what the user types there. */
import { BrowserWindow, session } from 'electron'
import { buildLoginUrl, isAllowedPage, isAllowedResource, isReturnUrl } from './steamOpenId.ts'

let open: BrowserWindow | undefined

/** Resolves to the return URL Steam redirected to, or undefined when the user closed the window. */
export function openSteamSignIn(parent: BrowserWindow | undefined): Promise<string | undefined> {
  if (open && !open.isDestroyed()) {
    open.focus()
    return Promise.reject(new Error('A Steam sign-in window is already open.'))
  }
  // No "persist:" prefix: the session lives in memory and is dropped with the window, cookies included.
  const ses = session.fromPartition(`steam-openid-${Date.now()}`)
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|rimworld-launcher)\/\S+/gi, ''))
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  ses.setPermissionCheckHandler(() => false)
  ses.on('will-download', (event) => event.preventDefault())

  const win = new BrowserWindow({
    parent,
    modal: !!parent,
    width: 820,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    title: 'Sign in through Steam',
    backgroundColor: '#171a21',
    webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false, spellcheck: false }
  })
  open = win

  return new Promise((resolve) => {
    let done = false
    const finish = (url: string | undefined) => {
      if (done) return
      done = true
      resolve(url)
      if (!win.isDestroyed()) win.close()
    }

    ses.webRequest.onBeforeRequest((details, cb) => {
      if (isReturnUrl(details.url)) {
        cb({ cancel: true })
        finish(details.url)
        return
      }
      const allowed = details.resourceType === 'mainFrame' ? isAllowedPage(details.url) : isAllowedResource(details.url)
      cb({ cancel: !allowed })
    })

    const guard = (event: Electron.Event, url: string) => {
      if (isReturnUrl(url)) {
        event.preventDefault()
        finish(url)
      } else if (!isAllowedPage(url)) {
        event.preventDefault()
      }
    }
    win.webContents.on('will-navigate', guard)
    win.webContents.on('will-redirect', guard)
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-attach-webview', (event) => event.preventDefault())
    win.once('ready-to-show', () => win.show())
    win.on('closed', () => {
      if (open === win) open = undefined
      finish(undefined)
    })
    // Show the window even if the page fails, so the user can see it and close it.
    win.webContents.once('did-fail-load', () => {
      if (!win.isDestroyed() && !win.isVisible()) win.show()
    })
    win.loadURL(buildLoginUrl()).catch(() => {
      // Load errors (offline, blocked) show in the window; closing it resolves as cancelled.
    })
  })
}

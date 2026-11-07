/**
 * Steam sign-in through OpenID 2.0. Pure helpers only: building the login URL, checking what Steam sends back,
 * and asking Steam to confirm it. The Electron window lives in steamSignIn.ts.
 */

export const OP_ENDPOINT = 'https://steamcommunity.com/openid/login'
export const OPENID_NS = 'http://specs.openid.net/auth/2.0'
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select'

/** Reserved name (.invalid never resolves), so the return request can only be caught locally, never served. */
export const RETURN_URL = 'https://rimworld-launcher.invalid/openid/return'
export const REALM = 'https://rimworld-launcher.invalid/'

const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/
/** Fields the signature must cover, or check_authentication would not vouch for them. */
const MUST_SIGN = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce']

/** Pages the sign-in window may show. */
const PAGE_HOSTS = new Set(['steamcommunity.com', 'store.steampowered.com', 'login.steampowered.com'])
/** Extra hosts the login page loads scripts, styles, images and API calls from. */
const RESOURCE_HOSTS = new Set([
  'api.steampowered.com',
  'steamcommunity-a.akamaihd.net',
  'steamstore-a.akamaihd.net',
  'cdn.akamai.steamstatic.com',
  'cdn.cloudflare.steamstatic.com',
  'avatars.akamai.steamstatic.com',
  'avatars.cloudflare.steamstatic.com',
  'avatars.fastly.steamstatic.com'
])
const RESOURCE_SUFFIXES = ['.steamstatic.com']

export function buildLoginUrl(returnTo = RETURN_URL, realm = REALM): string {
  const q = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.claimed_id': IDENTIFIER_SELECT,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.return_to': returnTo,
    'openid.realm': realm
  })
  return `${OP_ENDPOINT}?${q.toString()}`
}

function parse(url: string): URL | undefined {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

/** True for any request to the return address, whatever its query. */
export function isReturnUrl(url: string, returnTo = RETURN_URL): boolean {
  const u = parse(url)
  const r = new URL(returnTo)
  return !!u && u.protocol === r.protocol && u.host === r.host && u.pathname === r.pathname
}

/** Top-level pages: https on Steam's community, store and login sites only. */
export function isAllowedPage(url: string): boolean {
  const u = parse(url)
  return !!u && u.protocol === 'https:' && PAGE_HOSTS.has(u.hostname)
}

/** Sub-resources: the page hosts plus Steam's static and API hosts. */
export function isAllowedResource(url: string): boolean {
  const u = parse(url)
  if (!u) return false
  if (u.protocol === 'data:' || u.protocol === 'blob:') return true
  if (u.protocol !== 'https:' && u.protocol !== 'wss:') return false
  const h = u.hostname
  return PAGE_HOSTS.has(h) || RESOURCE_HOSTS.has(h) || RESOURCE_SUFFIXES.some((s) => h.endsWith(s))
}

export type ReturnCheck = { ok: true; steamId: string; params: Record<string, string> } | { ok: false; cancelled?: boolean; error: string }

/** Checks the redirect Steam sent back before asking Steam to confirm it. Nothing here is trusted yet. */
export function validateReturn(url: string, returnTo = RETURN_URL): ReturnCheck {
  if (!isReturnUrl(url, returnTo)) return { ok: false, error: 'Unexpected return address.' }
  const params: Record<string, string> = {}
  for (const [k, v] of new URL(url).searchParams) {
    if (k.startsWith('openid.')) params[k] = v
  }
  const mode = params['openid.mode']
  if (mode === 'cancel') return { ok: false, cancelled: true, error: 'Sign-in was cancelled on the Steam page.' }
  if (mode !== 'id_res') return { ok: false, error: 'Steam did not confirm the sign-in.' }
  if (params['openid.ns'] !== OPENID_NS) return { ok: false, error: 'Wrong OpenID version in the reply.' }
  if (params['openid.op_endpoint'] !== OP_ENDPOINT) return { ok: false, error: 'The reply did not come from Steam.' }
  if (params['openid.return_to'] !== returnTo) return { ok: false, error: 'The reply was meant for another address.' }
  const claimed = params['openid.claimed_id'] ?? ''
  const m = CLAIMED_ID.exec(claimed)
  if (!m) return { ok: false, error: 'The reply holds no valid Steam ID.' }
  if (params['openid.identity'] !== claimed) return { ok: false, error: 'The reply identity does not match the Steam ID.' }
  if (!params['openid.sig'] || !params['openid.assoc_handle']) return { ok: false, error: 'The reply is not signed.' }
  const signed = (params['openid.signed'] ?? '').split(',')
  if (MUST_SIGN.some((f) => !signed.includes(f))) return { ok: false, error: 'The reply signature does not cover the Steam ID.' }
  return { ok: true, steamId: m[1], params }
}

/** Form body for the direct check: the same openid.* fields with the mode switched. */
export function buildCheckAuthBody(params: Record<string, string>): string {
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (k.startsWith('openid.') && k !== 'openid.mode') body.set(k, v)
  }
  body.set('openid.mode', 'check_authentication')
  return body.toString()
}

/** The reply is "key:value" lines. Only an exact is_valid:true counts. */
export function parseCheckAuthReply(text: string): boolean {
  const fields: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  if (fields.ns !== undefined && fields.ns !== OPENID_NS) return false
  return fields.is_valid === 'true'
}

export type PostText = (url: string, body: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

/**
 * Full check of a return URL: local rules first, then Steam's own confirmation.
 * Resolves to the SteamID64, or undefined when the user cancelled on the Steam page.
 */
export async function verifyReturn(url: string, post: PostText, returnTo = RETURN_URL): Promise<string | undefined> {
  const check = validateReturn(url, returnTo)
  if (!check.ok && check.cancelled) return undefined
  if (!check.ok) throw new Error(check.error)
  const res = await post(OP_ENDPOINT, buildCheckAuthBody(check.params))
  if (!res.ok) throw new Error(`Steam could not check the sign-in (HTTP ${res.status}).`)
  if (!parseCheckAuthReply(await res.text())) throw new Error('Steam did not confirm the sign-in.')
  return check.steamId
}

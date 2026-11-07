import { describe, expect, it } from 'vitest'
import {
  OP_ENDPOINT,
  OPENID_NS,
  RETURN_URL,
  REALM,
  buildCheckAuthBody,
  buildLoginUrl,
  isAllowedPage,
  isAllowedResource,
  isReturnUrl,
  parseCheckAuthReply,
  validateReturn,
  verifyReturn,
  type PostText
} from '../src/main/steamOpenId.ts'

// Fake id only; never a real account.
const ID = '76561190000000000'
const CLAIMED = `https://steamcommunity.com/openid/id/${ID}`

function reply(over: Record<string, string | undefined> = {}, base = RETURN_URL): string {
  const fields: Record<string, string | undefined> = {
    'openid.ns': OPENID_NS,
    'openid.mode': 'id_res',
    'openid.op_endpoint': OP_ENDPOINT,
    'openid.claimed_id': CLAIMED,
    'openid.identity': CLAIMED,
    'openid.return_to': RETURN_URL,
    'openid.response_nonce': '2026-11-07T10:00:00Zabc',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2lnbmF0dXJl',
    ...over
  }
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) q.set(k, v)
  return `${base}?${q.toString()}`
}

describe('buildLoginUrl', () => {
  it('asks Steam for checkid_setup with identifier_select and our return address', () => {
    const u = new URL(buildLoginUrl())
    expect(`${u.origin}${u.pathname}`).toBe(OP_ENDPOINT)
    const q = u.searchParams
    expect(q.get('openid.ns')).toBe(OPENID_NS)
    expect(q.get('openid.mode')).toBe('checkid_setup')
    expect(q.get('openid.claimed_id')).toBe('http://specs.openid.net/auth/2.0/identifier_select')
    expect(q.get('openid.identity')).toBe('http://specs.openid.net/auth/2.0/identifier_select')
    expect(q.get('openid.return_to')).toBe(RETURN_URL)
    expect(q.get('openid.realm')).toBe(REALM)
    expect(RETURN_URL.startsWith(REALM)).toBe(true)
  })
})

describe('validateReturn', () => {
  it('accepts a well formed reply and pulls out the SteamID64', () => {
    const r = validateReturn(reply())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.steamId).toBe(ID)
      expect(r.params['openid.sig']).toBe('c2lnbmF0dXJl')
    }
  })

  it('reports a cancel on the Steam page as cancelled', () => {
    const r = validateReturn(`${RETURN_URL}?openid.mode=cancel&openid.ns=${encodeURIComponent(OPENID_NS)}`)
    expect(r).toMatchObject({ ok: false, cancelled: true })
  })

  it.each([
    ['a wrong op_endpoint', { 'openid.op_endpoint': 'https://evil.example/openid/login' }],
    ['an op_endpoint on http', { 'openid.op_endpoint': 'http://steamcommunity.com/openid/login' }],
    ['a claimed_id on another host', { 'openid.claimed_id': `https://steamcommunity.com.evil.example/openid/id/${ID}` }],
    ['a short claimed_id', { 'openid.claimed_id': 'https://steamcommunity.com/openid/id/123', 'openid.identity': 'https://steamcommunity.com/openid/id/123' }],
    ['a claimed_id with a trailing path', { 'openid.claimed_id': `${CLAIMED}/x`, 'openid.identity': `${CLAIMED}/x` }],
    ['an identity that differs from claimed_id', { 'openid.identity': 'https://steamcommunity.com/openid/id/76561190000000009' }],
    ['a wrong return_to', { 'openid.return_to': 'https://rimworld-launcher.invalid/other' }],
    ['a mode other than id_res', { 'openid.mode': 'setup_needed' }],
    ['a missing mode', { 'openid.mode': undefined }],
    ['a wrong ns', { 'openid.ns': 'http://openid.net/signon/1.1' }],
    ['a missing signature', { 'openid.sig': undefined }],
    ['a signature that skips claimed_id', { 'openid.signed': 'op_endpoint,identity,return_to,response_nonce' }]
  ])('rejects %s', (_label, over) => {
    const r = validateReturn(reply(over))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.cancelled).toBeFalsy()
  })

  it('rejects a reply sent to another address', () => {
    expect(validateReturn(reply({}, 'https://example.com/openid/return')).ok).toBe(false)
    expect(validateReturn('not a url').ok).toBe(false)
  })
})

describe('check_authentication', () => {
  it('copies the openid fields and switches the mode', () => {
    const r = validateReturn(reply())
    if (!r.ok) throw new Error('fixture should pass')
    const body = new URLSearchParams(buildCheckAuthBody({ ...r.params, other: 'x' }))
    expect(body.get('openid.mode')).toBe('check_authentication')
    expect(body.getAll('openid.mode')).toHaveLength(1)
    expect(body.get('openid.sig')).toBe('c2lnbmF0dXJl')
    expect(body.get('openid.claimed_id')).toBe(CLAIMED)
    expect(body.get('other')).toBeNull()
  })

  it('only trusts an exact is_valid:true', () => {
    expect(parseCheckAuthReply(`ns:${OPENID_NS}\nis_valid:true\n`)).toBe(true)
    expect(parseCheckAuthReply(`ns:${OPENID_NS}\r\nis_valid:true\r\n`)).toBe(true)
    expect(parseCheckAuthReply(`ns:${OPENID_NS}\nis_valid:false\n`)).toBe(false)
    expect(parseCheckAuthReply('is_valid:TRUE')).toBe(false)
    expect(parseCheckAuthReply('is_valid:truex')).toBe(false)
    expect(parseCheckAuthReply('ns:http://openid.net/signon/1.1\nis_valid:true')).toBe(false)
    expect(parseCheckAuthReply('<html>is_valid:true is here</html>')).toBe(false)
    expect(parseCheckAuthReply('')).toBe(false)
  })
})

describe('verifyReturn', () => {
  const post =
    (text: string, ok = true, seen: { url?: string; body?: string } = {}): PostText =>
    async (url, body) => {
      seen.url = url
      seen.body = body
      return { ok, status: ok ? 200 : 503, text: async () => text }
    }

  it('returns the id once Steam confirms it', async () => {
    const seen: { url?: string; body?: string } = {}
    await expect(verifyReturn(reply(), post('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n', true, seen))).resolves.toBe(ID)
    expect(seen.url).toBe(OP_ENDPOINT)
    expect(seen.body).toContain('openid.mode=check_authentication')
  })

  it('throws when Steam says the reply is not valid', async () => {
    await expect(verifyReturn(reply(), post('is_valid:false'))).rejects.toThrow('did not confirm')
  })

  it('throws on an HTTP error from Steam', async () => {
    await expect(verifyReturn(reply(), post('', false))).rejects.toThrow('HTTP 503')
  })

  it('never asks Steam about a reply that fails the local checks', async () => {
    const seen: { url?: string } = {}
    await expect(verifyReturn(reply({ 'openid.op_endpoint': 'https://evil.example/' }), post('is_valid:true', true, seen))).rejects.toThrow()
    expect(seen.url).toBeUndefined()
  })

  it('resolves undefined on a cancel', async () => {
    await expect(verifyReturn(`${RETURN_URL}?openid.mode=cancel`, post('is_valid:true'))).resolves.toBeUndefined()
  })
})

describe('sign-in window rules', () => {
  it('spots the return address whatever its query', () => {
    expect(isReturnUrl(reply())).toBe(true)
    expect(isReturnUrl(RETURN_URL)).toBe(true)
    expect(isReturnUrl('https://rimworld-launcher.invalid/elsewhere')).toBe(false)
    expect(isReturnUrl('http://rimworld-launcher.invalid/openid/return')).toBe(false)
    expect(isReturnUrl('garbage')).toBe(false)
  })

  it('shows only Steam pages over https', () => {
    expect(isAllowedPage(buildLoginUrl())).toBe(true)
    expect(isAllowedPage('https://store.steampowered.com/login/')).toBe(true)
    expect(isAllowedPage('https://login.steampowered.com/jwt/refresh')).toBe(true)
    expect(isAllowedPage('http://steamcommunity.com/openid/login')).toBe(false)
    expect(isAllowedPage('https://steamcommunity.com.evil.example/')).toBe(false)
    expect(isAllowedPage('https://evil.example/?steamcommunity.com')).toBe(false)
    expect(isAllowedPage('file:///C:/Windows/win.ini')).toBe(false)
  })

  it('loads resources only from Steam hosts', () => {
    expect(isAllowedResource('https://community.cloudflare.steamstatic.com/public/css/x.css')).toBe(true)
    expect(isAllowedResource('https://steamcommunity-a.akamaihd.net/public/x.js')).toBe(true)
    expect(isAllowedResource('https://api.steampowered.com/IAuthenticationService/x')).toBe(true)
    expect(isAllowedResource('data:image/png;base64,AAAA')).toBe(true)
    expect(isAllowedResource('https://evil.example/x.js')).toBe(false)
    expect(isAllowedResource('https://evilsteamstatic.com/x.js')).toBe(false)
    expect(isAllowedResource('http://cdn.akamai.steamstatic.com/x.js')).toBe(false)
  })
})

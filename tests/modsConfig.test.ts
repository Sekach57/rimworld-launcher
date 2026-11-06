import { describe, expect, it } from 'vitest'
import { parseModsConfig, writeModsConfig } from '../src/shared/modsConfig.ts'

const GAME_FILE =
  '﻿<?xml version="1.0" encoding="utf-8"?>\r\n' +
  '<ModsConfigData>\r\n' +
  '  <version>1.6.4633 rev1261</version>\r\n' +
  '  <activeMods>\r\n' +
  '    <li>brrainz.harmony</li>\r\n' +
  '    <li>ludeon.rimworld</li>\r\n' +
  '    <li>ludeon.rimworld.royalty</li>\r\n' +
  '    <li>some.mod_steam</li>\r\n' +
  '  </activeMods>\r\n' +
  '  <knownExpansions>\r\n' +
  '    <li>ludeon.rimworld.royalty</li>\r\n' +
  '  </knownExpansions>\r\n' +
  '</ModsConfigData>'

describe('ModsConfig.xml', () => {
  it('writes the exact bytes the game writes', () => {
    const out = writeModsConfig({
      version: '1.6.4633 rev1261',
      activeMods: ['brrainz.harmony', 'ludeon.rimworld', 'ludeon.rimworld.royalty', 'some.mod_steam'],
      knownExpansions: ['ludeon.rimworld.royalty']
    })
    expect(out).toBe(GAME_FILE)
    expect(Buffer.from(out, 'utf8').subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(out.endsWith('</ModsConfigData>')).toBe(true)
  })

  it('round-trips a game file', () => {
    expect(writeModsConfig(parseModsConfig(GAME_FILE))).toBe(GAME_FILE)
  })

  it('writes empty lists as self-closing tags', () => {
    const out = writeModsConfig({ version: '1.6', activeMods: [], knownExpansions: [] })
    expect(out).toContain('\r\n  <activeMods />\r\n  <knownExpansions />\r\n')
  })

  it('parses loosely: comments, LF endings, mixed case, missing sections', () => {
    const data = parseModsConfig('<ModsConfigData>\n<!-- <li>no</li> -->\n<activeMods><li>Ludeon.RimWorld</li><li> A.B </li></activeMods>\n</ModsConfigData>')
    expect(data).toEqual({ version: '', activeMods: ['ludeon.rimworld', 'a.b'], knownExpansions: [] })
  })

  it('escapes markup characters', () => {
    expect(writeModsConfig({ version: 'a<b', activeMods: ['x&y'], knownExpansions: [] })).toContain('<li>x&amp;y</li>')
  })
})

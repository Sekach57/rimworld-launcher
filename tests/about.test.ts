import { describe, expect, it } from 'vitest'
import { forVersion, majorMinor, parseAboutXml } from '../src/shared/about.ts'

const FULL = `<?xml version="1.0" encoding="utf-8"?>
<ModMetaData>
  <name>Vanilla Expanded Framework</name>
  <packageId>OskarPotocki.VanillaFactionsExpanded.Core</packageId>
  <author>Oskar Potocki, Taranchuk</author>
  <supportedVersions>
    <li>1.5</li>
    <li>1.6</li>
  </supportedVersions>
  <modDependencies>
    <li>
      <packageId>brrainz.harmony</packageId>
      <displayName>Harmony</displayName>
      <steamWorkshopUrl>steam://url/CommunityFilePage/2009463077</steamWorkshopUrl>
    </li>
  </modDependencies>
  <modDependenciesByVersion>
    <v1.5>
      <li><packageId>brrainz.harmony</packageId></li>
      <li><packageId>old.lib</packageId></li>
    </v1.5>
  </modDependenciesByVersion>
  <loadAfter>
    <li>Ludeon.RimWorld</li>
    <li>brrainz.harmony</li>
  </loadAfter>
  <loadBeforeByVersion>
    <v1.6><li>Some.Other</li></v1.6>
  </loadBeforeByVersion>
  <incompatibleWith><li>Bad.Mod</li></incompatibleWith>
  <description>Shared code &amp; defs.</description>
</ModMetaData>`

describe('parseAboutXml', () => {
  it('reads the common fields and lowercases package ids', () => {
    const { data, issue } = parseAboutXml(FULL)
    expect(issue).toBeUndefined()
    expect(data.name).toBe('Vanilla Expanded Framework')
    expect(data.packageId).toBe('oskarpotocki.vanillafactionsexpanded.core')
    expect(data.packageIdRaw).toBe('OskarPotocki.VanillaFactionsExpanded.Core')
    expect(data.author).toBe('Oskar Potocki, Taranchuk')
    expect(data.supportedVersions).toEqual(['1.5', '1.6'])
    expect(data.modDependencies).toEqual([
      { packageId: 'brrainz.harmony', displayName: 'Harmony', steamWorkshopUrl: 'steam://url/CommunityFilePage/2009463077' }
    ])
    expect(data.modDependenciesByVersion['v1.5'].map((d) => d.packageId)).toEqual(['brrainz.harmony', 'old.lib'])
    expect(data.loadAfter).toEqual(['ludeon.rimworld', 'brrainz.harmony'])
    expect(data.loadBeforeByVersion).toEqual({ 'v1.6': ['some.other'] })
    expect(data.incompatibleWith).toEqual(['bad.mod'])
    expect(data.description).toBe('Shared code & defs.')
  })

  it('accepts odd tag casing and a BOM', () => {
    const xml = '﻿<ModMetaData><Name>X</Name><packageID>A.B</packageID><SupportedVersions><li>1.6</li></SupportedVersions></ModMetaData>'
    const { data, issue } = parseAboutXml(xml)
    expect(issue).toBeUndefined()
    expect(data.name).toBe('X')
    expect(data.packageId).toBe('a.b')
    expect(data.supportedVersions).toEqual(['1.6'])
  })

  it('handles a single li and empty lists', () => {
    const { data } = parseAboutXml('<ModMetaData><packageId>a.b</packageId><loadAfter><li>c.d</li></loadAfter><loadBefore /></ModMetaData>')
    expect(data.loadAfter).toEqual(['c.d'])
    expect(data.loadBefore).toEqual([])
  })

  it('falls back to regex extraction for broken XML', () => {
    const broken = `<ModMetaData>
  <name>Broken & Proud</name>
  <packageId>Some.Broken</packageId>
  <supportedVersions><li>1.6</li></supportedVersions>
  <modDependencies><li><packageId>brrainz.harmony</packageId></li></modDependencies>
  <loadAfter><li>Ludeon.RimWorld</li>
  <description>never closed`
    const { data, issue } = parseAboutXml(broken)
    expect(issue).toMatch(/Malformed XML/)
    expect(data.packageId).toBe('some.broken')
    expect(data.name).toBe('Broken & Proud')
    expect(data.supportedVersions).toEqual(['1.6'])
    expect(data.modDependencies.map((d) => d.packageId)).toEqual(['brrainz.harmony'])
  })

  it('never throws on garbage', () => {
    expect(() => parseAboutXml('')).not.toThrow()
    expect(() => parseAboutXml('not xml at all <<<')).not.toThrow()
    expect(parseAboutXml('<Other><x/></Other>').issue).toBe('No <ModMetaData> root')
  })
})

describe('version helpers', () => {
  it('reduces a game version to major.minor', () => {
    expect(majorMinor('1.6.4633 rev1261')).toBe('1.6')
    expect(majorMinor('1.7.5000 rev1275')).toBe('1.7')
  })

  it('uses a ByVersion list in place of the base list', () => {
    expect(forVersion(['a'], { 'v1.6': ['b'] }, '1.6.1 rev1')).toEqual(['b'])
    expect(forVersion(['a'], { 'v1.5': ['b'] }, '1.6.1 rev1')).toEqual(['a'])
  })
})

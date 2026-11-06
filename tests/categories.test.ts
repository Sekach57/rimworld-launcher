import { describe, expect, it } from 'vitest'
import { autoCategory, categoryOf, sanitizeOverrides } from '../src/shared/categories.ts'
import { mod } from './helpers.ts'

describe('autoCategory', () => {
  it('puts official content and known frameworks first', () => {
    expect(autoCategory(mod('ludeon.rimworld.biotech'))).toBe('Official')
    expect(autoCategory(mod('brrainz.harmony', { name: 'Harmony' }))).toBe('Framework')
  })

  it('reads the name before the description', () => {
    expect(autoCategory(mod('a.guns', { name: 'More Guns', description: 'Adds a storyteller event' }))).toBe('Weapons')
    expect(autoCategory(mod('a.ru', { name: 'Russian Translation Pack' }))).toBe('Translation')
    expect(autoCategory(mod('a.perf', { name: 'Performance Fish' }))).toBe('Performance')
  })

  it('falls back to the folder layout', () => {
    expect(autoCategory(mod('a.retex', { name: 'Zed Pack', contentHints: ['textures'] }))).toBe('Graphics')
    expect(autoCategory(mod('a.lang', { name: 'Zed Pack', contentHints: ['languages'] }))).toBe('Translation')
    expect(autoCategory(mod('a.dll', { name: 'Zed Pack', contentHints: ['assemblies'] }))).toBe('UI & QoL')
  })

  it('uses a description hit only when the layout says nothing', () => {
    expect(autoCategory(mod('a.b', { name: 'Zed', description: 'New animals for your colony' }))).toBe('Animals')
    expect(autoCategory(mod('a.c', { name: 'Zed', contentHints: ['defs', 'textures'] }))).toBe('Other')
  })
})

describe('categoryOf', () => {
  it('lets a manual choice win and ignores unknown values', () => {
    const m = mod('a.guns', { name: 'More Guns' })
    expect(categoryOf(m, { 'a.guns': 'Apparel' })).toBe('Apparel')
    expect(categoryOf(m, { 'a.guns': 'Nonsense' })).toBe('Weapons')
  })
})

describe('sanitizeOverrides', () => {
  it('keeps only valid entries', () => {
    expect(sanitizeOverrides({ 'A.B': 'Weapons', c: 'bad', d: 3 })).toEqual({ 'a.b': 'Weapons' })
    expect(sanitizeOverrides(null)).toEqual({})
    expect(sanitizeOverrides(['x'])).toEqual({})
  })
})

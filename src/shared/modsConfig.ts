import { stripBom } from './about.ts'

export interface ModsConfigData {
  version: string
  activeMods: string[]
  knownExpansions: string[]
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function listOf(xml: string, tag: string): string[] {
  const m = new RegExp(`<${tag}\\s*>([\\s\\S]*?)</${tag}\\s*>`, 'i').exec(xml)
  if (!m) return []
  return [...m[1].matchAll(/<li\s*>([\s\S]*?)<\/li\s*>/gi)].map((x) => decode(x[1]).toLowerCase()).filter(Boolean)
}

/** Read ModsConfig.xml. Missing sections come back empty. */
export function parseModsConfig(raw: string): ModsConfigData {
  const xml = stripBom(raw).replace(/<!--[\s\S]*?-->/g, '')
  const version = /<version\s*>([\s\S]*?)<\/version\s*>/i.exec(xml)
  return {
    version: version ? decode(version[1]) : '',
    activeMods: listOf(xml, 'activeMods'),
    knownExpansions: listOf(xml, 'knownExpansions')
  }
}

/**
 * Write ModsConfig.xml the way RimWorld does: UTF-8 BOM, CRLF, two-space indent,
 * no newline at the end, `<tag />` for an empty list.
 */
export function writeModsConfig(data: ModsConfigData): string {
  const lines = ['<?xml version="1.0" encoding="utf-8"?>', '<ModsConfigData>', `  <version>${escape(data.version)}</version>`]
  const list = (tag: string, values: string[]) => {
    if (values.length === 0) {
      lines.push(`  <${tag} />`)
      return
    }
    lines.push(`  <${tag}>`)
    for (const v of values) lines.push(`    <li>${escape(v)}</li>`)
    lines.push(`  </${tag}>`)
  }
  list('activeMods', data.activeMods)
  list('knownExpansions', data.knownExpansions)
  lines.push('</ModsConfigData>')
  return '﻿' + lines.join('\r\n')
}

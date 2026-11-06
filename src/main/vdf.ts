/** Minimal parser for Valve KeyValues text files such as libraryfolders.vdf. */
export type VdfNode = { [key: string]: string | VdfNode }

export function parseVdf(text: string): VdfNode {
  const tokens: string[] = []
  const re = /"((?:\\.|[^"\\])*)"|([{}])|\/\/[^\n]*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) tokens.push('s' + m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"'))
    else if (m[2]) tokens.push(m[2])
  }
  let i = 0
  function block(): VdfNode {
    const out: VdfNode = {}
    while (i < tokens.length) {
      const t = tokens[i++]
      if (t === '}') return out
      if (t === '{') continue
      const key = t.slice(1)
      const next = tokens[i]
      if (next === '{') {
        i++
        out[key] = block()
      } else if (next !== undefined && next !== '}') {
        i++
        out[key] = next.slice(1)
      }
    }
    return out
  }
  return block()
}

/** Library root folders listed in steamapps/libraryfolders.vdf. */
export function libraryPaths(text: string): string[] {
  const root = parseVdf(text)
  const folders = (root.libraryfolders ?? root.LibraryFolders) as VdfNode | undefined
  if (!folders || typeof folders !== 'object') return []
  const out: string[] = []
  for (const value of Object.values(folders)) {
    if (typeof value === 'string') {
      // Old format: "1" "D:\\SteamLibrary"
      if (/[\\/]/.test(value)) out.push(value)
    } else if (typeof value.path === 'string') {
      out.push(value.path)
    }
  }
  return out
}

import type { LaunchCommand } from './types.ts'

function trimSlashes(p: string): string {
  return p.replace(/[\\/]+$/, '')
}

function join(dir: string, file: string): string {
  const sep = dir.includes('/') && !dir.includes('\\') ? '/' : '\\'
  return `${trimSlashes(dir)}${sep}${file}`
}

/**
 * Command line for one instance. The game reads `-savedatafolder=<path>`; a trailing
 * backslash would escape the closing quote Windows adds, so it is removed.
 */
export function buildLaunchCommand(gameDir: string, exeName: string, dataDir: string): LaunchCommand {
  if (!gameDir.trim()) throw new Error('Game folder is not set')
  if (!exeName.trim()) throw new Error('Game executable is not set')
  if (!dataDir.trim()) throw new Error('Instance data folder is not set')
  return {
    file: join(gameDir, exeName),
    args: [`-savedatafolder=${trimSlashes(dataDir)}`],
    cwd: trimSlashes(gameDir)
  }
}

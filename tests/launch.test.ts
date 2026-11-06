import { describe, expect, it } from 'vitest'
import { buildLaunchCommand } from '../src/shared/launch.ts'

describe('buildLaunchCommand', () => {
  it('builds the exe path and the savedatafolder argument', () => {
    expect(
      buildLaunchCommand('T:\\All\\Steam\\steamapps\\common\\RimWorld', 'RimWorldWin64.exe', 'C:\\Users\\me\\AppData\\Roaming\\launcher\\instances\\abc\\data')
    ).toEqual({
      file: 'T:\\All\\Steam\\steamapps\\common\\RimWorld\\RimWorldWin64.exe',
      args: ['-savedatafolder=C:\\Users\\me\\AppData\\Roaming\\launcher\\instances\\abc\\data'],
      cwd: 'T:\\All\\Steam\\steamapps\\common\\RimWorld'
    })
  })

  it('drops trailing slashes so the quoted argument stays intact', () => {
    const cmd = buildLaunchCommand('D:\\Games\\RimWorld\\', 'RimWorld.exe', 'D:\\Data\\inst 1\\')
    expect(cmd.file).toBe('D:\\Games\\RimWorld\\RimWorld.exe')
    expect(cmd.args).toEqual(['-savedatafolder=D:\\Data\\inst 1'])
    expect(cmd.cwd).toBe('D:\\Games\\RimWorld')
  })

  it('keeps forward slashes when the path uses them', () => {
    expect(buildLaunchCommand('/opt/rimworld/', 'RimWorldLinux', '/home/me/data').file).toBe('/opt/rimworld/RimWorldLinux')
  })

  it('refuses empty settings', () => {
    expect(() => buildLaunchCommand('', 'RimWorld.exe', 'x')).toThrow('Game folder is not set')
    expect(() => buildLaunchCommand('x', ' ', 'x')).toThrow('Game executable is not set')
    expect(() => buildLaunchCommand('x', 'RimWorld.exe', '')).toThrow('Instance data folder is not set')
  })
})

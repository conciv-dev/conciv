import {existsSync, statSync} from 'node:fs'
import {delimiter, join} from 'node:path'

export type HarnessId = 'claude' | 'codex' | 'opencode' | 'pi'
export type FoundHarness = {id: HarnessId; via: 'path' | 'config'}

type HarnessMarker = {id: HarnessId; bin: string; configDir: string[]}

const harnessMarkers: HarnessMarker[] = [
  {id: 'claude', bin: 'claude', configDir: ['.claude']},
  {id: 'codex', bin: 'codex', configDir: ['.codex']},
  {id: 'opencode', bin: 'opencode', configDir: ['.config', 'opencode']},
  {id: 'pi', bin: 'pi', configDir: ['.pi']},
]

export function detectHarnesses(env: {PATH: string; HOME: string}): FoundHarness[] {
  const pathDirs = env.PATH.split(delimiter).filter((entry) => entry.length > 0)
  return harnessMarkers.flatMap((marker): FoundHarness[] => {
    if (pathDirs.some((pathDir) => isExecutable(join(pathDir, marker.bin)))) return [{id: marker.id, via: 'path'}]
    if (existsSync(join(env.HOME, ...marker.configDir))) return [{id: marker.id, via: 'config'}]
    return []
  })
}

function isExecutable(file: string): boolean {
  if (!existsSync(file)) return false
  return (statSync(file).mode & 0o111) !== 0
}

import {readdirSync, readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join, relative} from 'node:path'
import type {HarnessConnectFile} from '@conciv/protocol/harness-types'

export const CLAUDE_CONNECT_SKILLS_DIR = 'skills'

const AUTHORING_DIR = '_artifacts'

function skillsSourceDir(): string {
  const packageManifest = createRequire(import.meta.url).resolve('@conciv/skills/package.json')
  return join(dirname(packageManifest), 'skills')
}

function sortedEntries(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true})
    .flatMap((entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return sortedEntries(full)
      return [full]
    })
    .toSorted()
}

function skillDirs(root: string): string[] {
  return readdirSync(root, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && entry.name !== AUTHORING_DIR)
    .map((entry) => entry.name)
    .toSorted()
}

export function claudeConnectSkillFiles(pluginDir: string): HarnessConnectFile[] {
  const root = skillsSourceDir()
  return skillDirs(root).flatMap((skill) =>
    sortedEntries(join(root, skill)).map((file) => ({
      path: join(pluginDir, CLAUDE_CONNECT_SKILLS_DIR, relative(root, file)),
      contents: readFileSync(file, 'utf8'),
    })),
  )
}

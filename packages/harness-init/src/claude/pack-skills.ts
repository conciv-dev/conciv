import {createRequire} from 'node:module'
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import type {HarnessConnectFile} from '@conciv/protocol/harness-types'

const SKILLS_PACK_NAME = '@conciv/skills'

function skillsPackRoot(): string | null {
  const resolve = createRequire(import.meta.url).resolve
  try {
    return join(dirname(resolve(`${SKILLS_PACK_NAME}/package.json`)), 'skills')
  } catch {
    return null
  }
}

function isSkillMarkdown(relativePath: string): boolean {
  if (relativePath.startsWith('_artifacts')) return false
  const segments = relativePath.split('/')
  if (segments.length === 2 && segments[1] === 'SKILL.md') return true
  return segments.length >= 3 && segments[1] === 'references' && relativePath.endsWith('.md')
}

function walkMarkdownFiles(root: string): string[] {
  const found: string[] = []
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir).toSorted()) {
      const absolute = join(dir, entry)
      if (statSync(absolute).isDirectory()) {
        visit(absolute)
        continue
      }
      const rel = relative(root, absolute).split('\\').join('/')
      if (isSkillMarkdown(rel)) found.push(absolute)
    }
  }
  visit(root)
  return found.toSorted()
}

export function claudePackSkillFiles(pluginRoot: string): HarnessConnectFile[] {
  const root = skillsPackRoot()
  if (root === null || !existsSync(root)) return []
  return walkMarkdownFiles(root).map((absolute) => {
    const rel = relative(root, absolute).split('\\').join('/')
    return {path: join(pluginRoot, 'skills', rel), contents: readFileSync(absolute, 'utf8')}
  })
}

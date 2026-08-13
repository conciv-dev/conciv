import {createRequire} from 'node:module'
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import type {HarnessConnectFile} from '@conciv/protocol/harness-types'

const SKILLS_PACK_NAME = '@conciv/skills'

export type PackSkillsResolution =
  | {status: 'resolved'; source: 'project' | 'harness-init'; root: string}
  | {status: 'unresolved'; reason: string}

export type SkillsManifestResolver = (base: string) => string

const defaultResolver: SkillsManifestResolver = (base) =>
  createRequire(base).resolve(`${SKILLS_PACK_NAME}/package.json`)

function tryResolveSkillsRoot(base: string, resolve: SkillsManifestResolver): string | null {
  try {
    return join(dirname(resolve(base)), 'skills')
  } catch {
    return null
  }
}

export function resolvePackSkillsRoot(
  cwd: string,
  resolve: SkillsManifestResolver = defaultResolver,
): PackSkillsResolution {
  const projectRoot = tryResolveSkillsRoot(join(cwd, 'noop.js'), resolve)
  if (projectRoot !== null) return {status: 'resolved', source: 'project', root: projectRoot}
  const ownRoot = tryResolveSkillsRoot(import.meta.url, resolve)
  if (ownRoot !== null) return {status: 'resolved', source: 'harness-init', root: ownRoot}
  return {
    status: 'unresolved',
    reason: `could not resolve ${SKILLS_PACK_NAME}/package.json from the project at ${cwd} or from @conciv/harness-init's own dependency`,
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

export type PackSkillFiles = {files: HarnessConnectFile[]; resolution: PackSkillsResolution}

export function claudePackSkillFiles(
  pluginRoot: string,
  cwd: string,
  resolve: SkillsManifestResolver = defaultResolver,
): PackSkillFiles {
  const resolution = resolvePackSkillsRoot(cwd, resolve)
  if (resolution.status === 'unresolved') return {files: [], resolution}
  if (!existsSync(resolution.root)) {
    return {
      files: [],
      resolution: {
        status: 'unresolved',
        reason: `${SKILLS_PACK_NAME} resolved to ${resolution.root} (via ${resolution.source}) but that directory does not exist`,
      },
    }
  }
  const files = walkMarkdownFiles(resolution.root).map((absolute) => {
    const rel = relative(resolution.root, absolute).split('\\').join('/')
    return {path: join(pluginRoot, 'skills', rel), contents: readFileSync(absolute, 'utf8')}
  })
  return {files, resolution}
}

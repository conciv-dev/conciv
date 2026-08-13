import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {claudePackSkillFiles, resolvePackSkillsRoot} from '../src/claude/pack-skills.js'

const pluginRoot = '/plugin-root'

function packFiles(cwd = process.cwd()) {
  return claudePackSkillFiles(pluginRoot, cwd).files
}

function throwingResolver(): never {
  throw new Error('Cannot find module')
}

describe('claudePackSkillFiles', () => {
  it('copies every installed @conciv/skills SKILL.md under <plugin>/skills/<slug>/', () => {
    const files = packFiles()
    const slugs = files.filter((file) => file.path.endsWith('SKILL.md')).map((file) => file.path)
    expect(slugs).toContain(join(pluginRoot, 'skills', 'conciv-setup', 'SKILL.md'))
    expect(slugs).toContain(join(pluginRoot, 'skills', 'conciv-develop', 'SKILL.md'))
    expect(slugs).toContain(join(pluginRoot, 'skills', 'conciv-debug', 'SKILL.md'))
    expect(slugs).toContain(join(pluginRoot, 'skills', 'conciv-harness', 'SKILL.md'))
    expect(slugs).toContain(join(pluginRoot, 'skills', 'conciv-self-update', 'SKILL.md'))
  })

  it('copies reference markdown alongside the skill that owns it', () => {
    const files = packFiles()
    const references = files.filter((file) => file.path.includes(`${join('skills', 'conciv-develop', 'references')}`))
    expect(references.length).toBeGreaterThan(0)
  })

  it('never copies the maintainer-only _artifacts directory', () => {
    const files = packFiles()
    expect(files.some((file) => file.path.includes('_artifacts'))).toBe(false)
  })

  it('copies bytes identical to the installed package source', () => {
    const files = packFiles()
    const setup = files.find((file) => file.path === join(pluginRoot, 'skills', 'conciv-setup', 'SKILL.md'))
    expect(setup?.contents).toContain('name: conciv-setup')
    expect(setup?.contents).toContain('library_version')
  })

  it('is deterministic across calls', () => {
    expect(packFiles()).toEqual(packFiles())
  })

  function isProjectAttempt(base: string): boolean {
    return base.endsWith('noop.js')
  }

  it('reports source "harness-init" when @conciv/skills does not resolve from the project cwd', () => {
    const ownManifest = join('/harness-init-dep', 'node_modules', '@conciv', 'skills', 'package.json')
    const resolver = (base: string) => {
      if (isProjectAttempt(base)) throw new Error('Cannot find module')
      return ownManifest
    }

    const resolution = resolvePackSkillsRoot('/nonexistent-project', resolver)

    expect(resolution).toEqual({status: 'resolved', source: 'harness-init', root: join(dirname(ownManifest), 'skills')})
  })

  it('prefers the project copy over the harness-init dependency when both resolve', () => {
    const projectManifest = join('/the-project', 'node_modules', '@conciv', 'skills', 'package.json')
    const ownManifest = join('/harness-init-dep', 'node_modules', '@conciv', 'skills', 'package.json')
    const resolver = (base: string) => (isProjectAttempt(base) ? projectManifest : ownManifest)

    const resolution = resolvePackSkillsRoot('/the-project', resolver)

    expect(resolution).toEqual({status: 'resolved', source: 'project', root: join(dirname(projectManifest), 'skills')})
  })

  it('is loud when @conciv/skills cannot be resolved from either the project or the harness-init dependency: unresolved with a reason naming the cwd, zero files', () => {
    const resolution = resolvePackSkillsRoot('/some/project', throwingResolver)
    expect(resolution).toEqual({status: 'unresolved', reason: expect.stringContaining('/some/project')})

    const result = claudePackSkillFiles(pluginRoot, '/some/project', throwingResolver)
    expect(result.files).toEqual([])
    expect(result.resolution.status).toBe('unresolved')
  })

  it('is loud when @conciv/skills resolves but its skills/ directory is missing: unresolved with a reason naming the resolved root, zero files', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'conciv-pack-skills-no-dir-'))
    const manifestPath = join(scratch, 'package.json')
    const resolver = () => manifestPath

    const result = claudePackSkillFiles(pluginRoot, scratch, resolver)

    expect(result.files).toEqual([])
    expect(result.resolution).toEqual({status: 'unresolved', reason: expect.stringContaining(scratch)})
  })
})

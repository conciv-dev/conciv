import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {claudePackSkillFiles} from '../src/claude/pack-skills.js'

const pluginRoot = '/plugin-root'

describe('claudePackSkillFiles', () => {
  it('copies every installed @conciv/skills SKILL.md under <plugin>/skills/<slug>/', () => {
    const files = claudePackSkillFiles(pluginRoot)
    const slugs = files.filter((file) => file.path.endsWith('SKILL.md')).map((file) => file.path)
    expect(slugs).toContain(join(pluginRoot, 'skills', 'conciv-setup', 'SKILL.md'))
    expect(slugs).toContain(join(pluginRoot, 'skills', 'conciv-develop', 'SKILL.md'))
    expect(slugs).toContain(join(pluginRoot, 'skills', 'conciv-debug', 'SKILL.md'))
    expect(slugs).toContain(join(pluginRoot, 'skills', 'conciv-harness', 'SKILL.md'))
    expect(slugs).toContain(join(pluginRoot, 'skills', 'conciv-self-update', 'SKILL.md'))
  })

  it('copies reference markdown alongside the skill that owns it', () => {
    const files = claudePackSkillFiles(pluginRoot)
    const references = files.filter((file) => file.path.includes(`${join('skills', 'conciv-develop', 'references')}`))
    expect(references.length).toBeGreaterThan(0)
  })

  it('never copies the maintainer-only _artifacts directory', () => {
    const files = claudePackSkillFiles(pluginRoot)
    expect(files.some((file) => file.path.includes('_artifacts'))).toBe(false)
  })

  it('copies bytes identical to the installed package source', () => {
    const files = claudePackSkillFiles(pluginRoot)
    const setup = files.find((file) => file.path === join(pluginRoot, 'skills', 'conciv-setup', 'SKILL.md'))
    expect(setup?.contents).toContain('name: conciv-setup')
    expect(setup?.contents).toContain('library_version')
  })

  it('is deterministic across calls', () => {
    expect(claudePackSkillFiles(pluginRoot)).toEqual(claudePackSkillFiles(pluginRoot))
  })
})

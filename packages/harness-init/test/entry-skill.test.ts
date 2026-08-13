import {describe, expect, it} from 'vitest'
import {concivEntrySkillMarkdown, CONCIV_ENTRY_SKILL_NAME} from '../src/claude/entry-skill.js'

describe('concivEntrySkillMarkdown', () => {
  it('names the entry skill and teaches the catalog discovery loop, not a fixed verb list', () => {
    const markdown = concivEntrySkillMarkdown()
    expect(markdown).toContain(`name: ${CONCIV_ENTRY_SKILL_NAME}`)
    expect(markdown).toContain('external_catalog')
    expect(markdown).toContain('not fixed')
    expect(markdown).not.toContain('conciv tools page')
    expect(markdown).not.toContain('conciv tools react')
  })

  it('names conciv tools --help for one-shot calls outside code mode', () => {
    expect(concivEntrySkillMarkdown()).toContain('conciv tools --help')
  })

  it('stays flat: about 200 tokens, independent of catalog size', () => {
    const markdown = concivEntrySkillMarkdown()
    const words = markdown.trim().split(/\s+/).length
    expect(words).toBeLessThan(220)
  })

  it('is deterministic', () => {
    expect(concivEntrySkillMarkdown()).toBe(concivEntrySkillMarkdown())
  })
})

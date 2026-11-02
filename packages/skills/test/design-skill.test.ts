import {readFileSync} from 'node:fs'
import {expect, test} from 'vitest'
import {designSkillFile} from '@conciv/harness-init/claude/files'

const SKILL = new URL('../skills/conciv-design/SKILL.md', import.meta.url)

test('the conciv-design skill is the rendered design skill file, with its sources', () => {
  const skill = readFileSync(SKILL, 'utf8')
  expect(skill).toBe(designSkillFile())
  expect(skill).toContain('name: conciv-design')
  expect(skill).toContain('tools design target <image>')
  expect(skill).toContain('## Sources')
})

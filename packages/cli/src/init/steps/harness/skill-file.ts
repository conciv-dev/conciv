import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {concivEntrySkillMarkdown} from '@conciv/harness-init/claude/entry-skill'
import {captureFile} from '../../interrupt.js'
import type {InitStep} from '../../pipeline.js'

export function concivSkillFilePath(cwd: string): string {
  return join(cwd, 'conciv', 'skill.md')
}

function current(cwd: string): string | null {
  const file = concivSkillFilePath(cwd)
  if (!existsSync(file)) return null
  return readFileSync(file, 'utf8')
}

export function concivSkillFileStep(): InitStep {
  const content = concivEntrySkillMarkdown()
  const detect = async (ctx: {cwd: string}): Promise<'missing' | 'present'> =>
    current(ctx.cwd) === content ? 'present' : 'missing'
  return {
    id: 'skill',
    title: 'Write the conciv skill',
    running: 'Writing the conciv skill…',
    completed: 'Wrote conciv/skill.md',
    detect,
    plan: async (ctx) => ({
      summary: 'write the conciv code-mode skill to conciv/skill.md',
      wouldEdit: [concivSkillFilePath(ctx.cwd).slice(ctx.cwd.length + 1)],
    }),
    apply: async (ctx) => {
      const file = concivSkillFilePath(ctx.cwd)
      ctx.backup(captureFile(file))
      mkdirSync(join(ctx.cwd, 'conciv'), {recursive: true})
      writeFileSync(file, content)
      return {status: 'done'}
    },
    verify: async (ctx) => (await detect(ctx)) === 'present',
    manualCard: () => ({
      title: 'Write the conciv skill',
      body: 'The automatic write failed. Create conciv/skill.md in your project with this content:',
      snippet: content,
    }),
  }
}

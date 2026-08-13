import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {concivEntrySkillMarkdown} from '@conciv/harness-init/claude/entry-skill'
import {guardBackups} from '../../../src/init/interrupt.js'
import {runSteps} from '../../../src/init/pipeline.js'
import {concivSkillFilePath, concivSkillFileStep} from '../../../src/init/steps/harness/skill-file.js'
import {stepContext} from '../framework/step-context.js'

function project(): {cwd: string} & ReturnType<typeof stepContext> {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-skill-file-'))
  writeFileSync(join(cwd, 'package.json'), '{}')
  return {cwd, ...stepContext(cwd)}
}

describe('concivSkillFileStep', () => {
  it('writes conciv/skill.md with the code-mode entry skill content', async () => {
    const {cwd, settings, output} = project()
    const step = concivSkillFileStep()
    expect(step.id).toBe('skill')
    const ledger = await runSteps([step], settings, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    expect(readFileSync(concivSkillFilePath(cwd), 'utf8')).toBe(concivEntrySkillMarkdown())
  })

  it('reports already on the second run without rewriting the file', async () => {
    const {cwd, settings, output} = project()
    await runSteps([concivSkillFileStep()], settings, output)
    const written = readFileSync(concivSkillFilePath(cwd), 'utf8')
    const second = await runSteps([concivSkillFileStep()], settings, output)
    expect(second.map((entry) => entry.status)).toEqual(['already'])
    expect(readFileSync(concivSkillFilePath(cwd), 'utf8')).toBe(written)
  })

  it('rewrites a stale copy back to the current skill content', async () => {
    const {cwd, settings, output} = project()
    const path = concivSkillFilePath(cwd)
    mkdirSync(join(cwd, 'conciv'), {recursive: true})
    writeFileSync(path, 'an old copy from a previous conciv version\n')
    const ledger = await runSteps([concivSkillFileStep()], settings, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    expect(readFileSync(path, 'utf8')).toBe(concivEntrySkillMarkdown())
  })

  it('leaves no file behind when the run is interrupted right after the step applies', async () => {
    const {cwd} = project()
    const guard = guardBackups()
    const step = concivSkillFileStep()
    await step.apply({cwd, yes: true, dryRun: false, report: () => {}, note: () => {}, backup: guard.remember})
    expect(existsSync(concivSkillFilePath(cwd))).toBe(true)
    guard.restore()
    guard.release()
    expect(existsSync(concivSkillFilePath(cwd))).toBe(false)
  })

  it('offers the skill content itself as the manual card snippet', () => {
    const {ctx} = project()
    const card = concivSkillFileStep().manualCard(ctx)
    expect(card.snippet).toBe(concivEntrySkillMarkdown())
  })
})

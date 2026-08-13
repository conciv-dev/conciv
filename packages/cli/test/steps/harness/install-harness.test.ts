import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {HarnessInit, HarnessInitPlan} from '@conciv/protocol/harness-types'
import type {HarnessId} from '../../../src/init/harness-detect.js'
import {runSteps} from '../../../src/init/pipeline.js'
import {harnessInitStep, type HarnessInitIo} from '../../../src/init/steps/harness/install-harness.js'
import {stepContext} from '../framework/step-context.js'

const consent: HarnessId[] = ['claude']

function io(): HarnessInitIo {
  return {home: '/home', run: async () => ({code: 0, output: ''})}
}

function fakeInit(
  planOf: (cwd: string) => HarnessInitPlan,
  installed: (cwd: string) => boolean = () => false,
): HarnessInit<HarnessId> {
  return {
    harnessId: 'claude',
    detection: {bin: 'fake-harness', configDir: ['.fake']},
    init: 'files',
    title: 'Install the fake harness',
    running: 'Installing…',
    completed: 'Installed',
    planSummary: 'install the fake harness',
    plan: (project) => planOf(project.cwd),
    installed: (project) => installed(project.cwd),
    manualCard: (root) => ({title: 'Install manually', body: 'do it yourself', snippet: root}),
  }
}

describe('harnessInitStep: unresolved plan', () => {
  it('surfaces a manual card naming the resolution failure instead of silently writing zero files', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conciv-install-harness-'))
    const harness = stepContext(cwd)
    const init = fakeInit((projectCwd) => ({
      root: join(projectCwd, 'plugin-root'),
      files: [{path: join(projectCwd, 'plugin-root', 'entry.md'), contents: 'entry only'}],
      commands: [],
      unresolved: 'could not resolve @conciv/skills/package.json from the project or the harness-init dependency',
    }))
    const step = harnessInitStep(init, () => consent, io())

    const ledger = await runSteps([step], harness.settings, harness.output)

    expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
    expect(ledger[0]?.detail).toContain('could not resolve @conciv/skills/package.json')
    expect(existsSync(join(cwd, 'plugin-root', 'entry.md'))).toBe(false)
  })
})

describe('harnessInitStep: ownedDirs sweep', () => {
  it('plants an obsolete skill dir, re-runs install, and it is gone while base plugin files and kept skills are untouched', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conciv-install-harness-sweep-apply-'))
    const skillsDir = join(cwd, 'plugin-root', 'skills')
    const baseFile = join(cwd, 'plugin-root', '.mcp.json')
    mkdirSync(join(cwd, 'plugin-root'), {recursive: true})
    writeFileSync(baseFile, 'base')
    mkdirSync(join(skillsDir, 'obsolete'), {recursive: true})
    writeFileSync(join(skillsDir, 'obsolete', 'SKILL.md'), 'a removed pack skill')
    const init = fakeInit(
      (projectCwd) => ({
        root: join(projectCwd, 'plugin-root'),
        files: [
          {path: baseFile, contents: 'base'},
          {path: join(skillsDir, 'kept', 'SKILL.md'), contents: 'kept skill'},
        ],
        commands: [],
        ownedDirs: [skillsDir],
      }),
      () => existsSync(join(skillsDir, 'kept', 'SKILL.md')),
    )
    const harness = stepContext(cwd)
    const step = harnessInitStep(init, () => consent, io())

    const ledger = await runSteps([step], harness.settings, harness.output)

    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    expect(existsSync(join(skillsDir, 'obsolete', 'SKILL.md'))).toBe(false)
    expect(readFileSync(join(skillsDir, 'kept', 'SKILL.md'), 'utf8')).toBe('kept skill')
    expect(readFileSync(baseFile, 'utf8')).toBe('base')
  })
})

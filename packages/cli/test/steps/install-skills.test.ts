import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {InitContext} from '../../src/init/pipeline.js'
import {installSkillsStep, skillsPackName} from '../../src/init/steps/install-skills.js'

function project(manifest: object): InitContext {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-install-skills-'))
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(manifest))
  return {cwd, yes: true, dryRun: false, report: () => {}, note: () => {}, backup: () => {}}
}

describe('installSkillsStep', () => {
  it('detects present and missing from the real package.json', async () => {
    const step = installSkillsStep(async () => {}, 'pnpm')
    expect(step.id).toBe('install-skills')
    expect(await step.detect(project({devDependencies: {[skillsPackName]: '^0.0.19'}}))).toBe('present')
    expect(await step.detect(project({name: 'app'}))).toBe('missing')
  })

  it('adds the skills pack as a dev dependency and verifies', async () => {
    const ctx = project({name: 'app'})
    const step = installSkillsStep(async (name, opts) => {
      writeFileSync(join(opts.cwd, 'package.json'), JSON.stringify({name: 'app', devDependencies: {[name]: '0.0.19'}}))
    }, 'pnpm')
    expect(await step.apply(ctx)).toEqual({status: 'done'})
    expect(await step.verify(ctx)).toBe(true)
  })
})

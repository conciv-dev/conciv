import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {HarnessId} from '../../../src/init/harness-detect.js'
import {runSteps} from '../../../src/init/pipeline.js'
import {agentsMdStep, agentsSection} from '../../../src/init/steps/harness/agents-md.js'
import {readConsent, writeConsent} from '../../../src/init/steps/harness/consent.js'
import {stepContext} from '../framework/step-context.js'

const consented: HarnessId[] = ['claude', 'codex']

function project(): {cwd: string; ctx: ReturnType<typeof stepContext>['ctx']} {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-agents-'))
  return {cwd, ...stepContext(cwd)}
}

describe('agentsMdStep', () => {
  it('creates AGENTS.md with exactly the marked section on a fresh project', async () => {
    const {cwd, ctx} = project()
    const step = agentsMdStep(() => consented)
    expect(step.id).toBe('agents')
    const ledger = await runSteps([step], ctx)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(`${agentsSection(consented)}\n`)
    expect(existsSync(join(cwd, 'CLAUDE.md'))).toBe(false)
  })

  it('appends to an existing AGENTS.md keeping the surrounding text byte-identical', async () => {
    const {cwd, ctx} = project()
    const original = '# my project\n\nhand-written rules stay put.\n'
    writeFileSync(join(cwd, 'AGENTS.md'), original)
    const ledger = await runSteps([agentsMdStep(() => consented)], ctx)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    const written = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    expect(written.startsWith(original)).toBe(true)
    expect(written).toBe(`${original}\n${agentsSection(consented)}\n`)
  })

  it('replaces a stale marked section in place, preserving text outside the markers', async () => {
    const {cwd, ctx} = project()
    const before = '# intro\n\n'
    const after = '\n\n# outro\n'
    const stale = '<!-- conciv:start -->\nold copy from an older conciv\n<!-- conciv:end -->'
    writeFileSync(join(cwd, 'AGENTS.md'), `${before}${stale}${after}`)
    const ledger = await runSteps([agentsMdStep(() => consented)], ctx)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(`${before}${agentsSection(consented)}${after}`)
  })

  it('mirrors the section into CLAUDE.md only when that file already exists', async () => {
    const {cwd, ctx} = project()
    const claude = '# claude notes\n'
    writeFileSync(join(cwd, 'CLAUDE.md'), claude)
    const ledger = await runSteps([agentsMdStep(() => consented)], ctx)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    expect(readFileSync(join(cwd, 'CLAUDE.md'), 'utf8')).toBe(`${claude}\n${agentsSection(consented)}\n`)
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(`${agentsSection(consented)}\n`)
  })

  it('reports already on the second run without editing', async () => {
    const {cwd, ctx} = project()
    const first = await runSteps([agentsMdStep(() => consented)], ctx)
    expect(first.map((entry) => entry.status)).toEqual(['done'])
    const written = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    const second = await runSteps([agentsMdStep(() => consented)], ctx)
    expect(second.map((entry) => entry.status)).toEqual(['already'])
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(written)
  })

  it('offers the section text itself as the manual card snippet', () => {
    const {ctx} = project()
    const card = agentsMdStep(() => consented).manualCard(ctx)
    expect(card.snippet).toBe(agentsSection(consented))
  })
})

describe('consent', () => {
  it('round-trips the consented harness ids through .conciv/harnesses.json', () => {
    const {cwd} = project()
    writeConsent(cwd, consented)
    expect(readConsent(cwd)).toEqual(consented)
  })

  it('returns an empty list when the file is absent', () => {
    const {cwd} = project()
    expect(readConsent(cwd)).toEqual([])
  })

  it('returns an empty list when the file is malformed', () => {
    const {cwd} = project()
    writeConsent(cwd, consented)
    writeFileSync(join(cwd, '.conciv', 'harnesses.json'), '{"harnesses": "claude"')
    expect(readConsent(cwd)).toEqual([])
    writeFileSync(join(cwd, '.conciv', 'harnesses.json'), JSON.stringify({harnesses: ['claude', 'not-a-harness']}))
    expect(readConsent(cwd)).toEqual([])
  })
})

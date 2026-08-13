import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {HarnessId} from '../../../src/init/harness-detect.js'
import {runSteps} from '../../../src/init/pipeline.js'
import {agentsMdStep, agentsSection} from '../../../src/init/steps/harness/agents-md.js'
import {stepContext} from '../framework/step-context.js'

const consented: HarnessId[] = ['claude', 'codex']

function project(): {cwd: string} & ReturnType<typeof stepContext> {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-agents-'))
  return {cwd, ...stepContext(cwd)}
}

describe('agentsSection', () => {
  it('teaches the MCP discovery workflow instead of a static command list', () => {
    const section = agentsSection(consented)
    expect(section).toContain('await external_catalog({})')
    expect(section).toContain('connected via MCP')
    expect(section).toContain('conciv tools --help')
    expect(section).not.toContain('conciv tools page')
    expect(section).not.toContain('conciv tools react')
    expect(section).not.toContain('conciv tools server')
  })
})

describe('agentsMdStep', () => {
  it('creates AGENTS.md with exactly the marked section on a fresh project', async () => {
    const {cwd, settings, output} = project()
    const step = agentsMdStep(() => consented)
    expect(step.id).toBe('agents')
    const ledger = await runSteps([step], settings, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(`${agentsSection(consented)}\n`)
    expect(existsSync(join(cwd, 'CLAUDE.md'))).toBe(false)
  })

  it('appends to an existing AGENTS.md keeping the surrounding text byte-identical', async () => {
    const {cwd, settings, output} = project()
    const original = '# my project\n\nhand-written rules stay put.\n'
    writeFileSync(join(cwd, 'AGENTS.md'), original)
    const ledger = await runSteps([agentsMdStep(() => consented)], settings, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    const written = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    expect(written.startsWith(original)).toBe(true)
    expect(written).toBe(`${original}\n${agentsSection(consented)}\n`)
  })

  it('replaces a stale marked section in place, preserving text outside the markers', async () => {
    const {cwd, settings, output} = project()
    const before = '# intro\n\n'
    const after = '\n\n# outro\n'
    const stale = '<!-- conciv:start -->\nold copy from an older conciv\n<!-- conciv:end -->'
    writeFileSync(join(cwd, 'AGENTS.md'), `${before}${stale}${after}`)
    const ledger = await runSteps([agentsMdStep(() => consented)], settings, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(`${before}${agentsSection(consented)}${after}`)
  })

  it('mirrors the section into CLAUDE.md only when that file already exists', async () => {
    const {cwd, settings, output} = project()
    const claude = '# claude notes\n'
    writeFileSync(join(cwd, 'CLAUDE.md'), claude)
    const ledger = await runSteps([agentsMdStep(() => consented)], settings, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['done'])
    expect(readFileSync(join(cwd, 'CLAUDE.md'), 'utf8')).toBe(`${claude}\n${agentsSection(consented)}\n`)
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(`${agentsSection(consented)}\n`)
  })

  it('reports already on the second run without editing', async () => {
    const {cwd, settings, output} = project()
    const first = await runSteps([agentsMdStep(() => consented)], settings, output)
    expect(first.map((entry) => entry.status)).toEqual(['done'])
    const written = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    const second = await runSteps([agentsMdStep(() => consented)], settings, output)
    expect(second.map((entry) => entry.status)).toEqual(['already'])
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(written)
  })

  it('never eats the text under a stray start marker, however many times init runs', async () => {
    const {cwd, settings, output} = project()
    const strayed = ['# my project', '', '<!-- conciv:start -->', '', 'hand-written rules stay put.', ''].join('\n')
    writeFileSync(join(cwd, 'AGENTS.md'), strayed)
    const runOnce = async (): Promise<void> => {
      const ledger = await runSteps([agentsMdStep(() => consented)], settings, output)
      expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
      expect(ledger[0]?.cards[0]?.snippet).toBe(agentsSection(consented))
      expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(strayed)
    }
    await runOnce()
    await runOnce()
    await runOnce()
  })

  it('refuses a file carrying two conciv blocks instead of merging them into one span', async () => {
    const {cwd, settings, output} = project()
    const doubled = [agentsSection([]), '', 'user notes between the blocks', '', agentsSection(consented), ''].join(
      '\n',
    )
    writeFileSync(join(cwd, 'AGENTS.md'), doubled)
    const ledger = await runSteps([agentsMdStep(() => consented)], settings, output)
    expect(ledger.map((entry) => entry.status)).toEqual(['manual'])
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(doubled)
  })

  it('offers the section text itself as the manual card snippet', () => {
    const {ctx} = project()
    const card = agentsMdStep(() => consented).manualCard(ctx)
    expect(card.snippet).toBe(agentsSection(consented))
  })
})

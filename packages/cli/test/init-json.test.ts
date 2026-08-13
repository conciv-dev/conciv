import {existsSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {z} from 'zod'
import {writeOutcome} from '../src/envelope.js'
import {runInitCommand} from '../src/init.js'
import {fixture, recorderPrompts} from './support/init-fixture.js'
import {captureStdout, onlyDocument} from './support/stdout.js'

const written: string[] = []

beforeEach(() => {
  captureStdout(written)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const SuccessSchema = z.object({ok: z.literal(true), data: z.unknown()})
const FailureSchema = z.object({
  ok: z.literal(false),
  error: z.object({kind: z.enum(['user', 'unexpected']), message: z.string(), hint: z.string().optional()}),
})

type RunOptions = Parameters<typeof runInitCommand>[0]
type RunOverrides = Parameters<typeof runInitCommand>[1]

async function runJson(options: RunOptions, overrides: RunOverrides): Promise<{code: number; document: unknown}> {
  const code = await writeOutcome(runInitCommand(options, overrides))
  return {code, document: onlyDocument(written)}
}

function fakeTerminal(): {restore: () => void} {
  const streams = [process.stdin, process.stdout]
  const before = streams.map((stream) => stream.isTTY)
  const ci = process.env.CI
  for (const stream of streams) stream.isTTY = true
  delete process.env.CI
  return {
    restore: () => {
      streams.forEach((stream, index) => {
        stream.isTTY = before[index] ?? false
      })
      if (ci !== undefined) process.env.CI = ci
    },
  }
}

const throwingPrompts = {
  decide: async () => {
    throw new Error('decide must not run here')
  },
  adjust: async () => {
    throw new Error('adjust must not run here')
  },
}

describe('conciv init --json', () => {
  it('emits exactly one success envelope with the steps and next lines, and no clack frames', async () => {
    const run = fixture({recordOutput: false})
    const {code, document} = await runJson(
      {yes: true, dryRun: false, force: false, cwd: run.cwd, json: true},
      run.runtime,
    )
    expect(code).toBe(0)
    const parsed = SuccessSchema.parse(document)
    expect(parsed.data).toMatchObject({
      steps: [
        {id: 'install', status: 'done'},
        {id: 'install-skills', status: 'done'},
        {id: 'framework', status: 'done'},
        {id: 'skill', status: 'done'},
        {id: 'agents', status: 'done'},
        {id: 'claude', status: 'done'},
      ],
    })
    expect(JSON.stringify(parsed.data)).toContain('pnpm dev')
  })

  it('reports a cancelled run as a refusal with a reason and exit 1, never an empty step list', async () => {
    const run = fixture({recordOutput: false})
    const {code, document} = await runJson(
      {yes: false, dryRun: false, force: false, cwd: run.cwd, json: true},
      {
        ...run.runtime,
        interactive: () => true,
        prompts: {...recorderPrompts(run.events), decide: async () => 'cancelled'},
      },
    )
    expect(code).toBe(1)
    const parsed = FailureSchema.parse(document)
    expect(parsed.error.kind).toBe('user')
    expect(parsed.error.message).toContain('cancelled')
    expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
    expect(run.added).toEqual([])
  })

  it('reports a preflight refusal as a user error with the reason and exit 1', async () => {
    const run = fixture({recordOutput: false})
    writeFileSync(join(run.cwd, 'dirty.txt'), 'uncommitted')
    const {code, document} = await runJson(
      {yes: true, dryRun: false, force: false, cwd: run.cwd, json: true},
      run.runtime,
    )
    expect(code).toBe(1)
    expect(FailureSchema.parse(document).error.message).toContain('uncommitted changes')
    expect(run.added).toEqual([])
  })

  it('reports a dry run as a plan that changed nothing', async () => {
    const run = fixture({recordOutput: false})
    const {code, document} = await runJson(
      {yes: false, dryRun: true, force: false, cwd: run.cwd, json: true},
      {
        ...run.runtime,
        prompts: throwingPrompts,
      },
    )
    expect(code).toBe(0)
    expect(JSON.stringify(SuccessSchema.parse(document).data)).toContain('Install @conciv/it')
    expect(run.added).toEqual([])
    expect(run.spawned).toEqual([])
    expect(existsSync(join(run.cwd, '.conciv'))).toBe(false)
  })

  it('refuses to prompt under --json even on a real terminal', async () => {
    const run = fixture({recordOutput: false, injectInteractive: false})
    const terminal = fakeTerminal()
    const {code, document} = await runJson(
      {yes: false, dryRun: false, force: false, cwd: run.cwd, json: true},
      {
        ...run.runtime,
        prompts: throwingPrompts,
      },
    )
    terminal.restore()
    expect(code).toBe(1)
    expect(FailureSchema.parse(document).error.message).toContain('--yes')
  })
})

describe('conciv init human mode', () => {
  it('keeps clack output and writes no envelope when a run completes', async () => {
    const run = fixture()
    const code = await writeOutcome(
      runInitCommand({yes: true, dryRun: false, force: false, cwd: run.cwd, json: false}, run.runtime),
    )
    expect(code).toBe(0)
    expect(written).toEqual([])
    expect(run.events).toContain('intro:conciv init')
  })

  it('exits 1 when the human run is cancelled', async () => {
    const run = fixture()
    const code = await writeOutcome(
      runInitCommand(
        {yes: false, dryRun: false, force: false, cwd: run.cwd, json: false},
        {...run.runtime, prompts: {...recorderPrompts(run.events), decide: async () => 'cancelled'}},
      ),
    )
    expect(code).toBe(1)
    expect(written).toEqual([])
    expect(run.events).toContain('cancel:Nothing changed.')
  })
})

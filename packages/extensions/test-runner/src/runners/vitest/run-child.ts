import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {join, relative} from 'node:path'
import {writeSync} from 'node:fs'
import {z} from 'zod'
import {parseFailure, type Summary, type TestError, type TestRow, type TestCaseLike} from '../../shared/events.js'
import {type ChildMessage} from '../../runner/child-protocol.js'

type TestModuleLike = {
  moduleId: string
  ok: () => boolean
  diagnostic: () => {duration: number}
  children: {allTests: () => Iterable<TestCaseLike>}
}
type VitestLike = {
  standalone: () => Promise<void>
  globTestSpecifications: (filters?: string[]) => Promise<Array<{moduleId: string}>>
  runTestSpecifications: (specs: Array<{moduleId: string}>, allTestsRun?: boolean) => Promise<unknown>
  setGlobalTestNamePattern: (p: string | RegExp) => void
  resetGlobalTestNamePattern: () => void
  state: {getTestModules: () => Array<TestModuleLike>}
  close: () => Promise<void>
}
type TestCaseWithDiagnostic = TestCaseLike & {diagnostic?: () => {duration?: number} | undefined}

function send(msg: ChildMessage): void {
  writeSync(3, JSON.stringify(msg) + '\n')
}

function flagValues(argv: string[], name: string): string[] {
  return argv.flatMap((a, i) => {
    const v = argv[i + 1]
    return a === name && v !== undefined ? [v] : []
  })
}
function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

function toState(s: string): 'pass' | 'fail' | 'skip' {
  if (s === 'passed') return 'pass'
  if (s === 'failed') return 'fail'
  return 'skip'
}

function toRow(tc: TestCaseWithDiagnostic): TestRow {
  return {
    file: tc.module.moduleId,
    name: tc.name,
    state: toState(tc.result().state),
    durationMs: tc.diagnostic?.()?.duration ?? 0,
    error: parseFailure(tc) ?? undefined,
  }
}

type CreateVitest = (mode: string, opts: object, vite?: object) => Promise<VitestLike>
const VitestNodeModuleSchema = z.object({createVitest: z.custom<CreateVitest>((v) => typeof v === 'function')})

async function loadVitest(cwd: string, reporter: object): Promise<VitestLike> {
  const req = createRequire(join(cwd, 'noop.js'))

  const mod = await import(pathToFileURL(req.resolve('vitest/node')).href)
  const parsed = VitestNodeModuleSchema.safeParse(mod)
  if (!parsed.success) throw new Error('vitest/node did not expose createVitest')
  return parsed.data.createVitest('test', {watch: true, run: false, root: cwd, dir: cwd, reporters: [reporter]})
}

function collect(vitest: VitestLike): {summary: Summary; failures: TestError[]; tests: TestRow[]} {
  const cases = vitest.state.getTestModules().flatMap((mod) => [...mod.children.allTests()])
  const tests = cases.map(toRow)
  const passed = tests.filter((t) => t.state === 'pass').length
  const failed = tests.filter((t) => t.state === 'fail').length
  const skipped = tests.filter((t) => t.state === 'skip').length
  const durationMs = vitest.state.getTestModules().reduce((sum, mod) => sum + mod.diagnostic().duration, 0)
  const failures = tests.map((t) => t.error).filter((e): e is TestError => e !== undefined)
  return {summary: {passed, failed, skipped, durationMs}, failures, tests}
}

function makeReporter(getVitest: () => VitestLike): object {
  const counter = {runs: 0}
  return {
    onTestRunStart(specs: ReadonlyArray<{moduleId: string}>): void {
      counter.runs += 1
      send({type: 'run-start', runId: `r${counter.runs}`, files: specs.map((s) => s.moduleId)})
    },
    onTestCaseResult(tc: TestCaseWithDiagnostic): void {
      send({type: 'test', ...toRow(tc)})
    },
    onTestModuleEnd(mod: TestModuleLike): void {
      send({type: 'file-end', file: mod.moduleId, ok: mod.ok(), durationMs: mod.diagnostic().duration})
    },
    onTestRunEnd(): void {
      send({type: 'run-end', runId: `r${counter.runs}`, ...collect(getVitest())})
    },
  }
}

async function runList(vitest: VitestLike, cwd: string, failedOnly: boolean): Promise<void> {
  const specs = await vitest.globTestSpecifications()

  const files = specs.map((s) => ({file: s.moduleId, relPath: relative(cwd, s.moduleId)})).filter(() => !failedOnly)
  send({type: 'list', files})
}

async function runTests(vitest: VitestLike, argv: string[]): Promise<void> {
  const patterns = flagValues(argv, '--pattern')
  const testNamePattern = flagValue(argv, '--name')
  if (testNamePattern) vitest.setGlobalTestNamePattern(testNamePattern)
  const specs = await vitest.globTestSpecifications(patterns.length > 0 ? patterns : undefined)
  await vitest.runTestSpecifications(specs, patterns.length === 0)
  if (testNamePattern) vitest.resetGlobalTestNamePattern()
}

export async function runChild(): Promise<void> {
  const argv = process.argv.slice(2)
  const mode = flagValue(argv, '--mode') ?? 'run'
  const cwd = flagValue(argv, '--cwd') ?? process.cwd()
  const state: {vitest: VitestLike | null} = {vitest: null}
  const currentVitest = (): VitestLike => {
    if (!state.vitest) throw new Error('vitest not initialized')
    return state.vitest
  }
  try {
    const vitest = await loadVitest(cwd, makeReporter(currentVitest))
    state.vitest = vitest
    await vitest.standalone()
    await (mode === 'list' ? runList(vitest, cwd, argv.includes('--failed')) : runTests(vitest, argv))
    await vitest.close()
    process.exit(0)
  } catch (e) {
    send({type: 'error', reason: e instanceof Error ? e.message : String(e)})
    process.exit(1)
  }
}

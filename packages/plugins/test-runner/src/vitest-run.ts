import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {Effect, Schema} from 'effect'
import {Path} from 'effect/Path'
import {z} from 'zod'
import {countStates, parseFailure, type TestCaseLike, type TestError, type TestRow} from './events.js'
import {sendChildMessage, type ChildArgs} from './child-main.js'

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
  setGlobalTestNamePattern: (pattern: string | RegExp) => void
  close: () => Promise<void>
}
type TestCaseWithDiagnostic = TestCaseLike & {diagnostic?: () => {duration?: number} | undefined}

const VitestLoadFailed = Schema.TaggedStruct('TestRunner.VitestLoadFailed', {message: Schema.String})
type VitestLoadFailed = typeof VitestLoadFailed.Type & globalThis.Error
const makeVitestLoadFailed = (fields: Omit<typeof VitestLoadFailed.Type, '_tag'>): VitestLoadFailed =>
  Object.assign(new globalThis.Error(fields.message), VitestLoadFailed.make(fields), {
    name: 'TestRunner.VitestLoadFailed',
  })

const VitestRunFailed = Schema.TaggedStruct('TestRunner.VitestRunFailed', {message: Schema.String})
type VitestRunFailed = typeof VitestRunFailed.Type & globalThis.Error
const makeVitestRunFailed = (fields: Omit<typeof VitestRunFailed.Type, '_tag'>): VitestRunFailed =>
  Object.assign(new globalThis.Error(fields.message), VitestRunFailed.make(fields), {
    name: 'TestRunner.VitestRunFailed',
  })

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function toState(state: string): 'pass' | 'fail' | 'skip' {
  if (state === 'passed') return 'pass'
  if (state === 'failed') return 'fail'
  return 'skip'
}

function toRow(testCase: TestCaseWithDiagnostic): TestRow {
  return {
    id: testCase.id,
    file: testCase.module.moduleId,
    name: testCase.name,
    state: toState(testCase.result().state),
    durationMs: testCase.diagnostic?.()?.duration ?? 0,
    error: parseFailure(testCase) ?? undefined,
  }
}

type CreateVitest = (mode: string, options: object, vite?: object) => Promise<VitestLike>
const VitestNodeModuleSchema = z.object({createVitest: z.custom<CreateVitest>((value) => typeof value === 'function')})

function collect(modules: ReadonlyArray<TestModuleLike>) {
  const tests = modules.flatMap((module) => [...module.children.allTests()]).map(toRow)
  const durationMs = modules.reduce((sum, module) => sum + module.diagnostic().duration, 0)
  const failures = tests.map((test) => test.error).filter((error): error is TestError => error !== undefined)
  return {summary: {...countStates(tests), durationMs}, failures, tests}
}

const RUN_ID = 'r1'

const reporter = {
  onTestRunStart(specifications: ReadonlyArray<{moduleId: string}>): void {
    sendChildMessage({type: 'run-start', runId: RUN_ID, files: specifications.map((spec) => spec.moduleId)})
  },
  onTestCaseResult(testCase: TestCaseWithDiagnostic): void {
    sendChildMessage({type: 'test', ...toRow(testCase)})
  },
  onTestModuleEnd(module: TestModuleLike): void {
    sendChildMessage({
      type: 'file-end',
      file: module.moduleId,
      ok: module.ok(),
      durationMs: module.diagnostic().duration,
    })
  },
  onTestRunEnd(modules: ReadonlyArray<TestModuleLike>): void {
    sendChildMessage({type: 'run-end', runId: RUN_ID, ...collect(modules)})
  },
}

function loadVitest(cwd: string, path: Path) {
  const failed = (cause: unknown) => makeVitestLoadFailed({message: describeCause(cause)})
  return Effect.tryPromise({
    try: () => import(pathToFileURL(createRequire(path.join(cwd, 'noop.js')).resolve('vitest/node')).href),
    catch: failed,
  }).pipe(
    Effect.flatMap((module) => {
      const parsed = VitestNodeModuleSchema.safeParse(module)
      return parsed.success
        ? Effect.succeed(parsed.data)
        : Effect.fail(makeVitestLoadFailed({message: 'vitest/node did not expose createVitest'}))
    }),
    Effect.flatMap((vitestNode) =>
      Effect.tryPromise({
        try: () =>
          vitestNode.createVitest('test', {watch: true, run: false, root: cwd, dir: cwd, reporters: [reporter]}),
        catch: failed,
      }),
    ),
  )
}

function useVitest<A>(run: () => Promise<A>) {
  return Effect.tryPromise({try: run, catch: (cause) => makeVitestRunFailed({message: describeCause(cause)})})
}

function closeVitest(vitest: VitestLike) {
  return useVitest(() => vitest.close()).pipe(
    Effect.catch((error) =>
      Effect.logWarning('vitest did not close').pipe(
        Effect.annotateLogs({plugin: 'test-runner', cause: error.message}),
      ),
    ),
  )
}

export const runVitestChild = Effect.fn('TestRunner.vitestChild')(function* (args: ChildArgs) {
  const path = yield* Path
  const vitest = yield* Effect.acquireRelease(loadVitest(args.cwd, path), closeVitest)
  yield* useVitest(() => vitest.standalone())
  if (args.mode === 'list') {
    const specifications = yield* useVitest(() => vitest.globTestSpecifications())
    const files = args.failedOnly
      ? []
      : specifications.map((spec) => ({file: spec.moduleId, relPath: path.relative(args.cwd, spec.moduleId)}))
    sendChildMessage({type: 'list', files})
    return
  }
  if (args.name) vitest.setGlobalTestNamePattern(args.name)
  const patterns = args.patterns.length > 0 ? [...args.patterns] : undefined
  const specifications = yield* useVitest(() => vitest.globTestSpecifications(patterns))
  yield* useVitest(() => vitest.runTestSpecifications(specifications, patterns === undefined))
}, Effect.scoped)

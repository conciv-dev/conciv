import {Buffer} from 'node:buffer'
import {Effect, type FileSystem, type Path} from 'effect'
import {z} from 'zod'
import type {Context} from '@conciv/backend-plugin-api/effect/plugin'
import type * as Permission from '@conciv/protocol/schema/permission'
import * as Tool from '@conciv/protocol/schema/tool'
import type {EvlogError} from 'evlog'
import {BuildOutputSchema, makeBuild} from './build.js'
import {IosConfigSchema, NotConfiguredSchema, type IosRuntime, type NotConfigured} from './config.js'
import {iosErrors} from './errors/errors.js'
import {iosSystemPrompt} from './prompt.js'
import {Simctl} from './simctl.js'
import {capture, launch, readLogs} from './simulator.js'

const RunStageSchema = z.enum(['resolve-simulator', 'boot', 'artifact', 'install', 'launch'])

type RunStage = z.infer<typeof RunStageSchema>

const RunFailureSchema = z.object({
  ok: z.literal(false),
  udid: z.string(),
  bundleId: z.string(),
  stage: RunStageSchema,
  error: z.string(),
})

export type RunFailure = z.infer<typeof RunFailureSchema>

const RunSuccessSchema = z.object({
  ok: z.literal(true),
  udid: z.string(),
  bundleId: z.string(),
  pid: z.number().optional(),
})

type Run = z.infer<typeof RunSuccessSchema> | RunFailure

const RunOutputSchema = z.union([RunSuccessSchema, RunFailureSchema, NotConfiguredSchema])

const LogsSuccessSchema = z.object({ok: z.literal(true), lines: z.array(z.string())})

const LogsFailureSchema = z.object({ok: z.literal(false), lines: z.array(z.string()), error: z.string()})

type Logs = z.infer<typeof LogsSuccessSchema> | z.infer<typeof LogsFailureSchema>

const LogsOutputSchema = z.union([LogsSuccessSchema, LogsFailureSchema, NotConfiguredSchema])

const ScreenSizeSchema = z.object({ok: z.literal(true), width: z.number(), height: z.number()})

const ScreenshotOutputSchema = z.union([ScreenSizeSchema, NotConfiguredSchema])

type Screenshot = {output: z.infer<typeof ScreenshotOutputSchema>; content: Tool.FileContent[]}

type Services = Simctl.Interface | FileSystem.FileSystem | Path.Path

const NOT_CONFIGURED: NotConfigured = {ok: false, error: 'ios plugin not configured'}

const ASKING_RULES: Permission.Rule[] = ['ios_build', 'ios_run'].map((action) => ({
  action,
  resource: '*',
  effect: 'ask',
}))

const codeMode = {namespace: 'ios', codemode: true}

const direct = {namespace: 'ios', codemode: false}

const LogsInput = z.object({
  sinceSeconds: z.number().int().positive().max(3600).optional(),
  predicate: z.string().max(2000).optional(),
  limit: z.number().int().positive().max(5000).optional(),
})

const RUN_STAGES: Record<string, RunStage> = {
  [iosErrors.SIMULATOR_NOT_FOUND.code]: 'resolve-simulator',
  [iosErrors.BOOT_FAILED.code]: 'boot',
  [iosErrors.ARTIFACT_MISSING.code]: 'artifact',
  [iosErrors.INSTALL_FAILED.code]: 'install',
  [iosErrors.LAUNCH_FAILED.code]: 'launch',
}

const ToolFailureCodes: readonly string[] = [
  iosErrors.SPAWN_FAILED.code,
  iosErrors.OUTPUT_TOO_LARGE.code,
  iosErrors.BUILD_FILE_FAILED.code,
]

function toolFailure(error: EvlogError) {
  return Effect.fail(Tool.toolError({message: error.message, error: error.cause, metadata: {code: error.code}}))
}

function isToolFailure(error: EvlogError): boolean {
  return ToolFailureCodes.includes(error.code ?? '')
}

function failedUdid(error: EvlogError): string {
  const udid = error.internal?.udid
  return typeof udid === 'string' ? udid : ''
}

function runFailure(udid: string, bundleId: string, stage: RunStage, error: string): Run {
  return {ok: false, udid, bundleId, stage, error}
}

export function run(runtime: IosRuntime, input: {autoshow?: boolean | undefined}) {
  const bundleId = runtime.config.bundleId
  return launch(runtime, input).pipe(
    Effect.map(({udid, pid}): Run =>
      pid === undefined ? {ok: true, udid, bundleId} : {ok: true, udid, bundleId, pid},
    ),
    Effect.catch((error) => {
      const stage = RUN_STAGES[error.code ?? '']
      if (stage === undefined) return toolFailure(error)
      return Effect.succeed(runFailure(failedUdid(error), bundleId, stage, error.message))
    }),
  )
}

export function screenshot(runtime: IosRuntime) {
  const failed = (error: string): Screenshot => ({output: {ok: false, error}, content: []})
  return capture(runtime.config).pipe(
    Effect.map(({png, width, height}): Screenshot => {
      const image: Tool.FileContent = {
        type: 'file',
        uri: `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
        mime: 'image/png',
      }
      return {output: {ok: true, width, height}, content: [image]}
    }),
    Effect.catch((error) => {
      if (isToolFailure(error)) return toolFailure(error)
      if (error.code === iosErrors.SIMULATOR_NOT_FOUND.code)
        return Effect.succeed(failed('no matching simulator for ios_screenshot'))
      return Effect.succeed(failed(error.message))
    }),
  )
}

export function logs(
  runtime: IosRuntime,
  input: {sinceSeconds?: number | undefined; predicate?: string | undefined; limit?: number | undefined},
) {
  return readLogs(runtime.config, input).pipe(
    Effect.map((lines): Logs => ({ok: true, lines})),
    Effect.catch((error) => {
      if (isToolFailure(error)) return toolFailure(error)
      if (error.code === iosErrors.SIMULATOR_NOT_FOUND.code)
        return Effect.succeed<Logs>({ok: false, lines: [], error: 'no matching simulator for ios_logs'})
      return Effect.succeed<Logs>({ok: false, lines: [], error: error.message})
    }),
  )
}

function built(build: Effect.Success<typeof makeBuild>, runtime: IosRuntime, input: {clean?: boolean | undefined}) {
  return build(runtime, input).pipe(Effect.catch(toolFailure))
}

type Registration = Pick<Context, 'agent' | 'options' | 'permission' | 'servers' | 'session' | 'tool' | 'location'>

function builtinServerUrl(servers: Context['servers']): string | undefined {
  return servers
    .list()
    .map((id) => servers.get(id))
    .find((server) => server?.builtin)?.url
}

function confirmed(permission: Context['permission'], action: string, tool: Tool.Context) {
  return permission.assert({
    action,
    resources: ['*'],
    save: ['*'],
    metadata: {},
    sessionId: tool.sessionId,
    agent: tool.agent,
    source: {type: 'tool', messageId: tool.messageId, id: tool.id},
  })
}

export const register = Effect.fn('ios.tools.register')(function* (ctx: Registration) {
  const services = yield* Effect.context<Services>()
  const build = yield* makeBuild
  const parsed = IosConfigSchema.safeParse(ctx.options)
  if (!parsed.success) return yield* Effect.fail(iosErrors.INVALID_OPTIONS({detail: z.prettifyError(parsed.error)}))
  const config = parsed.data
  const configuredRuntime: IosRuntime | undefined = config && {
    config,
    cwd: ctx.location.directory,
    concivUrl: () => builtinServerUrl(ctx.servers),
  }
  const configured = <Output>(work: (runtime: IosRuntime) => Effect.Effect<Output, Tool.Error, Services>) =>
    configuredRuntime === undefined
      ? Effect.succeed({output: NOT_CONFIGURED})
      : work(configuredRuntime).pipe(
          Effect.map((output) => ({output})),
          Effect.provide(services),
        )
  const asking = <Output>(
    action: string,
    tool: Tool.Context,
    work: (runtime: IosRuntime) => Effect.Effect<Output, Tool.Error, Services>,
  ) => configured((runtime) => confirmed(ctx.permission, action, tool).pipe(Effect.flatMap(() => work(runtime))))

  yield* ctx.agent.transform((editor) => editor.list().forEach((agent) => agent.permissions.push(...ASKING_RULES)))
  yield* ctx.tool.transform((editor) => {
    editor.namespace({
      name: 'ios',
      description: 'The native iOS app on the simulator: build it, run it, capture its screen and read its logs.',
    })
    editor.add({
      name: 'build',
      description: 'Compile the native iOS project for the simulator and report build diagnostics.',
      input: z.object({clean: z.boolean().optional()}),
      output: BuildOutputSchema,
      options: direct,
      execute: Effect.fn('ios.tools.build')(function* (input, tool) {
        yield* Effect.annotateCurrentSpan({sessionId: tool.sessionId, plugin: 'ios'})
        return yield* asking('ios_build', tool, (runtime) => built(build, runtime, input))
      }),
    })
    editor.add({
      name: 'run',
      description: 'Boot the simulator, install the built app, and launch it so the change is visible.',
      input: z.object({autoshow: z.boolean().optional()}),
      output: RunOutputSchema,
      options: direct,
      execute: Effect.fn('ios.tools.run')(function* (input, tool) {
        yield* Effect.annotateCurrentSpan({sessionId: tool.sessionId, plugin: 'ios'})
        return yield* asking('ios_run', tool, (runtime) => run(runtime, input))
      }),
    })
    editor.add({
      name: 'screenshot',
      description: 'Capture the current simulator screen as a PNG image to verify what is on screen.',
      input: z.object({}),
      output: ScreenshotOutputSchema,
      options: codeMode,
      execute: Effect.fn('ios.tools.screenshot')(function* (_input, tool) {
        yield* Effect.annotateCurrentSpan({sessionId: tool.sessionId, plugin: 'ios'})
        return yield* configuredRuntime === undefined
          ? Effect.succeed({output: NOT_CONFIGURED})
          : screenshot(configuredRuntime).pipe(Effect.provide(services))
      }),
    })
    editor.add({
      name: 'logs',
      description: 'Return recent simulator log lines, optionally filtered by a log predicate.',
      input: LogsInput,
      output: LogsOutputSchema,
      options: codeMode,
      execute: Effect.fn('ios.tools.logs')(function* (input, tool) {
        yield* Effect.annotateCurrentSpan({sessionId: tool.sessionId, plugin: 'ios'})
        return yield* configured((runtime) => logs(runtime, input))
      }),
    })
  })
  if (configuredRuntime === undefined) return
  const rules = iosSystemPrompt(configuredRuntime.config, {cwd: configuredRuntime.cwd})
  yield* ctx.session.hook('context', (event) => Effect.sync(() => event.system.push({type: 'text', text: rules})))
})

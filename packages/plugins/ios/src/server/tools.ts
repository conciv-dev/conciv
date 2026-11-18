import {Effect} from 'effect'
import {z} from 'zod'
import type {Context} from '@conciv/plugin/effect/plugin'
import type {Permission} from '@conciv/plugin/schema/permission'
import type {Tool} from '@conciv/plugin/schema/tool'
import {build, BuildOutputSchema} from './build.js'
import {IosConfigSchema} from './config.js'
import {iosSystemPrompt} from './prompt.js'
import type {IosRuntime, NotConfigured} from './shared.js'
import * as Simctl from './simctl.js'
import {logs, LogsOutputSchema, run, RunOutputSchema, screenshot, ScreenshotOutputSchema} from './simulator.js'

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

export const register = Effect.fn('IosTools.register')(function* (ctx: Registration, simctl: Simctl.Interface) {
  const config = yield* Effect.sync(() => IosConfigSchema.parse(ctx.options))
  const configuredRuntime: IosRuntime | undefined = config && {
    config,
    cwd: ctx.location.directory,
    concivUrl: () => builtinServerUrl(ctx.servers),
  }
  const configured = <Output>(work: (runtime: IosRuntime) => Effect.Effect<Output, Tool.Error, Simctl.Interface>) =>
    configuredRuntime === undefined
      ? Effect.succeed({output: NOT_CONFIGURED})
      : work(configuredRuntime).pipe(
          Effect.map((output) => ({output})),
          Effect.provideService(Simctl.Service, simctl),
        )
  const asking = <Output>(
    action: string,
    tool: Tool.Context,
    work: (runtime: IosRuntime) => Effect.Effect<Output, Tool.Error, Simctl.Interface>,
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
      execute: (input, tool) => asking('ios_build', tool, (runtime) => build(runtime, input)),
    })
    editor.add({
      name: 'run',
      description: 'Boot the simulator, install the built app, and launch it so the change is visible.',
      input: z.object({autoshow: z.boolean().optional()}),
      output: RunOutputSchema,
      options: direct,
      execute: (input, tool) => asking('ios_run', tool, (runtime) => run(runtime, input)),
    })
    editor.add({
      name: 'screenshot',
      description: 'Capture the current simulator screen as a PNG image to verify what is on screen.',
      input: z.object({}),
      output: ScreenshotOutputSchema,
      options: codeMode,
      execute: () =>
        configuredRuntime === undefined
          ? Effect.succeed({output: NOT_CONFIGURED})
          : screenshot(configuredRuntime).pipe(Effect.provideService(Simctl.Service, simctl)),
    })
    editor.add({
      name: 'logs',
      description: 'Return recent simulator log lines, optionally filtered by a log predicate.',
      input: LogsInput,
      output: LogsOutputSchema,
      options: codeMode,
      execute: (input) => configured((runtime) => logs(runtime, input)),
    })
  })
  if (configuredRuntime === undefined) return
  const rules = iosSystemPrompt(configuredRuntime.config, {cwd: configuredRuntime.cwd})
  yield* ctx.session.hook('context', (event) => Effect.sync(() => event.system.push({type: 'text', text: rules})))
})

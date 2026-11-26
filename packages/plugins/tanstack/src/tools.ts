import {z} from 'zod'
import {omit} from 'es-toolkit'
import {Effect, FileSystem, Option, Path, Stream, SubscriptionRef} from 'effect'
import type {Context} from '@conciv/backend-plugin-api/effect/plugin'
import type {RpcClient} from '@conciv/backend-plugin-api/effect/rpc'
import type * as Bundler from '@conciv/protocol/schema/bundler'
import type {SystemError} from '@conciv/protocol/schema/rpc'
import * as Tool from '@conciv/protocol/schema/tool'
import {BrowserTabId, BrowserTabList} from '@conciv/protocol/schema/browser-tab'
import {Definition as PageDefinition} from '@conciv/plugin-page/rpc'
import {DiagnosticsService} from './diagnostics.js'
import {
  BundlerUnavailable,
  ManifestUnreadable,
  UNTRUSTED_NOTE,
  disconnectedAfterDispatch,
  disconnectedBeforeDispatch,
  dispatchFailed,
  pageFailed,
  passedThrough,
  tabUnavailable,
} from './failures.js'
import {Action, Definition, Operations, Reply, type Operation} from './rpc.js'
import {readRouteManifest} from './route-manifest.js'
import {ServerFnTraceService} from './serverfn-trace.js'
import {info} from './skill.js'

const options = {namespace: 'tanstack', codemode: true}

const pageOptions = {...options, permission: 'page'}

const JsonObject = z.record(z.string(), z.json())

const Targeted = z.object({tabId: BrowserTabId.optional()})

type Page = RpcClient<typeof PageDefinition, SystemError>

type PageError = Effect.Error<ReturnType<Page['operate']>>

const UNTRUSTED = {type: 'text' as const, text: UNTRUSTED_NOTE}

export type Options = {readonly bundlerWaitMs: number}

type Capabilities = Effect.Success<ReturnType<typeof capabilities>>

export const capabilities = Effect.fn('tanstack.capabilities')(function* (
  ctx: Pick<Context, 'event'>,
  directory: string,
  config: Options,
) {
  const diagnostics = yield* DiagnosticsService
  const serverFnTrace = yield* ServerFnTraceService
  const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>()
  const status = yield* SubscriptionRef.make<Bundler.Status | undefined>(undefined)
  yield* ctx.event.subscribe({types: ['bundler.status', 'bundler.diagnostic']}).pipe(
    Stream.runForEach((event) => {
      if (event.type === 'bundler.status') return SubscriptionRef.set(status, event.data.status)
      return Effect.andThen(diagnostics.observe(event.data.diagnostic), serverFnTrace.observe(event.data.diagnostic))
    }),
    Effect.forkScoped({startImmediately: true}),
  )
  const unavailable = BundlerUnavailable.make({message: 'bundler bridge unavailable'})
  const buildErrors = Effect.fn('tanstack.buildErrors')(function* () {
    const latest = yield* SubscriptionRef.changes(status).pipe(
      Stream.filter((value) => value !== undefined),
      Stream.runHead,
      Effect.timeoutOption(config.bundlerWaitMs),
    )
    if (Option.getOrUndefined(Option.flatten(latest)) !== 'connected') return yield* Effect.fail(unavailable)
    return [...(yield* diagnostics.list)]
  })
  const routeManifest = Effect.fn('tanstack.routeManifest')(function* () {
    return yield* readRouteManifest(directory).pipe(Effect.provideContext(platform))
  })
  return {buildErrors, routeManifest, serverFnTrace: serverFnTrace.read}
})

function bundlerFailure(failure: BundlerUnavailable) {
  return Tool.toolError({message: failure.message, metadata: {code: 'BUNDLER_UNAVAILABLE'}})
}

function manifestFailure(failure: ManifestUnreadable) {
  return Tool.toolError({message: failure.message, error: failure.cause, metadata: {code: 'MANIFEST_UNREADABLE'}})
}

function failedFailure(name: string, error: Extract<PageError, {readonly type: 'failed'}>): Tool.Error {
  if (error.data.code === 'tab_unavailable') return tabUnavailable()
  if (error.data.code === 'not_dispatched') return dispatchFailed(name, error)
  return passedThrough(error.data.code, error.message)
}

function pageFailure(name: string) {
  return (error: PageError): Tool.Error => {
    if (error.type === 'failed') return failedFailure(name, error)
    if (error.type !== 'tab_gone') return passedThrough(error.type, error.message)
    return error.data.dispatched ? disconnectedAfterDispatch() : disconnectedBeforeDispatch()
  }
}

function invalidResult(operation: Operation, error: z.ZodError) {
  return Tool.toolError({
    message: `The page returned an invalid result for tanstack.${operation.name}. Check that the engine and the page run compatible versions. Do not retry the same action to repair a protocol error; it may already have run.\n${z.prettifyError(error)}`,
  })
}

export const register = Effect.fn('TanstackTools.register')(function* (
  ctx: Pick<Context, 'tool' | 'skill' | 'rpc' | 'browserTabs'>,
  tanstack: Capabilities,
) {
  const page = ctx.rpc(PageDefinition)
  const execute = Effect.fn('TanstackTools.execute')(function* (
    operation: Operation,
    input: unknown,
    tool: Tool.Context,
  ) {
    const fields = yield* Effect.try({
      try: () => {
        const parsed = JsonObject.parse(input)
        Action.parse({...parsed, type: operation.name})
        return parsed
      },
      catch: (error) => Tool.toolError({message: `Invalid input for tanstack.${operation.name}.`, error}),
    })
    const value = yield* page
      .operate({
        sessionId: tool.sessionId,
        tabId: Targeted.parse(fields).tabId,
        name: `tanstack.${operation.name}`,
        input: omit(fields, ['tabId']),
        reading: !operation.mutating,
      })
      .pipe(Effect.mapError(pageFailure(operation.name)))
    const reply = Reply.safeParse(value)
    if (!reply.success) return yield* Effect.fail(invalidResult(operation, reply.error))
    if (reply.data.type === 'failure') return yield* Effect.fail(pageFailed(reply.data.code, reply.data.message))
    const output = operation.output.safeParse(reply.data.value)
    if (!output.success) return yield* Effect.fail(invalidResult(operation, output.error))
    return {output: output.data, content: [UNTRUSTED]}
  })

  yield* ctx.skill.transform((editor) => {
    editor.add(info)
  })
  yield* ctx.tool.transform((editor) => {
    editor.namespace({
      name: 'tanstack',
      description: "The running TanStack app's dev server: build errors, the route manifest and server-function calls.",
    })
    editor.add({
      name: 'build_errors',
      description:
        "Read recent build/transform errors from the running TanStack dev server (compile failures, bad imports). Use it when the app is broken or a change didn't take effect.",
      input: z.object({}),
      output: Definition.methods.buildErrors.output,
      options,
      execute: () =>
        tanstack.buildErrors().pipe(
          Effect.map((output) => ({output})),
          Effect.mapError(bundlerFailure),
        ),
    })
    editor.add({
      name: 'route_manifest',
      description:
        "Read the app's route manifest from routeTree.gen (all defined routes, paths, dynamic segments). Use it to see what routes exist, not just the matched ones.",
      input: z.object({}),
      output: Definition.methods.routeManifest.output,
      options,
      execute: () =>
        tanstack.routeManifest().pipe(
          Effect.map((output) => ({output})),
          Effect.mapError(manifestFailure),
        ),
    })
    editor.add({
      name: 'server_fn_trace',
      description:
        'Read recent TanStack server-function calls: which server fn ran (file + export), duration, and status. Use it to see server-side data fetching triggered by the app.',
      input: Definition.methods.serverFnTrace.input,
      output: Definition.methods.serverFnTrace.output,
      options,
      execute: ({count}) => tanstack.serverFnTrace(count).pipe(Effect.map((output) => ({output}))),
    })
    editor.add({
      name: 'list',
      description:
        "List this session's browser tabs and the tab the user focused last. A call without a tabId goes to that tab.",
      input: z.object({}),
      output: BrowserTabList,
      options: {...pageOptions, namespace: 'tanstack.tabs'},
      execute: (_input, tool) =>
        ctx.browserTabs.list(tool.sessionId).pipe(Effect.map((output) => ({output, content: [UNTRUSTED]}))),
    })
    Operations.forEach((operation) => {
      editor.add({
        name: operation.name,
        description: operation.description,
        input: operation.input,
        output: operation.output,
        options: pageOptions,
        execute: (input, tool) => execute(operation, input, tool),
      })
    })
  })
})

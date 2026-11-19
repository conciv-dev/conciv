export * as ServerTools from './server.js'

import type * as Bundler from '@conciv/plugin/schema/bundler'
import type {Context} from '@conciv/plugin/effect/plugin'
import {makeToolFailure} from '../../../ai/effect.js'
import {Effect, Schema} from 'effect'
import {BundlerSource, EditorSource} from '../../plugin/host.js'
import {Permission} from '../../permission.js'
import {Rpc} from '../../rpc.js'
import type {Tool} from '@conciv/plugin/schema/tool'

const unavailableMessage = 'no dev server is attached to conciv'

type ServerFailure =
  | {readonly kind: 'unavailable'; readonly message: string}
  | {readonly kind: 'failed'; readonly message: string; readonly error: unknown}

const bundlerUnavailable: ServerFailure = {kind: 'unavailable', message: unavailableMessage}

const bundlerFailure = (message: string, error: unknown): ServerFailure => ({kind: 'failed', message, error})

const Config = Schema.Struct({
  root: Schema.String,
  base: Schema.String,
  mode: Schema.String,
  aliases: Schema.Array(Schema.Struct({find: Schema.String, replacement: Schema.String})),
  plugins: Schema.Array(Schema.String),
})

const Urls = Schema.Struct({local: Schema.Array(Schema.String), network: Schema.Array(Schema.String)})

const ResolveInput = Schema.Struct({
  spec: Schema.String.annotate({description: 'the import specifier'}),
  importer: Schema.optionalKey(Schema.String).annotate({description: 'resolve as if imported from this file'}),
})

const Resolved = Schema.Struct({id: Schema.NullOr(Schema.String)})

const GraphInput = Schema.Struct({file: Schema.String.annotate({description: 'the file to inspect'})})

const ModuleNode = Schema.Struct({
  url: Schema.String,
  importers: Schema.Array(Schema.String),
  importedModules: Schema.Array(Schema.String),
})

const Graph = Schema.Array(ModuleNode)

const TransformInput = Schema.Struct({url: Schema.String.annotate({description: 'the module url'})})

const Transformed = Schema.Struct({code: Schema.NullOr(Schema.String)})

const RestartInput = Schema.Struct({
  force: Schema.optionalKey(Schema.Boolean).annotate({description: 'force a full restart'}),
})

const Restarted = Schema.Struct({ok: Schema.Literal(true)})

const Position = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))

const OpenInput = Schema.Struct({
  file: Schema.String.check(Schema.isMinLength(1)).annotate({description: 'the file to open'}),
  line: Schema.optionalKey(Position).annotate({description: 'line number to jump to'}),
  column: Schema.optionalKey(Position).annotate({description: 'column to jump to, used only with a line'}),
})

const Opened = Schema.Struct({ok: Schema.Literal(true), file: Schema.String, line: Schema.optionalKey(Schema.Number)})

const unavailable = {BUNDLER_UNAVAILABLE: Schema.Struct({})}

const errors = {...unavailable, BUNDLER_FAILED: Schema.Struct({message: Schema.String})}

const Definition = Rpc.define({
  id: 'server',
  methods: {
    config: {input: Schema.Undefined, output: Config, errors: unavailable},
    urls: {input: Schema.Undefined, output: Urls, errors: unavailable},
    resolve: {input: ResolveInput, output: Resolved, errors},
    graph: {input: GraphInput, output: Graph, errors},
    transform: {input: TransformInput, output: Transformed, errors},
    open: {input: OpenInput, output: Opened},
  },
  events: {},
})

const options: Tool.Options = {namespace: 'server', codemode: true}

const withBundler = <A>(
  bundler: Bundler.BundlerBridge | undefined,
  failure: string,
  read: (bundler: Bundler.BundlerBridge) => A | Promise<A>,
): Effect.Effect<A, ServerFailure> => {
  if (bundler === undefined) return Effect.fail(bundlerUnavailable)
  return Effect.tryPromise({
    try: async () => read(bundler),
    catch: (error) => bundlerFailure(failure, error),
  })
}

const toolAnswer = <A>(answer: Effect.Effect<A, ServerFailure>) =>
  answer.pipe(
    Effect.map((output) => ({output})),
    Effect.mapError((failure) =>
      failure.kind === 'unavailable'
        ? makeToolFailure({message: failure.message, metadata: {code: 'BUNDLER_UNAVAILABLE'}})
        : makeToolFailure({message: failure.message, error: failure.error}),
    ),
  )

const bundlerMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const readAnswer = <A, E>(answer: Effect.Effect<A, ServerFailure>, unavailable: (message: string) => E) =>
  answer.pipe(
    Effect.catch((failure) =>
      failure.kind === 'unavailable' ? Effect.fail(unavailable(failure.message)) : Effect.die(failure.error),
    ),
  )

const methodAnswer = <A, Unavailable, Failed>(
  answer: Effect.Effect<A, ServerFailure>,
  unavailable: (message: string) => Unavailable,
  failed: (message: string, bundler: string) => Failed,
): Effect.Effect<A, Unavailable | Failed> =>
  answer.pipe(
    Effect.catch((failure) =>
      Effect.fail(
        failure.kind === 'unavailable'
          ? unavailable(failure.message)
          : failed(failure.message, bundlerMessage(failure.error)),
      ),
    ),
  )

export const Plugin = {
  id: 'conciv.tool.server',
  effect: Effect.fn('ServerTools.Plugin')(function* (ctx: Context) {
    const bundler = yield* BundlerSource
    const openInEditor = yield* EditorSource
    const open = (input: typeof OpenInput.Type) =>
      Effect.sync((): typeof Opened.Type => {
        openInEditor(input.file, input.line, input.line === undefined ? undefined : input.column)
        return input.line === undefined ? {ok: true, file: input.file} : {ok: true, file: input.file, line: input.line}
      })
    const config = () => withBundler(bundler, 'Unable to read the dev server config', (current) => current.config())
    const urls = () => withBundler(bundler, 'Unable to read where the dev server listens', (current) => current.urls())
    const resolve = (input: typeof ResolveInput.Type) =>
      withBundler(bundler, `Unable to resolve ${input.spec}`, (current) => current.resolve(input.spec, input.importer))
    const graph = (input: typeof GraphInput.Type) =>
      withBundler(bundler, `Unable to read the module graph of ${input.file}`, (current) =>
        current.moduleGraph(input.file),
      )
    const transform = (input: typeof TransformInput.Type) =>
      withBundler(bundler, `Unable to transform ${input.url}`, (current) => current.transform(input.url))
    const restart = (input: typeof RestartInput.Type) =>
      withBundler(bundler, 'Unable to restart the dev server', async (current): Promise<typeof Restarted.Type> => {
        await current.restart(input.force ?? false)
        return {ok: true}
      })
    yield* ctx.tool
      .transform((editor) => {
        editor.namespace({
          name: 'server',
          description:
            'The dev server conciv is attached to: its resolved config, where it listens, how imports resolve, the module graph, the code it serves, and restarting it.',
        })
        editor.add({
          name: 'config',
          description: 'report the resolved root, base, aliases and plugins',
          input: Schema.Struct({}),
          output: Config,
          options,
          execute: () => toolAnswer(config()),
        })
        editor.add({
          name: 'urls',
          description: 'report where the dev server listens',
          input: Schema.Struct({}),
          output: Urls,
          options,
          execute: () => toolAnswer(urls()),
        })
        editor.add({
          name: 'resolve',
          description: 'report where an import specifier resolves',
          input: ResolveInput,
          output: Resolved,
          options,
          execute: (input) => toolAnswer(resolve(input)),
        })
        editor.add({
          name: 'graph',
          description: 'report the importers and imported modules of a file',
          input: GraphInput,
          output: Graph,
          options,
          execute: (input) => toolAnswer(graph(input)),
        })
        editor.add({
          name: 'transform',
          description: 'report the transformed code the dev server serves for a url',
          input: TransformInput,
          output: Transformed,
          options,
          execute: (input) => toolAnswer(transform(input)),
        })
        editor.add({
          name: 'restart',
          description: 'restart the dev server and re-bundle its dependencies',
          input: RestartInput,
          output: Restarted,
          options,
          execute: (input, context) =>
            Effect.gen(function* () {
              if (bundler === undefined) return yield* toolAnswer(restart(input))
              yield* ctx.permission.assert({
                action: 'server_restart',
                resources: [bundler.id],
                save: [bundler.id],
                fallback: 'ask',
                ...Permission.invocation(context),
              })
              return yield* toolAnswer(restart(input))
            }),
        })
        editor.add({
          name: 'open',
          description: "open a source file in the user's editor",
          input: OpenInput,
          output: Opened,
          options: {codemode: true},
          execute: (input) => open(input).pipe(Effect.map((output) => ({output}))),
        })
      })
      .pipe(Effect.orDie)
    yield* ctx.rpc
      .register(Definition, {
        config: (_input, {error}) => readAnswer(config(), (message) => error('BUNDLER_UNAVAILABLE', message, {})),
        urls: (_input, {error}) => readAnswer(urls(), (message) => error('BUNDLER_UNAVAILABLE', message, {})),
        resolve: (input, {error}) =>
          methodAnswer(
            resolve(input),
            (message) => error('BUNDLER_UNAVAILABLE', message, {}),
            (message, bundler) => error('BUNDLER_FAILED', message, {message: bundler}),
          ),
        graph: (input, {error}) =>
          methodAnswer(
            graph(input),
            (message) => error('BUNDLER_UNAVAILABLE', message, {}),
            (message, bundler) => error('BUNDLER_FAILED', message, {message: bundler}),
          ),
        transform: (input, {error}) =>
          methodAnswer(
            transform(input),
            (message) => error('BUNDLER_UNAVAILABLE', message, {}),
            (message, bundler) => error('BUNDLER_FAILED', message, {message: bundler}),
          ),
        open,
      })
      .pipe(Effect.orDie)
  }),
}

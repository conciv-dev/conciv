export * as ServerTools from './server.js'

import type {BundlerDomain} from '@conciv/plugin'
import type {Context} from '../../../plugin/effect/plugin.js'
import {makeToolFailure} from '../../../ai/effect.js'
import {Effect, Schema} from 'effect'
import {Rpc} from '../../rpc.js'
import type {Tool} from '../../../schema/tool.js'

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

const errors = {BUNDLER_UNAVAILABLE: Schema.Struct({})}

const Definition = Rpc.define({
  id: 'server',
  methods: {
    config: {input: Schema.Undefined, output: Config, errors},
    urls: {input: Schema.Undefined, output: Urls, errors},
  },
  events: {},
})

const options: Tool.Options = {namespace: 'server', codemode: true}

const withBundler = <A>(
  bundler: BundlerDomain | undefined,
  failure: string,
  read: (bundler: BundlerDomain) => A | Promise<A>,
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

const methodAnswer = <A, E>(answer: Effect.Effect<A, ServerFailure>, unavailable: (message: string) => E) =>
  answer.pipe(
    Effect.catch((failure) =>
      failure.kind === 'unavailable' ? Effect.fail(unavailable(failure.message)) : Effect.die(failure.error),
    ),
  )

export const Plugin = {
  id: 'conciv.tool.server',
  effect: Effect.fn('ServerTools.Plugin')(function* (ctx: Context) {
    const bundler = ctx.bundler
    const config = () => withBundler(bundler, 'Unable to read the dev server config', (current) => current.config())
    const urls = () => withBundler(bundler, 'Unable to read where the dev server listens', (current) => current.urls())
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
      })
      .pipe(Effect.orDie)
    yield* ctx.rpc
      .register(Definition, {
        config: (_input, {error}) => methodAnswer(config(), (message) => error('BUNDLER_UNAVAILABLE', message, {})),
        urls: (_input, {error}) => methodAnswer(urls(), (message) => error('BUNDLER_UNAVAILABLE', message, {})),
      })
      .pipe(Effect.orDie)
  }),
}

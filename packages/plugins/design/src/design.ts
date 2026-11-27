import {Effect, FileSystem, Path} from 'effect'
import {FetchHttpClient, HttpClient} from 'effect/http'
import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api/effect'
import type {KeyMap} from './com/key-map.js'
import {stampJsx} from './com/stamp.js'
import {designErrors} from './errors/errors.js'
import {registerDesignGet} from './tools/design-get.js'

const CatalogOptions = z.object({
  sources: z
    .array(z.enum(['vite-oxc']))
    .default(['vite-oxc'])
    .describe('the component sources to scan; none turns the scan, the section and the hints off'),
  hint: z.boolean().default(true).describe('design_get names the component a node probably is'),
  section: z.boolean().default(true).describe('design_get carries the component list'),
  appTierFull: z
    .number()
    .int()
    .nonnegative()
    .default(24)
    .describe('the most app components the list shows in full before it counts the rest'),
  hintConfidence: z.number().min(0).max(1).default(0.5).describe('the lowest score a hint is given at'),
  tokens: z
    .array(z.enum(['css']))
    .default(['css'])
    .describe('the token sources to read; none turns token drift off and keeps every paint row'),
  tokenFiles: z
    .array(z.string())
    .default([])
    .describe('the stylesheets to read tokens from, relative to the project root; none reads the kit exported ones'),
})

const Options = z.object({
  comparator: z.enum(['blazediff', 'pixelmatch']).default('blazediff'),
  color: z.enum(['ciede2000']).default('ciede2000'),
  pairer: z.enum(['vote']).default('vote'),
  ranker: z.enum(['impact']).default('impact'),
  text: z.enum(['paddle']).default('paddle'),
  segmenter: z.enum(['threshold']).default('threshold'),
  roles: z.enum(['rules']).default('rules'),
  blind: z.boolean().default(false),
  show: z
    .array(z.enum(['progress']))
    .default([])
    .describe('reply fields sent to the agent beyond the default; progress is computed and stored either way'),
  catalog: CatalogOptions.prefault({}),
  figma: z
    .object({
      token: z
        .string()
        .min(1)
        .optional()
        .describe('a Figma personal access token; without one design_get reads the document the agent passes'),
    })
    .prefault({}),
  hotkeys: z
    .object({overlay: z.string(), pick: z.string()})
    .default({overlay: 'Mod+Shift+X', pick: 'Mod+Shift+P'})
    .describe('the x-ray overlay keys: overlay on and off, pick on and off'),
})

function readOptions(input: unknown) {
  const parsed = Options.safeParse(input)
  if (parsed.success) return Effect.succeed(parsed.data)
  const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
  return Effect.fail(designErrors.INVALID_OPTIONS({detail}))
}

export default Plugin.define({
  id: 'design',
  effect: (ctx) =>
    Effect.gen(function* () {
      const options = yield* readOptions(ctx.options)
      const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>()
      const http = yield* HttpClient.HttpClient.pipe(Effect.provide(FetchHttpClient.layer))
      yield* registerDesignGet({ctx, token: options.figma.token, http})
      const keys: KeyMap = new Map()
      const root = ctx.location.directory
      yield* ctx.bundler.transform((editor) =>
        editor.add({transform: (code, id) => stampJsx({keys, root, code, id}).pipe(Effect.provide(services))}),
      )
    }),
})

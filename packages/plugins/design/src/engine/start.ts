import {Effect, FileSystem, Path} from 'effect'
import {z} from 'zod'
import type {Context} from '@conciv/backend-plugin-api/effect/plugin'
import type {KeyMap} from '../com/key-map.js'
import {stampJsx} from '../com/stamp.js'
import {designErrors} from '../errors/errors.js'
import {registerDesignGet} from '../tools/design-get.js'
import {declareFigmaKey} from '../sources/figma-key.js'

const ASSET_FOLDER = ['public', 'design']
const ASSET_CACHE = 'assets'

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

export const startDesign = Effect.fn('design.start')(function* (ctx: Context) {
  yield* readOptions(ctx.options)
  const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>()
  const path = yield* Path.Path
  yield* declareFigmaKey(ctx)
  yield* registerDesignGet({
    project: ctx.location.directory,
    ctx,
    folders: {
      folder: path.join(ctx.location.directory, ...ASSET_FOLDER),
      cache: path.join(ctx.storage.directory, ASSET_CACHE),
    },
  })
  const keys: KeyMap = new Map()
  const root = ctx.location.directory
  yield* ctx.bundler.transform((editor) =>
    editor.add({transform: (code, id) => stampJsx({keys, root, code, id}).pipe(Effect.provide(services))}),
  )
})

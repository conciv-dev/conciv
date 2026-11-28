import {Effect, FileSystem, Path, Result} from 'effect'
import type {HttpClient} from 'effect/http'
import type {EvlogError} from 'evlog'
import {chunk, groupBy, omit, uniq} from 'es-toolkit'
import {z} from 'zod'
import type {Box, Design, DesignNode} from '../model/design.js'
import type {Raster} from '../raster/raster.js'
import type {FigmaLink} from './figma-link.js'
import {figmaAnswer, figmaDownload, figmaJson, type FigmaKey} from './figma-rest.js'
import {designErrors} from '../errors/errors.js'
import {figmaSchemas} from './figma-schema.js'
import {flattenStack} from './fill-stack.js'

export type AssetFolders = {readonly folder: string; readonly cache: string}

type Layer = z.infer<typeof figmaSchemas.layer>
type Extension = 'png' | 'svg'
type Wanted = {id: string; ext: Extension; box: Box; stack: Layer[] | null; backdrop: string | null; scale: number}
type Files = Readonly<Record<string, Uint8Array>>
type Rest = {link: FigmaLink; key: FigmaKey}

type MaybeRest = {link: FigmaLink; key: FigmaKey | null}

const NO_URLS: Readonly<Record<string, string>> = {}
const VECTORS: readonly string[] = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'ELLIPSE', 'REGULAR_POLYGON']
const GROUPS: readonly string[] = ['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT']
const PUBLIC_PREFIX = '/design/'
const URI_TOO_LONG = 414
const EXPORTS: readonly Extension[] = ['png', 'svg']
const ImagesSchema = z.looseObject({images: z.record(z.string(), z.string().nullable())})
const FillsSchema = z.looseObject({meta: z.looseObject({images: z.record(z.string(), z.string())})})
const StackSchema = z.array(figmaSchemas.layer).catch([])
const WeightSchema = z.number().catch(0)
const SolidsSchema = z.array(z.looseObject({type: z.string(), color: z.string().optional()})).catch([])

export const figmaAssets = Effect.fn('design.figmaAssets')(function* (
  input: MaybeRest & AssetFolders & {design: Design; raster: Raster},
) {
  const {design} = input
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const wanted = assetNodes({node: design.root, scale: design.scale, backdrop: null})
  if (wanted.length === 0) return {design, line: 'assets: the frame has no image or vector nodes'}
  const cacheDirectory = path.join(input.cache, design.id)
  const cached = yield* fromCache({wanted, directory: cacheDirectory})
  const fetched = cached === null ? yield* fromRest({...input, wanted}) : null
  const exported: Files = cached ?? fetched?.files ?? {}
  const crops = cropped({
    design,
    raster: input.raster,
    wanted: wanted.filter((entry) => entry.stack === null && exported[entry.id] === undefined),
  })
  const files = wanted.flatMap((entry) => {
    const bytes = exported[entry.id]
    if (bytes !== undefined) return [{id: entry.id, file: fileName({id: entry.id, ext: entry.ext}), bytes}]
    const crop = crops[entry.id]
    return crop === undefined ? [] : [{id: entry.id, file: fileName({id: entry.id, ext: 'png'}), bytes: crop}]
  })
  yield* Effect.forEach([input.folder, cacheDirectory], (directory) =>
    fs.makeDirectory(directory, {recursive: true}).pipe(Effect.mapError((error) => unwritable(directory, error))),
  )
  yield* Effect.forEach(files, ({file, bytes}) =>
    Effect.forEach([input.folder, cacheDirectory], (directory) => {
      const target = path.join(directory, file)
      return fs.writeFile(target, bytes).pipe(Effect.mapError((error) => unwritable(target, error)))
    }),
  )
  const paths = Object.fromEntries(files.map(({id, file}) => [id, `${PUBLIC_PREFIX}${file}`]))
  const counts = Object.entries(groupBy(files, ({file}) => file.split('.').at(-1) ?? ''))
    .map(([ext, list]) => `${list.length} ${ext}`)
    .join(', ')
  const restCount = Object.keys(exported).length
  const from =
    cached === null ? `figma rest ${restCount}, crop from the frame render ${Object.keys(crops).length}` : 'cache'
  const why = fetched === null || fetched.reason === null ? '' : ` (rest: ${fetched.reason})`
  const notes =
    fetched === null || fetched.notes.length === 0 ? '' : `; flattened with notes: ${fetched.notes.join(', ')}`
  const layers = Object.fromEntries(
    wanted.flatMap((entry) => (entry.stack === null ? [] : [[entry.id, shownLayers(entry)] as const])),
  )
  return {
    design: {...design, root: withAssets({node: design.root, paths, layers})},
    line: `assets: ${counts} of ${wanted.length} nodes, from ${from}${why}${notes}`,
  }
})

function assetNodes(input: {node: DesignNode; scale: number; backdrop: string | null}): Wanted[] {
  const {node, scale} = input
  const backdrop = ownSolid(node) ?? input.backdrop
  const box = node.figma?.box ?? node.box
  const stack = readStack(node)
  const below = () => node.children.flatMap((child) => assetNodes({node: child, scale, backdrop}))
  if (stack !== null) return [{id: node.id, ext: 'png', box, stack, backdrop, scale}, ...below()]
  const kind = assetKind(node)
  if (kind === null) return below()
  return [{id: node.id, ext: kind, box: strokedBox({box, node}), stack: null, backdrop: null, scale}]
}

function readStack(node: DesignNode): Layer[] | null {
  const stack = StackSchema.parse(node.figma?.fields.stack ?? [])
  return stack.length > 0 && node.children.length > 0 ? stack : null
}

function strokedBox(input: {box: Box; node: DesignNode}): Box {
  const {box} = input
  const weight = WeightSchema.parse(input.node.figma?.fields.strokeWeight)
  return {
    x: box.w >= weight ? box.x : Math.floor(box.x + box.w / 2 - weight / 2),
    y: box.h >= weight ? box.y : Math.floor(box.y + box.h / 2 - weight / 2),
    w: Math.max(box.w, weight),
    h: Math.max(box.h, weight),
  }
}

function ownSolid(node: DesignNode): string | null {
  return SolidsSchema.parse(node.figma?.fields.fills ?? []).findLast((paint) => paint.type === 'solid')?.color ?? null
}

function shownLayers(entry: Wanted): Record<string, unknown>[] {
  const backdrop = entry.backdrop === null ? [] : [{type: 'backdrop', color: entry.backdrop}]
  const layers = (entry.stack ?? []).map((layer) => omit(layer, ['ref', 'handles', 'stops']))
  return [...backdrop, ...layers]
}

function assetKind(node: DesignNode): Extension | null {
  const facts = node.figma
  if (facts === undefined || node.implied === true) return null
  if (facts.fields.image === true) return 'png'
  if (VECTORS.includes(facts.type) || node.kind === 'image') return 'svg'
  if (GROUPS.includes(facts.type) && node.children.length > 0 && allVectors(node)) return 'svg'
  return null
}

function allVectors(node: DesignNode): boolean {
  return node.children.every((child) => {
    const facts = child.figma
    if (facts === undefined) return false
    if (VECTORS.includes(facts.type)) return true
    const painted = facts.fields.fills !== undefined || facts.fields.strokes !== undefined
    return GROUPS.includes(facts.type) && !painted && child.children.length > 0 && allVectors(child)
  })
}

function unwritable(file: string, error: {message: string}) {
  return designErrors.UNWRITABLE({file, detail: error.message})
}

function fileName(input: {id: string; ext: string}): string {
  return `${input.id.replaceAll(':', '-')}.${input.ext}`
}

const fromCache = Effect.fn('design.assetsFromCache')(function* (input: {wanted: Wanted[]; directory: string}) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const present = yield* fs.readDirectory(input.directory).pipe(Effect.orElseSucceed((): string[] => []))
  const found = input.wanted.map((entry) => ({
    id: entry.id,
    file: [fileName({id: entry.id, ext: entry.ext}), fileName({id: entry.id, ext: 'png'})].find((name) =>
      present.includes(name),
    ),
  }))
  if (found.some((entry) => entry.file === undefined)) return null
  const read = yield* Effect.forEach(found, ({id, file}) =>
    fs.readFile(path.join(input.directory, file ?? '')).pipe(
      Effect.map((bytes) => [id, bytes] as const),
      Effect.mapError((error) => designErrors.UNREADABLE({file: file ?? id, detail: error.message})),
    ),
  )
  const files: Files = Object.fromEntries(read)
  return files
})

const fromRest = Effect.fn('design.assetsFromRest')(function* (input: MaybeRest & {design: Design; wanted: Wanted[]}) {
  const {link, key} = input
  if (key === null) return {files: {}, reason: 'no Figma key', notes: []}
  const backgrounds = input.wanted.filter((entry) => entry.stack !== null)
  const urls = yield* Effect.all(
    [
      backgrounds.length === 0 ? Effect.succeed(NO_URLS) : fillUrls({link, key}),
      exportUrls({link, key, wanted: input.wanted, scale: input.design.scale}),
    ],
    {concurrency: 'unbounded'},
  ).pipe(Effect.result)
  if (Result.isFailure(urls)) return {files: {}, reason: urls.failure.message, notes: []}
  const [fills, exports] = urls.success
  const refs = uniq(backgrounds.flatMap((entry) => (entry.stack ?? []).flatMap((layer) => layer.ref ?? [])))
  const [images, files] = yield* Effect.all(
    [
      downloaded({
        link,
        urls: Object.fromEntries(refs.flatMap((ref) => (fills[ref] === undefined ? [] : [[ref, fills[ref]]]))),
      }),
      downloaded({link, urls: exports}),
    ],
    {concurrency: 'unbounded'},
  )
  const flattened = yield* Effect.forEach(backgrounds, (entry) =>
    flattenStack({
      id: entry.id,
      layers: entry.stack ?? [],
      images,
      box: {w: entry.box.w / entry.scale, h: entry.box.h / entry.scale},
      backdrop: entry.backdrop,
    }).pipe(
      Effect.map((done) => ({id: entry.id, png: done.png, notes: done.notes})),
      Effect.catch((error) =>
        Effect.succeed({id: entry.id, png: null, notes: [`${entry.id} not flattened: ${error.message}`]}),
      ),
    ),
  )
  const stacked = flattened.flatMap(({id, png}) => (png === null ? [] : [[id, png] as const]))
  const all: Files = {...files, ...Object.fromEntries(stacked)}
  return {files: all, reason: null, notes: flattened.flatMap(({notes}) => notes)}
})

const exportUrls = Effect.fn('design.assetExportUrls')(function* (input: Rest & {wanted: Wanted[]; scale: number}) {
  const answers = yield* Effect.forEach(
    EXPORTS,
    (ext) => {
      const ids = input.wanted.filter((entry) => entry.ext === ext && entry.stack === null).map((entry) => entry.id)
      if (ids.length === 0) return Effect.succeed(NO_URLS)
      const query = ext === 'png' ? `format=png&scale=${input.scale}` : 'format=svg'
      return imageUrls({link: input.link, key: input.key, ids, size: ids.length, query})
    },
    {concurrency: 'unbounded'},
  )
  const merged: Readonly<Record<string, string>> = Object.assign({}, ...answers)
  return merged
})

function imageUrls(
  input: Rest & {ids: string[]; size: number; query: string},
): Effect.Effect<Readonly<Record<string, string>>, EvlogError, HttpClient.HttpClient> {
  const {link, key, ids, size, query} = input
  return Effect.gen(function* () {
    const parts = yield* Effect.forEach(chunk(ids, size), (part) =>
      figmaAnswer({path: `/images/${link.fileKey}?ids=${encodeURIComponent(part.join(','))}&${query}`, key, link}).pipe(
        Effect.flatMap((response) =>
          response.status === URI_TOO_LONG
            ? Effect.succeed(null)
            : figmaJson({response, link}).pipe(Effect.flatMap((body) => parsedAnswer({schema: ImagesSchema, body}))),
        ),
      ),
    )
    if (parts.some((part) => part === null) && size > 1) return yield* imageUrls({...input, size: Math.ceil(size / 2)})
    const found = parts.flatMap((part) =>
      part === null
        ? []
        : Object.entries(part.images).flatMap(([id, url]) => (url === null ? [] : [[id, url] as const])),
    )
    return Object.fromEntries(found)
  })
}

function parsedAnswer<Schema extends z.ZodType>(input: {schema: Schema; body: unknown}) {
  const parsed = input.schema.safeParse(input.body)
  if (parsed.success) return Effect.succeed(parsed.data)
  return Effect.fail(designErrors.FIGMA_REQUEST({detail: 'Figma answered an unexpected shape'}))
}

const fillUrls = Effect.fn('design.assetFillUrls')(function* (input: Rest) {
  const response = yield* figmaAnswer({path: `/files/${input.link.fileKey}/images`, key: input.key, link: input.link})
  const parsed = yield* parsedAnswer({schema: FillsSchema, body: yield* figmaJson({response, link: input.link})})
  const urls: Readonly<Record<string, string>> = parsed.meta.images
  return urls
})

const downloaded = Effect.fn('design.assetDownloads')(function* (input: {
  link: FigmaLink
  urls: Readonly<Record<string, string>>
}) {
  const files = yield* Effect.forEach(
    Object.entries(input.urls),
    ([id, url]) =>
      figmaDownload({url, link: input.link}).pipe(
        Effect.map((bytes) => [[id, bytes] as const]),
        Effect.orElseSucceed(() => []),
      ),
    {concurrency: 'unbounded'},
  )
  const all: Files = Object.fromEntries(files.flat())
  return all
})

function cropped(input: {design: Design; raster: Raster; wanted: Wanted[]}): Files {
  const {design, raster, wanted} = input
  const ratio = raster.width / design.viewport.width
  return Object.fromEntries(
    wanted.flatMap(({id, box}) => {
      const at = {
        x: Math.round(box.x * ratio),
        y: Math.round(box.y * ratio),
        w: Math.round(box.w * ratio),
        h: Math.round(box.h * ratio),
      }
      if (at.w <= 0 || at.h <= 0) return []
      return [[id, raster.crop(at).png()] as const]
    }),
  )
}

function withAssets(input: {
  node: DesignNode
  paths: Readonly<Record<string, string>>
  layers: Readonly<Record<string, Record<string, unknown>[]>>
}): DesignNode {
  const {node, paths, layers} = input
  const asset = paths[node.id]
  const facts = node.figma
  const children = node.children.map((child) => withAssets({node: child, paths, layers}))
  if (facts === undefined) return {...node, children}
  const {stack, ...fields} = facts.fields
  if (asset === undefined) return {...node, children, figma: {...facts, fields}}
  const shown = layers[node.id]
  if (stack === undefined || shown === undefined)
    return {...node, children: [], figma: {...facts, fields: {...fields, asset}}}
  return {...node, children, figma: {...facts, fields: {...fields, asset, assetLayers: shown}}}
}

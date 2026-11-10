import type {Storage} from 'unstorage'
import {chunk, omit} from 'es-toolkit'
import {z} from 'zod'
import type {Design, DesignNode} from '../../shared/defs.js'
import {walk} from '../../shared/tree.js'
import {createRaster} from '../raster.js'
import {figmaSchemas} from './figma-schema.js'
import {flattenStack} from './fill-stack.js'

export async function figmaAssets(input: {
  design: Design
  image: Uint8Array
  fileKey: string | null
  token: string | null
  folder: Storage
  cache: Storage
}): Promise<{design: Design; line: string}> {
  const {design, folder} = input
  const wanted = assetNodes({root: design.root, scale: design.scale})
  if (wanted.length === 0) return {design, line: 'assets: the frame has no image or vector nodes'}
  const cached = await fromCache({...input, wanted})
  const fetched = cached === null ? await fromRest({...input, wanted}) : null
  const exported = cached ?? fetched?.files ?? new Map<string, Uint8Array>()
  const crops = cropped({
    design,
    image: input.image,
    wanted: wanted.filter((entry) => entry.stack === null && !exported.has(entry.id)),
  })
  const files = new Map(
    wanted.flatMap((entry) => {
      const bytes = exported.get(entry.id)
      if (bytes !== undefined) return [[entry.id, {file: fileOf({id: entry.id, ext: entry.ext}), bytes}] as const]
      const crop = crops.get(entry.id)
      return crop === undefined ? [] : [[entry.id, {file: fileOf({id: entry.id, ext: 'png'}), bytes: crop}] as const]
    }),
  )
  for (const {file, bytes} of files.values()) {
    await folder.setItemRaw(file, bytes)
    await input.cache.setItemRaw(`${design.id}/${file}`, bytes)
  }
  const paths = new Map([...files].map(([id, {file}]) => [id, `${PUBLIC_PREFIX}${file}`]))
  const counts = Object.entries(Object.groupBy([...files.values()], ({file}) => file.split('.').at(-1) ?? ''))
    .map(([ext, list]) => `${list?.length ?? 0} ${ext}`)
    .join(', ')
  const from = cached === null ? `figma rest ${exported.size}, crop from the frame render ${crops.size}` : 'cache'
  const why = fetched === null || fetched.reason === null ? '' : ` (rest: ${fetched.reason})`
  const notes =
    fetched === null || fetched.notes.length === 0 ? '' : `; flattened with notes: ${fetched.notes.join(', ')}`
  const layers = new Map(
    wanted.flatMap((entry) => (entry.stack === null ? [] : [[entry.id, shownLayers(entry)] as const])),
  )
  return {
    design: {...design, root: withAssets({node: design.root, paths, layers})},
    line: `assets: ${counts} of ${wanted.length} nodes, from ${from}${why}${notes}`,
  }
}

type Layer = z.infer<typeof figmaSchemas.layer>
type Wanted = {
  id: string
  ext: 'png' | 'svg'
  box: DesignNode['box']
  stack: Layer[] | null
  backdrop: string | null
  scale: number
}

const VECTORS = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'ELLIPSE', 'REGULAR_POLYGON'])
const GROUPS = new Set(['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT'])
const FIGMA_API = 'https://api.figma.com/v1'
const PUBLIC_PREFIX = '/design/'
const URI_TOO_LONG = 414
const ImagesSchema = z.looseObject({images: z.record(z.string(), z.string().nullable())})
const FillsSchema = z.looseObject({meta: z.looseObject({images: z.record(z.string(), z.string())})})
const StackSchema = z.array(figmaSchemas.layer).catch([])
const SolidsSchema = z.array(z.looseObject({type: z.string(), color: z.string().optional()})).catch([])

function assetNodes(input: {root: DesignNode; scale: number}): Wanted[] {
  const {root, scale} = input
  const covered = new Set<string>()
  const parents = new Map([...walk(root)].map(({node, parent}) => [node.id, parent]))
  return [...walk(root)].flatMap(({node, parent}): Wanted[] => {
    if (parent !== null && covered.has(parent.id)) {
      covered.add(node.id)
      return []
    }
    const box = node.figma?.box ?? node.box
    const stack = stackOf(node)
    if (stack !== null) return [{id: node.id, ext: 'png', box, stack, backdrop: backdropOf({node, parents}), scale}]
    const kind = assetKind(node)
    if (kind === null) return []
    covered.add(node.id)
    return [{id: node.id, ext: kind, box, stack: null, backdrop: null, scale}]
  })
}

function stackOf(node: DesignNode): Layer[] | null {
  const stack = StackSchema.parse(node.figma?.fields.stack ?? [])
  return stack.length > 0 && node.children.length > 0 ? stack : null
}

function backdropOf(input: {node: DesignNode; parents: Map<string, DesignNode | null>}): string | null {
  const {node, parents} = input
  const solid = SolidsSchema.parse(node.figma?.fields.fills ?? []).findLast((paint) => paint.type === 'solid')
  if (solid?.color !== undefined) return solid.color
  const parent = parents.get(node.id) ?? null
  return parent === null ? null : backdropOf({node: parent, parents})
}

function shownLayers(entry: Wanted): Record<string, unknown>[] {
  const backdrop = entry.backdrop === null ? [] : [{type: 'backdrop', color: entry.backdrop}]
  const layers = (entry.stack ?? []).map((layer) => omit(layer, ['ref', 'handles', 'stops']))
  return [...backdrop, ...layers]
}

function assetKind(node: DesignNode): Wanted['ext'] | null {
  const facts = node.figma
  if (facts === undefined || node.implied === true) return null
  if (facts.fields.image === true) return 'png'
  if (VECTORS.has(facts.type) || node.kind === 'image') return 'svg'
  if (GROUPS.has(facts.type) && node.children.length > 0 && allVectors(node)) return 'svg'
  return null
}

function allVectors(node: DesignNode): boolean {
  return node.children.every((child) => {
    const type = child.figma?.type ?? ''
    if (VECTORS.has(type)) return true
    return GROUPS.has(type) && child.children.length > 0 && allVectors(child)
  })
}

function fileOf(input: {id: string; ext: string}): string {
  return `${input.id.replaceAll(':', '-')}.${input.ext}`
}

async function fromCache(input: {
  design: Design
  wanted: Wanted[]
  cache: Storage
}): Promise<Map<string, Uint8Array> | null> {
  const {design, wanted, cache} = input
  const keys = new Set(await cache.getKeys(design.id))
  const read = await Promise.all(
    wanted.map(async (entry) => {
      const file = [fileOf({id: entry.id, ext: entry.ext}), fileOf({id: entry.id, ext: 'png'})].find((name) =>
        keys.has(`${design.id}:${name}`),
      )
      if (file === undefined) return null
      const bytes: unknown = await cache.getItemRaw(`${design.id}/${file}`)
      return bytes instanceof Uint8Array ? ([entry.id, bytes] as const) : null
    }),
  )
  if (read.some((entry) => entry === null)) return null
  return new Map(read.flatMap((entry) => (entry === null ? [] : [entry])))
}

async function fromRest(input: {
  design: Design
  wanted: Wanted[]
  fileKey: string | null
  token: string | null
}): Promise<{files: Map<string, Uint8Array>; reason: string | null; notes: string[]}> {
  const {fileKey, token, design} = input
  if (fileKey === null) return {files: new Map(), reason: 'the design has no Figma file key', notes: []}
  if (token === null) return {files: new Map(), reason: 'no FIGMA_API_KEY', notes: []}
  const headers = {'X-Figma-Token': token}
  const backgrounds = input.wanted.filter((entry) => entry.stack !== null)
  const fills = backgrounds.length === 0 ? new Map<string, string>() : await fillUrls({fileKey, headers})
  if (typeof fills === 'string') return {files: new Map(), reason: fills, notes: []}
  const refs = new Set(backgrounds.flatMap((entry) => (entry.stack ?? []).flatMap((layer) => layer.ref ?? [])))
  const images = await downloaded(
    new Map(
      [...refs].flatMap((ref) => {
        const url = fills.get(ref)
        return url === undefined ? [] : [[ref, url] as const]
      }),
    ),
  )
  const flattened = await Promise.all(
    backgrounds.map(async (entry) => {
      const box = {w: entry.box.w / entry.scale, h: entry.box.h / entry.scale}
      const done = await flattenStack({
        id: entry.id,
        layers: entry.stack ?? [],
        images,
        box,
        backdrop: entry.backdrop,
      }).catch((cause: unknown) => ({png: null, notes: [`${entry.id} not flattened: ${String(cause)}`]}))
      return {id: entry.id, ...done}
    }),
  )
  const urls = new Map<string, string>()
  for (const ext of ['png', 'svg'] as const) {
    const ids = input.wanted.filter((entry) => entry.ext === ext && entry.stack === null).map((entry) => entry.id)
    if (ids.length === 0) continue
    const query = ext === 'png' ? `format=png&scale=${design.scale}` : 'format=svg'
    const answer = await imageUrls({fileKey, ids, size: ids.length, query, headers})
    if (typeof answer === 'string') return {files: new Map(), reason: answer, notes: []}
    for (const [id, url] of answer) urls.set(id, url)
  }
  const files = await downloaded(urls)
  const stacked = flattened.flatMap(({id, png}) => (png === null ? [] : [[id, png] as const]))
  return {files: new Map([...files, ...stacked]), reason: null, notes: flattened.flatMap(({notes}) => notes)}
}

async function downloaded(urls: Map<string, string>): Promise<Map<string, Uint8Array>> {
  const files = await Promise.all(
    [...urls].map(async ([key, url]) => {
      const response = await fetch(url).catch(() => null)
      if (response === null || !response.ok) return null
      return [key, new Uint8Array(await response.arrayBuffer())] as const
    }),
  )
  return new Map(files.flatMap((entry) => (entry === null ? [] : [entry])))
}

async function imageUrls(input: {
  fileKey: string
  ids: string[]
  size: number
  query: string
  headers: Record<string, string>
}): Promise<Map<string, string> | string> {
  const {fileKey, ids, size, query, headers} = input
  const found = new Map<string, string>()
  for (const part of chunk(ids, size)) {
    const url = `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(part.join(','))}&${query}`
    const response = await fetch(url, {headers}).catch((cause: unknown) => String(cause))
    if (typeof response === 'string') return `Figma did not answer: ${response}`
    if (response.status === URI_TOO_LONG && size > 1) return imageUrls({...input, size: Math.ceil(size / 2)})
    if (!response.ok) return `Figma answered ${response.status}`
    const parsed = ImagesSchema.safeParse(await response.json())
    if (!parsed.success) return 'Figma answered an unexpected shape'
    for (const [id, link] of Object.entries(parsed.data.images)) if (link !== null) found.set(id, link)
  }
  return found
}

async function fillUrls(input: {
  fileKey: string
  headers: Record<string, string>
}): Promise<Map<string, string> | string> {
  const response = await fetch(`${FIGMA_API}/files/${input.fileKey}/images`, {headers: input.headers}).catch(
    (cause: unknown) => String(cause),
  )
  if (typeof response === 'string') return `Figma did not answer: ${response}`
  if (!response.ok) return `Figma answered ${response.status} for the image fills`
  const parsed = FillsSchema.safeParse(await response.json())
  if (!parsed.success) return 'Figma answered the image fills in an unexpected shape'
  return new Map(Object.entries(parsed.data.meta.images))
}

function cropped(input: {design: Design; image: Uint8Array; wanted: Wanted[]}): Map<string, Uint8Array> {
  const {design, wanted} = input
  if (wanted.length === 0) return new Map()
  const raster = createRaster(input.image)
  const ratio = raster.width / design.viewport.width
  return new Map(
    wanted.flatMap(({id, box}) => {
      const at = {x: box.x * ratio, y: box.y * ratio, w: box.w * ratio, h: box.h * ratio}
      const rounded = {x: Math.round(at.x), y: Math.round(at.y), w: Math.round(at.w), h: Math.round(at.h)}
      if (rounded.w <= 0 || rounded.h <= 0) return []
      return [[id, raster.crop({box: rounded}).png()] as const]
    }),
  )
}

function withAssets(input: {
  node: DesignNode
  paths: Map<string, string>
  layers: Map<string, Record<string, unknown>[]>
}): DesignNode {
  const {node, paths, layers} = input
  const asset = paths.get(node.id)
  const facts = node.figma
  const children = node.children.map((child) => withAssets({node: child, paths, layers}))
  if (facts === undefined) return {...node, children}
  const {stack, ...fields} = facts.fields
  if (asset === undefined) return {...node, children, figma: {...facts, fields}}
  const shown = layers.get(node.id)
  if (stack === undefined || shown === undefined)
    return {...node, children: [], figma: {...facts, fields: {...fields, asset}}}
  return {...node, children, figma: {...facts, fields: {...fields, asset, assetLayers: shown}}}
}

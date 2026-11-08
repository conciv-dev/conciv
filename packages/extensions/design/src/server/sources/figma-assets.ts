import type {Storage} from 'unstorage'
import {chunk} from 'es-toolkit'
import {z} from 'zod'
import type {Design, DesignNode} from '../../shared/defs.js'
import {walk} from '../../shared/tree.js'
import {createRaster} from '../raster.js'

export async function figmaAssets(input: {
  design: Design
  image: Uint8Array
  fileKey: string | null
  token: string | null
  folder: Storage
  cache: Storage
}): Promise<{design: Design; line: string}> {
  const {design, folder} = input
  const wanted = assetNodes(design.root)
  if (wanted.length === 0) return {design, line: 'assets: the frame has no image or vector nodes'}
  const cached = await fromCache({...input, wanted})
  const fetched = cached === null ? await fromRest({...input, wanted}) : null
  const exported = cached ?? fetched?.files ?? new Map<string, Uint8Array>()
  const crops = cropped({design, image: input.image, wanted: wanted.filter((entry) => !exported.has(entry.id))})
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
  return {
    design: {...design, root: withAssets({node: design.root, paths})},
    line: `assets: ${counts} of ${wanted.length} nodes, from ${from}${why}`,
  }
}

type Wanted = {id: string; ext: 'png' | 'svg'; box: DesignNode['box']}

const VECTORS = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'ELLIPSE', 'REGULAR_POLYGON'])
const GROUPS = new Set(['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT'])
const FIGMA_API = 'https://api.figma.com/v1'
const PUBLIC_PREFIX = '/design/'
const URI_TOO_LONG = 414
const ImagesSchema = z.looseObject({images: z.record(z.string(), z.string().nullable())})

function assetNodes(root: DesignNode): Wanted[] {
  const covered = new Set<string>()
  return [...walk(root)].flatMap(({node, parent}) => {
    if (parent !== null && covered.has(parent.id)) {
      covered.add(node.id)
      return []
    }
    const kind = assetKind(node)
    if (kind === null) return []
    covered.add(node.id)
    return [{id: node.id, ext: kind, box: node.figma?.box ?? node.box}]
  })
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
}): Promise<{files: Map<string, Uint8Array>; reason: string | null}> {
  const {fileKey, token, design} = input
  if (fileKey === null) return {files: new Map(), reason: 'the design has no Figma file key'}
  if (token === null) return {files: new Map(), reason: 'no FIGMA_API_KEY'}
  const headers = {'X-Figma-Token': token}
  const urls = new Map<string, string>()
  for (const ext of ['png', 'svg'] as const) {
    const ids = input.wanted.filter((entry) => entry.ext === ext).map((entry) => entry.id)
    if (ids.length === 0) continue
    const query = ext === 'png' ? `format=png&scale=${design.scale}` : 'format=svg'
    const answer = await imageUrls({fileKey, ids, size: ids.length, query, headers})
    if (typeof answer === 'string') return {files: new Map(), reason: answer}
    for (const [id, url] of answer) urls.set(id, url)
  }
  const files = await Promise.all(
    [...urls].map(async ([id, url]) => {
      const response = await fetch(url).catch(() => null)
      if (response === null || !response.ok) return null
      return [id, new Uint8Array(await response.arrayBuffer())] as const
    }),
  )
  return {files: new Map(files.flatMap((entry) => (entry === null ? [] : [entry]))), reason: null}
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

function withAssets(input: {node: DesignNode; paths: Map<string, string>}): DesignNode {
  const {node, paths} = input
  const asset = paths.get(node.id)
  const facts = node.figma
  if (asset === undefined || facts === undefined)
    return {...node, children: node.children.map((child) => withAssets({node: child, paths}))}
  return {...node, children: [], figma: {...facts, fields: {...facts.fields, asset}}}
}

import {extname, resolve, sep} from 'node:path'
import type {Storage} from 'unstorage'
import {ORPCError, os} from '@orpc/server'
import {groupBy, keyBy, partition} from 'es-toolkit'
import {Hono} from 'hono'
import {z} from 'zod'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import {DESIGN_VERDICTS, type Box, type DesignNode, type DesignRuntime, type IdNode} from '../shared/defs.js'
import type {Store} from '../shared/store.js'
import {PREVIEW_ROUTE, type Catalog, type Ranked} from '../shared/catalog-defs.js'
import type {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import {importLine} from './catalog/import-line.js'

export function createXrayRoutes(input: {
  runtime: DesignRuntime
  catalog: Catalog
  hotkeys: DesignConfig['hotkeys']
  takumiDir: string
}) {
  const {runtime, catalog} = input
  return {
    router: makeXrayRouter({runtime, catalog, hotkeys: input.hotkeys}),
    app: makeXrayApp({runtime, takumiDir: resolve(input.takumiDir)}),
  }
}

type DesignConfig = z.output<typeof designConfig>

const NonEmptySchema = z.string().min(1)

const LABEL_AUTHOR = 'x-ray'

const WASM_EXTENSION = '.wasm'

const WASM_HEADERS = {'content-type': 'application/wasm', 'cache-control': 'public, max-age=31536000, immutable'}

const PNG_HEADERS = {'content-type': 'image/png'}

const ImageKindSchema = z.enum(['live', 'diff'])

const RoundQuerySchema = z.object({id: NonEmptySchema, round: z.number().int().positive()})

const TEXT_GAP = ' / '

const DO_NOT_USE = 'do-not-use'

const xrayOs = os.$context<RpcContext>()

function makeXrayRouter(input: {runtime: DesignRuntime; catalog: Catalog; hotkeys: DesignConfig['hotkeys']}) {
  const {store} = input.runtime
  const {catalog} = input
  return xrayOs.router({
    xray: {
      hotkeys: xrayOs.handler(() => input.hotkeys),
      targets: xrayOs.handler(() => store.list()),
      current: xrayOs.input(z.object({session: z.string()})).handler(({input: query}) => store.current(query.session)),
      rounds: xrayOs.input(z.object({id: NonEmptySchema})).handler(async ({input: query}) => {
        const target = (await store.list()).find((record) => record.id === query.id)
        if (target === undefined) throw new ORPCError('NOT_FOUND', {message: `no design with id ${query.id}`})
        const [rounds, mapping, unsettled] = await Promise.all([
          store.rounds(target.id),
          store.mapping(target.id),
          store.unsettledCount(target.id),
        ])
        return {target, rounds, mapping, unsettled}
      }),
      label: xrayOs
        .input(
          z.object({
            target: NonEmptySchema,
            round: z.number().int().positive(),
            node: NonEmptySchema,
            id: NonEmptySchema,
            verdict: z.enum(DESIGN_VERDICTS),
          }),
        )
        .handler(({input: label}) => store.writeLabel({...label, by: LABEL_AUTHOR})),
      components: xrayOs.input(RoundQuerySchema).handler(async ({input: query}) => {
        const [ranked, related, design, looks] = await Promise.all([
          store.sources(query.id).then((live) => catalog.list({live, hidden: true})),
          store.relation(query),
          store.design(query.id),
          store.looks(query.id),
        ])
        const names = keyBy(looks, (look) => look.node)
        const designNodes = keyBy(
          [...walk(design.root)].map(({node}) => node),
          (node) => node.id,
        )
        const rendered = groupBy([...related], ([, component]) => component.id)
        const parts = ranked.map((component) =>
          partOf({
            component,
            renders: (rendered[component.id] ?? []).map(([node]) => ({
              node,
              name: names[node]?.name ?? node,
              text: textsUnder(designNodes[node]).join(TEXT_GAP),
            })),
          }),
        )
        const [hidden, components] = partition(parts, (part) => part.flag === DO_NOT_USE)
        return {components, hidden}
      }),
      flag: xrayOs
        .input(z.object({id: NonEmptySchema, flag: z.enum(['prefer', DO_NOT_USE, 'clear'])}))
        .handler(async ({input: flagged}) => {
          const component = (await catalog.list({hidden: true})).find((entry) => entry.id === flagged.id)
          if (component === undefined) throw new ORPCError('NOT_FOUND', {message: `no component with id ${flagged.id}`})
          await catalog.flag(component.names[0] ?? '', flagged.flag)
        }),
      layers: xrayOs.input(RoundQuerySchema).handler(async ({input: query}) => {
        const target = (await store.list()).find((record) => record.id === query.id)
        if (target === undefined) throw new ORPCError('NOT_FOUND', {message: `no design with id ${query.id}`})
        const [ids, looks, related] = await Promise.all([
          store.ids(query),
          store.looks(target.id),
          store.relation(query),
        ])
        if (ids === null) return null
        const byNode = new Map(looks.map((look) => [look.node, look]))
        const components = new Map(
          [...related].map(([node, component]) => [
            node,
            {
              id: component.id,
              name: component.names[0] ?? '',
              specifier: component.specifier,
              tier: component.tier,
              imports: component.imports,
            },
          ]),
        )
        return {
          round: query.round,
          width: target.width,
          root: layerOf({node: ids.root, byNode, components, scale: target.scale}),
        }
      }),
    },
  })
}

function makeXrayApp(input: {runtime: DesignRuntime; takumiDir: string}) {
  const {runtime, takumiDir} = input
  const {store, files} = runtime
  return new Hono()
    .get('/takumi/:asset', (c) => {
      const path = resolve(takumiDir, c.req.param('asset'))
      if (!inside({dir: takumiDir, path}) || extname(path) !== WASM_EXTENSION) return c.text('not found', 404)
      return wasmResponse({storage: files, key: path})
    })
    .get('/files/target/:id', async (c) => pngResponse(await store.image({id: c.req.param('id')})))
    .get('/files/:kind/:id/:round', async (c) => {
      const kind = ImageKindSchema.safeParse(c.req.param('kind'))
      const round = Number(c.req.param('round'))
      if (!kind.success || !Number.isInteger(round)) return c.text('not found', 404)
      return pngResponse(await store.image({id: c.req.param('id'), round, kind: kind.data}))
    })
}

function layerOf(input: {
  node: IdNode
  byNode: Map<string, Look>
  components: Map<string, LayerComponent>
  scale: number
}): Layer {
  const {node, byNode, components, scale} = input
  return {
    id: node.id,
    dom: node.dom,
    cssom: node.cssom,
    src: node.src,
    fom: node.fom.map((entry) => {
      const look = byNode.get(entry.nodeId) ?? null
      const box = look === null ? null : {x: look.x * scale, y: look.y * scale, w: look.w * scale, h: look.h * scale}
      return {...entry, box, look, component: components.get(entry.nodeId) ?? null}
    }),
    children: node.children.map((child) => layerOf({...input, node: child})),
  }
}

type Look = Awaited<ReturnType<Store['looks']>>[number]

type LayerComponent = Pick<Ranked, 'id' | 'specifier' | 'tier' | 'imports'> & {name: string}

type Layer = Omit<IdNode, 'fom' | 'children'> & {
  fom: (IdNode['fom'][number] & {box: Box | null; look: Look | null; component: LayerComponent | null})[]
  children: Layer[]
}

function partOf(input: {component: Ranked; renders: {node: string; name: string; text: string}[]}) {
  const {component, renders} = input
  return {
    id: component.id,
    name: component.names[0] ?? '',
    tier: component.tier,
    imports: component.imports,
    onPage: component.onPage,
    flag: component.flag,
    specifier: component.specifier,
    importLine: importLine(component),
    sentence: component.sentence,
    props: component.props,
    usage: component.usage,
    renders,
    preview: component.previewError === null ? `${PREVIEW_ROUTE}${component.id}` : null,
    previewError: component.previewError,
  }
}

function textsUnder(node: DesignNode | undefined): string[] {
  if (node === undefined) return []
  return [...walk(node)].flatMap(({node: each}) => (each.kind === 'text' && each.text !== '' ? [each.text] : []))
}

function pngResponse(image: Uint8Array | null): Response {
  if (image === null) return new Response('not found', {status: 404})
  return new Response(new Uint8Array(image), {headers: PNG_HEADERS})
}

function inside(input: {dir: string; path: string}): boolean {
  return input.path.startsWith(`${input.dir}${sep}`)
}

async function readRaw(input: {storage: Storage; key: string}): Promise<Uint8Array<ArrayBuffer> | null> {
  const raw: unknown = await input.storage.getItemRaw(input.key).catch(() => null)
  return raw instanceof Uint8Array ? new Uint8Array(raw) : null
}

async function wasmResponse(input: {storage: Storage; key: string}): Promise<Response> {
  const body = await readRaw(input)
  if (body === null) return new Response('not found', {status: 404})
  return new Response(body, {headers: WASM_HEADERS})
}

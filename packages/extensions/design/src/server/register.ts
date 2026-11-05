import {isAbsolute, relative} from 'node:path'
import type {Storage} from 'unstorage'
import {toolError} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {
  DESIGN_ERRORS,
  DESIGN_GUIDE,
  NO_TARGET_MESSAGE,
  type Measurer,
  type Registrar,
  type Store,
  type TargetAdapter,
  type TargetInput,
  type TargetResult,
} from '../shared/defs.js'
import {walk} from '../shared/tree.js'

export function createRegistrar(input: {
  adapters: TargetAdapter[]
  store: Store
  measurer: Measurer
  project: Storage
  cwd: string
}): Registrar {
  const {store} = input
  return {
    register: (request) => registerTarget({...request, ...input}),
    current: async (session) => {
      const record = await store.current(session)
      if (record !== null) return record
      throw toolError('no-target', {message: NO_TARGET_MESSAGE})
    },
  }
}

async function registerTarget(request: {
  input: TargetInput
  session: string
  page: ServerToolPageAccess
  adapters: TargetAdapter[]
  store: Store
  measurer: Measurer
  project: Storage
  cwd: string
}): Promise<TargetResult> {
  const {input, session, page, cwd, project} = request
  const requested = input.figma ?? input.image
  if (requested === undefined) throw toolError('image-unreadable', {message: 'pass image or figma'})
  const ref = projectRef({ref: requested, cwd})
  const adapter = request.adapters.find((candidate) => candidate.accepts({ref, project}))
  if (adapter === undefined) throw toolError('image-unreadable', {message: DESIGN_ERRORS['image-unreadable'].message})
  const pictured = input.image ?? (adapter.kind === 'image' ? requested : undefined)
  const image = pictured === undefined ? undefined : await readPng({ref: projectRef({ref: pictured, cwd}), project})
  const attachments = {
    ...(input.document === undefined ? {} : {document: input.document}),
    ...(image === undefined ? {} : {image}),
  }
  const label = pngBase64(ref) === null ? ref : BASE64_REF
  const loaded = await adapter.load({ref: label, scale: input.scale ?? 1, project, attachments})
  const route = await routeLabel({route: input.route, page, measurer: request.measurer})
  const record = await request.store.put({
    design: loaded.design,
    image: loaded.image,
    session,
    ...(route === undefined ? {} : {route}),
    ...(input.name === undefined ? {} : {name: input.name}),
  })
  return {
    id: record.id,
    ...(record.route === undefined ? {} : {route: record.route}),
    width: record.width,
    height: record.height,
    scale: record.scale,
    text: {
      runs: [...walk({root: loaded.design.root})].filter(({node}) => node.kind === 'text').length,
      ...(loaded.warnings.length === 0 ? {} : {error: loaded.warnings.join('; ')}),
    },
    next: DESIGN_GUIDE,
  }
}

async function routeLabel(input: {
  route: string | undefined
  page: ServerToolPageAccess
  measurer: Measurer
}): Promise<string | undefined> {
  if (input.route !== undefined) return input.route
  return input.measurer.route(input.page).then(pathnameIn, () => undefined)
}

function pathnameIn(route: string): string {
  return route.split('?')[0] ?? route
}

function projectRef(input: {ref: string; cwd: string}): string {
  return isAbsolute(input.ref) ? relative(input.cwd, input.ref) : input.ref
}

async function readPng(input: {ref: string; project: Storage}): Promise<Uint8Array<ArrayBuffer>> {
  const raw: unknown = await input.project.getItemRaw(input.ref).catch(() => null)
  if (raw instanceof Uint8Array) return new Uint8Array(raw)
  const bytes = pngBase64(input.ref)
  if (bytes !== null) return bytes
  throw toolError('image-unreadable', {
    message: `image is neither a PNG file nor PNG base64: ${input.ref.slice(0, 80)}`,
  })
}

function pngBase64(ref: string): Uint8Array<ArrayBuffer> | null {
  const bytes = new Uint8Array(Buffer.from(ref, 'base64'))
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) ? bytes : null
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const BASE64_REF = 'base64'

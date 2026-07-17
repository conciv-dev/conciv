import type {MultimodalContent} from '@tanstack/ai-client'

type ContentParts = Exclude<MultimodalContent['content'], string>

export type AttachmentContentPart = ContentParts[number]

export type PendingAttachmentStatus =
  | {type: 'running'; reason: 'uploading'; progress: number}
  | {type: 'requires-action'; reason: 'composer-send'}
  | {type: 'incomplete'; reason: 'error' | 'upload-paused'; message?: string}

export type CompleteAttachmentStatus = {type: 'complete'}

export type BaseAttachment = {
  id: string
  type: 'image' | 'document' | 'file' | (string & {})
  name: string
  contentType?: string
}

export type PendingAttachment = BaseAttachment & {
  file: File
  status: PendingAttachmentStatus
}

export type CompleteAttachment = BaseAttachment & {
  file?: File
  content: AttachmentContentPart[]
  status: CompleteAttachmentStatus
}

export type Attachment = PendingAttachment | CompleteAttachment

export type AttachmentAdapter = {
  accept: string
  add: (state: {file: File}) => Promise<PendingAttachment> | AsyncGenerator<PendingAttachment, void>
  remove: (attachment: Attachment) => Promise<void>
  send: (attachment: PendingAttachment) => Promise<CompleteAttachment>
}

let fallbackId = 0

function attachmentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  fallbackId += 1
  return `attachment-${fallbackId}`
}

function bytesToBase64(bytes: Uint8Array): string {
  const nodeBuffer = (
    globalThis as {
      Buffer?: {from: (value: Uint8Array) => {toString: (encoding: string) => string}}
    }
  ).Buffer
  if (nodeBuffer) return nodeBuffer.from(bytes).toString('base64')
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
}

function fileMimeType(file: Pick<File, 'name' | 'type'>): string {
  if (file.type) return file.type
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
  return IMAGE_MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

export async function fileToDataSource(file: File): Promise<{type: 'data'; value: string; mimeType: string}> {
  const mimeType = fileMimeType(file)
  if (typeof FileReader === 'undefined') {
    const value = bytesToBase64(new Uint8Array(await file.arrayBuffer()))
    return {type: 'data', value, mimeType}
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error(`Could not read ${file.name}`))
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error(`Could not read ${file.name}`)))
    reader.readAsDataURL(file)
  })
  const separator = dataUrl.indexOf(',')
  if (separator < 0) throw new Error(`Could not read ${file.name}`)
  return {type: 'data', value: dataUrl.slice(separator + 1), mimeType}
}

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.tif',
  '.tiff',
  '.webp',
])

function matchesWildcard(value: string, mimeType: string, extension: string): boolean {
  if (!value.endsWith('/*')) return false
  if (mimeType) return mimeType.startsWith(value.slice(0, -1))
  return value === 'image/*' && IMAGE_EXTENSIONS.has(extension)
}

export function fileMatchesAccept(file: Pick<File, 'name' | 'type'>, accept: string): boolean {
  if (accept.trim() === '*') return true
  const extensionIndex = file.name.lastIndexOf('.')
  const extension = extensionIndex < 0 ? '' : file.name.slice(extensionIndex).toLowerCase()
  const mimeType = file.type.toLowerCase()
  return accept
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .some((value) => {
      if (value.startsWith('.')) return value === extension
      if (matchesWildcard(value, mimeType, extension)) return true
      return value === mimeType
    })
}

const MAX_IMAGE_BYTES = 20_971_520
const UNSUPPORTED_IMAGE_MIME = new Set(['image/svg+xml'])

function imageFileError(file: Pick<File, 'name' | 'size'>, mimeType: string): string | undefined {
  if (UNSUPPORTED_IMAGE_MIME.has(mimeType)) return `${file.name}: SVG images are not supported`
  if (file.size > MAX_IMAGE_BYTES) return `${file.name} exceeds the 20MB image limit`
  return undefined
}

function pendingImageStatus(error: string | undefined): PendingAttachmentStatus {
  if (error) return {type: 'incomplete', reason: 'error', message: error}
  return {type: 'requires-action', reason: 'composer-send'}
}

export function createSimpleImageAttachmentAdapter(): AttachmentAdapter {
  return {
    accept: 'image/*',
    add: async ({file}) => {
      const contentType = fileMimeType(file)
      return {
        id: attachmentId(),
        type: 'image',
        name: file.name,
        contentType,
        file,
        status: pendingImageStatus(imageFileError(file, contentType)),
      }
    },
    remove: async () => {},
    send: async (attachment) => {
      const error = imageFileError(attachment.file, fileMimeType(attachment.file))
      if (error) throw new Error(error)
      return {
        ...attachment,
        status: {type: 'complete'},
        content: [{type: 'image', source: await fileToDataSource(attachment.file)}],
      }
    },
  }
}

export function isCompleteAttachment(attachment: Attachment): attachment is CompleteAttachment {
  return attachment.status.type === 'complete'
}

const MAX_TEXT_BYTES = 1_048_576

function pendingTextStatus(file: Pick<File, 'name' | 'size'>): PendingAttachmentStatus {
  if (file.size > MAX_TEXT_BYTES)
    return {type: 'incomplete', reason: 'error', message: `${file.name} exceeds the 1MB text limit`}
  return {type: 'requires-action', reason: 'composer-send'}
}

export function createTextAttachmentAdapter(): AttachmentAdapter {
  return {
    accept: 'text/plain,.txt,.md,.log',
    add: async ({file}) => ({
      id: attachmentId(),
      type: 'document',
      name: file.name,
      contentType: file.type || 'text/plain',
      file,
      status: pendingTextStatus(file),
    }),
    remove: async () => {},
    send: async (attachment) => ({
      ...attachment,
      status: {type: 'complete'},
      content: [{type: 'text', content: `Attachment ${attachment.name}:\n${await attachment.file.text()}`}],
    }),
  }
}

export function composeAttachmentAdapters(adapters: readonly AttachmentAdapter[]): AttachmentAdapter {
  const owners = new Map<string, AttachmentAdapter>()
  const adapterFor = (file: Pick<File, 'name' | 'type'>): AttachmentAdapter => {
    const match = adapters.find((adapter) => fileMatchesAccept(file, adapter.accept))
    if (!match) throw new Error(`No attachment adapter accepts ${file.name}`)
    return match
  }
  const track = (adapter: AttachmentAdapter, pending: PendingAttachment): PendingAttachment => {
    owners.set(pending.id, adapter)
    return pending
  }
  async function* trackAll(
    adapter: AttachmentAdapter,
    pendings: AsyncGenerator<PendingAttachment, void>,
  ): AsyncGenerator<PendingAttachment, void> {
    for await (const pending of pendings) yield track(adapter, pending)
  }
  return {
    accept: adapters.map((adapter) => adapter.accept).join(','),
    add: (state) => {
      const adapter = adapterFor(state.file)
      const result = adapter.add(state)
      if (result instanceof Promise) return result.then((pending) => track(adapter, pending))
      return trackAll(adapter, result)
    },
    remove: async (attachment) => {
      const adapter = owners.get(attachment.id)
      owners.delete(attachment.id)
      await adapter?.remove(attachment)
    },
    send: (attachment) => {
      const adapter = owners.get(attachment.id) ?? adapterFor(attachment.file)
      return adapter.send(attachment)
    },
  }
}

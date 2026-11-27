import {log} from 'evlog'
import type {AsyncStorage} from '@solid-primitives/storage'
import {z} from 'zod'
import {
  createDraftRetentionState,
  isCurrentSave,
  RETAINED_BLOB_GRACE_MS,
  resolveBlobAlias,
  selectBlobStoreId,
  selectDocumentRevision,
  selectLatestMutation,
  selectRetainedBlob,
  transitionDraftRetention,
  type DraftRetentionEvent,
} from './drafts-machine'
import {draftStoreErrors} from './errors.js'

const StoredDocumentSchema = z
  .string()
  .transform((raw, context): unknown => {
    try {
      return JSON.parse(raw)
    } catch {
      context.addIssue({code: 'custom', message: 'the stored draft is not JSON'})
      return z.NEVER
    }
  })
  .pipe(z.record(z.string(), z.json()))

const StoredRecordSchema = z.record(z.string(), z.unknown())

const StoredTextSchema = z.string()

const StoredBlobSchema = z.instanceof(Blob)

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return StoredRecordSchema.safeParse(value).data
}

export type BlobReference = {id: string; url: string}

type Driver = {
  get(key: string): Promise<string | null>
  set(key: string, value: string, strict: boolean): Promise<readonly string[]>
  remove(key: string): Promise<void>
  keys(): Promise<string[]>
  clear(): Promise<void>
  putBlob(blob: Blob): Promise<string>
  getBlob(id: string): Promise<Blob | null>
}

export type DraftStore = AsyncStorage & {
  putBlob(blob: Blob): Promise<BlobReference>
  resolveBlobUrl(blob: {id: string; url?: string}): Promise<string | undefined>
  setDocument(key: string, document: unknown): Promise<void>
  keys(): Promise<string[]>
  clear(): Promise<void>
}
const draftTextThreshold = 16 * 1024

const draftTextChunk = 64 * 1024

const textCacheLimit = 64

const retainedBlobGrace = RETAINED_BLOB_GRACE_MS

function imageIDs(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((entry) => imageIDs(entry, into))

    return into
  }

  const item = readRecord(value)
  if (!item) return into
  const blob = readRecord(item.blob)

  if (blob && !('kind' in blob)) {
    const id = blob.id

    if (typeof id === 'string') into.add(id)

    return into
  }

  Object.values(item).forEach((entry) => imageIDs(entry, into))

  return into
}

async function blobID(blob: Blob) {
  const bytes = crypto.subtle
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
    : crypto.getRandomValues(new Uint8Array(16))

  const id = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return id
}
async function detach(blob: Blob) {
  return blob instanceof File ? new Blob([await blob.arrayBuffer()], {type: blob.type}) : blob
}

export function createDraftStore(driver: Driver, options: {grace?: number} = {}): DraftStore {
  const grace = options.grace ?? retainedBlobGrace
  let retention = createDraftRetentionState()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const dispatch = (event: DraftRetentionEvent) => {
    const result = transitionDraftRetention(retention, event)
    retention = result.state
    result.effects.forEach((effect) => {
      if (effect.type === 'url.revoke') return URL.revokeObjectURL(effect.url)

      clearTimeout(timers.get(effect.id))
      timers.delete(effect.id)

      if (effect.type === 'timer.cancel') return

      timers.set(
        effect.id,
        setTimeout(() => {
          timers.delete(effect.id)
          dispatch({type: 'grace.expired', id: effect.id, attempt: effect.attempt})
        }, effect.delayMs),
      )
    })
  }

  const blobUrl = (id: string, blob: Blob, graceMs?: number) => {
    const existing = retention.blobs.get(id)

    if (existing) {
      dispatch({type: 'blob.touched', id, graceMs})

      return existing.url
    }

    const url = URL.createObjectURL(blob)
    dispatch({type: 'blob.materialized', id, blob, url, graceMs})

    return url
  }

  const storeId = retention.nextStoreId
  dispatch({type: 'store.registered'})
  const loading = new Map<string, Promise<string | undefined>>()

  const loadBlobUrl = (id: string) => {
    const existing = selectRetainedBlob(retention, id)

    if (existing) return Promise.resolve(existing.url)
    const pending = loading.get(id)

    if (pending) return pending

    const next = driver
      .getBlob(id)
      .then((blob) => (blob ? blobUrl(id, blob, grace) : undefined))
      .finally(() => loading.delete(id))

    loading.set(id, next)

    return next
  }

  const resolveBlobUrl = (blob: {id: string; url?: string}) => {
    if (blob.url) return Promise.resolve(blob.url)
    const existing = selectRetainedBlob(retention, blob.id)

    if (existing) return Promise.resolve(existing.url)

    return selectBlobStoreId(retention, blob.id) === storeId ? loadBlobUrl(blob.id) : Promise.resolve(undefined)
  }

  const putBlob = async (source: Blob) => {
    const blob = await detach(source)
    const id = await driver.putBlob(blob)

    return {id, url: blobUrl(id, blob, grace)}
  }
  const chunkIds = new Map<string, Promise<string>>()
  const chunks = new Map<string, string>()

  const remember = <V>(cache: Map<string, V>, key: string, value: V) => {
    cache.set(key, value)

    const oldest = cache.keys().next()
    if (cache.size > textCacheLimit && !oldest.done) cache.delete(oldest.value)

    return value
  }

  const upload = (chunk: string) => {
    const id = driver.putBlob(new Blob([chunk])).then(
      (id) => {
        remember(chunks, id, chunk)

        return id
      },
      (error: unknown) => {
        if (chunkIds.get(chunk) === id) chunkIds.delete(chunk)
        throw error
      },
    )

    return remember(chunkIds, chunk, id)
  }

  const externalize = (text: string) => Promise.all(split(text).map((chunk) => chunkIds.get(chunk) ?? upload(chunk)))

  const loadChunk = async (id: string) => {
    const cached = chunks.get(id)

    if (cached !== undefined) return cached
    const blob = await driver.getBlob(id)
    return remember(chunks, id, blob ? await blob.text() : '')
  }
  type Sources = Map<string, {blob: () => Promise<Blob>; chunk?: string}>
  type Pin = (id: string) => void

  const encode = async (value: unknown, sources: Sources, pin: Pin): Promise<unknown> => {
    if (typeof value === 'string' && value.length >= draftTextThreshold) {
      const pieces = split(value)
      const ids = await externalize(value)
      ids.forEach((id, index) => {
        const chunk = pieces[index] ?? ''
        sources.set(id, {blob: async () => new Blob([chunk]), chunk})
      })

      return {blob: {kind: 'text', ids}}
    }

    if (Array.isArray(value)) return Promise.all(value.map((entry) => encode(entry, sources, pin)))

    const item = readRecord(value)
    if (!item) return value

    if (item.type === 'image' && typeof item.dataUrl === 'string') {
      const blob = await fetch(item.dataUrl).then((response) => response.blob())
      const {dataUrl: _, ...rest} = item
      const id = await driver.putBlob(blob)
      sources.set(id, {blob: async () => blob})

      return {...rest, blob: {id}}
    }

    const blob = readRecord(item.blob)
    if (blob) {
      if (blob.kind === 'text') return item

      if (typeof blob.id === 'string' && blob.id.startsWith('data:')) {
        const data = await fetch(blob.id).then((response) => response.blob())
        const id = await driver.putBlob(data)
        sources.set(id, {blob: async () => data})

        return {...item, blob: {id}}
      }

      if (typeof blob.id === 'string') {
        const id = resolveBlobAlias(retention, blob.id)
        const retained = selectRetainedBlob(retention, id)
        const kept = retained?.blob
        const url = typeof blob.url === 'string' ? blob.url : retained?.url

        if (kept) sources.set(id, {blob: async () => kept})
        else if (url) sources.set(id, {blob: () => fetch(url).then((response) => response.blob())})

        return {...item, blob: {id}}
      }

      return {...item, blob: {id: blob.id}}
    }

    return Object.fromEntries(
      await Promise.all(Object.entries(item).map(async ([key, entry]) => [key, await encode(entry, sources, pin)])),
    )
  }

  const decode = async (value: unknown): Promise<unknown> => {
    if (Array.isArray(value)) return Promise.all(value.map(decode))

    const item = readRecord(value)
    if (!item) return value
    const ref = readRecord(item.blob)

    if (ref) {
      if (ref.kind === 'text' && Array.isArray(ref.ids)) {
        return (await Promise.all(ref.ids.map((id) => loadChunk(String(id))))).join('')
      }
      if (typeof ref.id === 'string') {
        const url = selectRetainedBlob(retention, ref.id)?.url

        return {...item, blob: url ? {id: ref.id, url} : {id: ref.id}}
      }
    }

    return Object.fromEntries(
      await Promise.all(Object.entries(item).map(async ([key, entry]) => [key, await decode(entry)])),
    )
  }
  const restore = async (ids: readonly string[], sources: Sources, pin: Pin) => {
    const renamed = new Map<string, string>()
    await Promise.all(
      ids.map(async (id) => {
        const source = sources.get(id)

        if (!source) return
        const blob = await source.blob()
        const next = await driver.putBlob(blob)
        renamed.set(id, next)

        if (source.chunk !== undefined) {
          remember(chunkIds, source.chunk, Promise.resolve(next))
          remember(chunks, next, source.chunk)

          return
        }

        pin(next)
        blobUrl(next, blob, grace)
        dispatch({type: 'alias.recorded', from: id, to: next})
      }),
    )

    return renamed
  }

  const rename = (value: unknown, renamed: Map<string, string>): unknown => {
    if (Array.isArray(value)) return value.map((entry) => rename(entry, renamed))

    const item = readRecord(value)
    if (!item) return value
    const ref = readRecord(item.blob)

    if (ref) {
      if (Array.isArray(ref.ids))
        return {...item, blob: {...ref, ids: ref.ids.map((id) => renamed.get(String(id)) ?? id)}}

      if (typeof ref.id === 'string') return {...item, blob: {...ref, id: renamed.get(ref.id) ?? ref.id}}
    }

    return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, rename(entry, renamed)]))
  }
  const write = async (key: string, document: unknown, attempt: number) => {
    const pin = (id: string) =>
      dispatch({type: 'save.referenced', storeId, key, attempt, ids: new Set([id]), graceMs: grace})

    const sources: Sources = new Map()
    const encoded = await encode(document, sources, pin)

    if (!isCurrentSave(retention, storeId, key, attempt)) return undefined
    const missing = await driver.set(key, JSON.stringify(encoded), true)

    if (missing.length === 0) return imageIDs(encoded)

    const renamed = await restore(missing, sources, pin)

    if (!isCurrentSave(retention, storeId, key, attempt)) return undefined
    const unrestored = missing.filter((id) => !renamed.has(id))

    if (unrestored.length)
      log.error({
        action: 'persistence',
        message: 'the draft references blobs with no bytes to restore',
        key,
        blobs: unrestored,
      })
    const final = rename(encoded, renamed)
    await driver.set(key, JSON.stringify(final), false)

    return imageIDs(final)
  }

  const setDocument = async (key: string, document: unknown) => {
    dispatch({type: 'save.started', storeId, key, ids: imageIDs(document), graceMs: grace})
    const attempt = selectLatestMutation(retention, storeId, key)

    await write(key, document, attempt).then(
      (ids) =>
        dispatch(
          ids
            ? {type: 'save.committed', storeId, key, attempt, ids, graceMs: grace}
            : {type: 'save.aborted', storeId, key, attempt, graceMs: grace},
        ),
      (error: unknown) => {
        dispatch({type: 'save.aborted', storeId, key, attempt, graceMs: grace})
        throw error
      },
    )
  }

  return {
    getItem: async (key) => {
      const revision = selectDocumentRevision(retention, storeId, key)
      const value = await driver.get(key)

      if (value === null) return null
      const parsed = StoredDocumentSchema.safeParse(value)

      if (!parsed.success) {
        log.error({
          action: 'persistence',
          message: 'the draft is not a stored document, read as absent',
          key,
          error: parsed.error,
        })
        return null
      }
      dispatch({type: 'load.succeeded', storeId, key, revision, ids: imageIDs(parsed.data), graceMs: grace})

      return JSON.stringify(await decode(parsed.data))
    },
    setItem: (key, value) => setDocument(key, JSON.parse(value)),
    setDocument,
    removeItem: async (key) => {
      dispatch({type: 'remove.started', storeId, key})
      const attempt = selectLatestMutation(retention, storeId, key)
      await driver.remove(key)
      dispatch({type: 'remove.committed', storeId, key, attempt, graceMs: grace})
    },
    keys: () => driver.keys(),
    clear: async () => {
      await driver.clear()
      chunks.clear()
      chunkIds.clear()
    },
    putBlob,
    resolveBlobUrl,
  }
}
function split(text: string) {
  const pieces: string[] = []

  for (let start = 0; start < text.length;) {
    const end = Math.min(start + draftTextChunk, text.length)
    const code = text.charCodeAt(end - 1)
    const stop = end < text.length && code >= 0xd800 && code <= 0xdbff ? end + 1 : end
    pieces.push(text.slice(start, stop))
    start = stop
  }

  return pieces
}

export function openBrowserDraftStore(writable: () => boolean): DraftStore | undefined {
  try {
    return createBrowserDraftStore(writable)
  } catch (error) {
    log.error({action: 'persistence', message: 'drafts stay engine-only', error})
    return undefined
  }
}

function createBrowserDraftStore(writable: () => boolean): DraftStore {
  const request = indexedDB.open('conciv-drafts', 1)
  request.addEventListener('upgradeneeded', () => {
    request.result.createObjectStore('documents')
    request.result.createObjectStore('blobs')
  })

  const db = new Promise<IDBDatabase>((resolve, reject) => {
    request.addEventListener('success', () => {
      const database = request.result
      database.addEventListener('versionchange', () => database.close())
      const transaction = database.transaction(['documents', 'blobs'], 'readwrite')
      const documents = transaction.objectStore('documents').getAll()
      documents.addEventListener('success', () => {
        const used = referenced(`[${documents.result.join(',')}]`)
        const store = transaction.objectStore('blobs')
        const blobs = store.openKeyCursor()
        blobs.addEventListener('success', () => {
          const cursor = blobs.result

          if (!cursor) return

          if (!used.has(String(cursor.key))) store.delete(cursor.key)
          cursor.continue()
        })
      })
      transaction.addEventListener('complete', () => resolve(database))
      transaction.addEventListener('abort', () => resolve(database))
    })
    request.addEventListener('error', () => reject(request.error))
  })
  db.catch((error: unknown) => {
    log.error({action: 'persistence', message: 'the draft database did not open; drafts stay engine-only', error})
  })

  const get = async (store: string, key: string) => {
    const result = (await db).transaction(store).objectStore(store).get(key)

    return new Promise<unknown>((resolve, reject) => {
      result.addEventListener('success', () => resolve(result.result))
      result.addEventListener('error', () => reject(result.error))
    })
  }

  const committed = (transaction: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve())
      transaction.addEventListener('error', () => reject(transaction.error))
      transaction.addEventListener('abort', () => reject(transaction.error))
    })

  const writeTransaction = async (stores: string | string[]) => {
    const database = await db

    if (!writable()) throw draftStoreErrors.NOT_WRITABLE()

    return database.transaction(stores, 'readwrite')
  }

  const write = async (store: string, key: string, value?: unknown) => {
    const transaction = await writeTransaction(store)

    if (value === undefined) transaction.objectStore(store).delete(key)
    else transaction.objectStore(store).put(value, key)

    return committed(transaction)
  }

  return createDraftStore({
    get: async (key) => StoredTextSchema.safeParse(await get('documents', key)).data ?? null,
    set: async (key, value, strict) => {
      const ids = [...referenced(value)]
      const transaction = await writeTransaction(['blobs', 'documents'])
      const missing: string[] = []

      const publish = () => {
        if (!strict || missing.length === 0) transaction.objectStore('documents').put(value, key)
        transaction.commit()
      }

      let remaining = ids.length

      if (remaining === 0) publish()

      for (const id of ids) {
        const lookup = transaction.objectStore('blobs').getKey(id)
        lookup.addEventListener('success', () => {
          if (lookup.result === undefined) missing.push(id)

          if (--remaining === 0) publish()
        })
      }

      return new Promise<string[]>((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve(missing))
        transaction.addEventListener('error', () => reject(transaction.error))
        transaction.addEventListener('abort', () => reject(transaction.error))
      })
    },
    remove: (key) => write('documents', key),
    clear: async () => {
      const transaction = (await db).transaction(['blobs', 'documents'], 'readwrite')
      transaction.objectStore('documents').clear()
      transaction.objectStore('blobs').clear()

      return committed(transaction)
    },
    keys: async () => {
      const request = (await db).transaction('documents').objectStore('documents').getAllKeys()
      return new Promise<string[]>((resolve, reject) => {
        request.addEventListener('success', () => resolve(request.result.map(String)))
        request.addEventListener('error', () => reject(request.error))
      })
    },
    putBlob: async (blob) => {
      const id = await blobID(blob)
      await write('blobs', id, blob)

      return id
    },
    getBlob: async (id) => StoredBlobSchema.safeParse(await get('blobs', id)).data ?? null,
  })
}
function referenced(json: string) {
  const ids = new Set<string>()
  JSON.parse(json, (_key, item) => {
    if (item?.blob && typeof item.blob.id === 'string') ids.add(item.blob.id)

    if (item?.blob && Array.isArray(item.blob.ids)) item.blob.ids.forEach((id: unknown) => ids.add(String(id)))

    return item
  })

  return ids
}

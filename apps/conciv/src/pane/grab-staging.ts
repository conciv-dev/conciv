import {createSignal} from 'solid-js'
import {
  GRAB_MIME,
  grabToFile,
  grabToPayload,
  MAX_PAYLOAD_BYTES,
  parseGrabPayload,
  type GrabPayload,
} from '@conciv/grab/grab-attachment'
import type {Grab} from '@conciv/grab'
import {fitImagePreview} from '@conciv/page'
import type {AttachmentState} from '@conciv/ui-kit-chat'

export type ComposerGrabPort = {
  attachments: () => readonly AttachmentState[]
  addAttachment: (file: File) => Promise<string | null>
  replaceAttachment: (id: string, file: File) => Promise<string | null>
  removeAttachment: (id: string) => Promise<void>
  hasAttachment: (id: string) => boolean
}

export type GrabStaging = {
  stage: (grab: Grab) => void
  staged: () => readonly Grab[]
  clear: () => void
  reconcile: (attachments: readonly AttachmentState[]) => void
  connect: (port: ComposerGrabPort) => void
  disconnect: () => void
}

type Deps = {
  ground: (grab: Grab) => Promise<Grab | null>
}

type StagedEntry = {grab: Grab; id: string | null; grounded: Grab | null; placing: Promise<void> | null}

function toGrab(payload: GrabPayload): Grab {
  return {
    text: payload.text,
    ...(payload.snippet === undefined ? {} : {snippet: payload.snippet}),
    preview: payload.preview ?? {kind: 'dom', html: '', width: 0, height: 0},
    source: payload.source,
    rect: payload.rect,
  }
}

function isGrabAttachment(attachment: AttachmentState): boolean {
  return attachment.contentType === GRAB_MIME
}

async function fitted(grab: Grab): Promise<Grab> {
  if (grab.preview.kind !== 'image') return grab
  return {...grab, preview: await fitImagePreview(grab.preview, MAX_PAYLOAD_BYTES)}
}

export function makeGrabStaging(deps: Deps): GrabStaging {
  const [payloads, setPayloads] = createSignal<ReadonlyMap<string, GrabPayload>>(new Map())
  const [pending, setPending] = createSignal<readonly StagedEntry[]>([])
  const [port, setPort] = createSignal<ComposerGrabPort | null>(null)

  const remember = (id: string, payload: GrabPayload): void => {
    setPayloads((current) => new Map(current).set(id, payload))
  }

  const forget = (id: string): void => {
    setPayloads((current) => new Map([...current].filter(([known]) => known !== id)))
  }

  const drop = (entry: StagedEntry): void => {
    setPending((current) => current.filter((candidate) => candidate !== entry))
  }

  const putOnComposer = async (entry: StagedEntry, composer: ComposerGrabPort): Promise<void> => {
    const prepared = await fitted(entry.grounded ?? entry.grab)
    const id = await composer.addAttachment(grabToFile(prepared))
    entry.id = id
    if (id) remember(id, grabToPayload(prepared))
    if (entry.grounded === null) return
    drop(entry)
  }

  const ensureOnComposer = (entry: StagedEntry): Promise<void> => {
    const composer = port()
    if (!composer || entry.id !== null) return Promise.resolve()
    if (entry.placing) return entry.placing
    entry.placing = putOnComposer(entry, composer)
    return entry.placing
  }

  const settle = async (entry: StagedEntry): Promise<void> => {
    const composer = port()
    if (!composer || entry.id === null || entry.grounded === null) return
    const prepared = await fitted(entry.grounded)
    const replaced = await composer.replaceAttachment(entry.id, grabToFile(prepared))
    forget(entry.id)
    if (replaced) remember(replaced, grabToPayload(prepared))
    drop(entry)
  }

  const ground = async (entry: StagedEntry): Promise<void> => {
    entry.grounded = await deps.ground(entry.grab)
    if (entry.grounded === null) {
      if (entry.id !== null) drop(entry)
      return
    }
    await settle(entry)
  }

  const placeThenGround = async (entry: StagedEntry): Promise<void> => {
    await ensureOnComposer(entry)
    await ground(entry)
  }

  const stage = (grab: Grab): void => {
    const entry: StagedEntry = {grab, id: null, grounded: null, placing: null}
    setPending((current) => [...current, entry])
    void placeThenGround(entry)
  }

  const staged = (): readonly Grab[] => {
    const composer = port()
    const known = payloads()
    const placed = (composer?.attachments() ?? []).filter(isGrabAttachment).flatMap((attachment) => {
      const payload = known.get(attachment.id)
      return payload ? [toGrab(payload)] : []
    })
    const waiting = pending().filter((entry) => entry.id === null)
    return [...placed, ...waiting.map((entry) => entry.grounded ?? entry.grab)]
  }

  const clear = (): void => {
    setPending([])
    const composer = port()
    if (!composer) return
    for (const attachment of composer.attachments().filter(isGrabAttachment))
      void composer.removeAttachment(attachment.id)
  }

  const hydrate = async (attachment: AttachmentState, file: File): Promise<void> => {
    const payload = parseGrabPayload(await file.text())
    const stillLive = (port()?.attachments() ?? []).some((entry) => entry.id === attachment.id)
    if (payload && stillLive) remember(attachment.id, payload)
  }

  const reconcile = (attachments: readonly AttachmentState[]): void => {
    const grabs = attachments.filter(isGrabAttachment)
    const live = new Set(grabs.map((attachment) => attachment.id))
    setPayloads((current) => new Map([...current].filter(([id]) => live.has(id))))
    for (const attachment of grabs) {
      const file = attachment.file
      if (payloads().has(attachment.id) || !file) continue
      void hydrate(attachment, file)
    }
  }

  const connect = (next: ComposerGrabPort): void => {
    setPort(() => next)
    for (const entry of pending().filter((candidate) => candidate.id === null)) void ensureOnComposer(entry)
  }

  const disconnect = (): void => {
    setPort(null)
  }

  return {stage, staged, clear, reconcile, connect, disconnect}
}

import {difference} from 'es-toolkit'
import {createSignal} from 'solid-js'
import {
  GRAB_MIME,
  grabToFile,
  grabToPayload,
  imagePreviewBudget,
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
  remove: (grab: Grab) => void
  clear: () => void
  reconcile: (attachments: readonly AttachmentState[]) => void
  connect: (port: ComposerGrabPort) => void
  disconnect: () => void
}

type Deps = {
  ground: (grab: Grab) => Promise<Grab | null>
  fail: (message: string, error: unknown) => void
}

const REMOVE_FAILED = 'Could not remove the grabbed element.'
const ADD_FAILED = 'Could not add the grabbed element.'
const LOAD_FAILED = 'Could not load a grabbed element.'

type StagedEntry = {
  grab: Grab
  forChat: boolean
  id: string | null
  grounded: Grab | null
  placing: Promise<void> | null
}

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
  const preview = grab.preview
  if (preview.kind !== 'image') return grab
  return {...grab, preview: await fitImagePreview(preview, imagePreviewBudget(grab, preview))}
}

export function makeGrabStaging(deps: Deps): GrabStaging {
  const [placedGrabs, setPlacedGrabs] = createSignal<ReadonlyMap<string, Grab>>(new Map())
  const [pending, setPending] = createSignal<readonly StagedEntry[]>([])
  const [port, setPort] = createSignal<ComposerGrabPort | null>(null)

  const reportTo =
    (message: string) =>
    (error: unknown): void =>
      deps.fail(message, error)

  const remember = (id: string, payload: GrabPayload): void => {
    setPlacedGrabs((current) => new Map(current).set(id, toGrab(payload)))
  }

  const forget = (id: string): void => {
    setPlacedGrabs((current) => new Map([...current].filter(([known]) => known !== id)))
  }

  const drop = (entry: StagedEntry): void => {
    setPending((current) => current.filter((candidate) => candidate !== entry))
  }

  const isLive = (entry: StagedEntry, composer: ComposerGrabPort): boolean =>
    port() === composer && pending().includes(entry)

  const waiting = (): readonly StagedEntry[] => {
    const connected = port() !== null
    return pending().filter((entry) => entry.id === null && (connected || !entry.forChat))
  }

  const putOnComposer = async (entry: StagedEntry, composer: ComposerGrabPort): Promise<void> => {
    try {
      const placed = entry.grounded ?? entry.grab
      const prepared = await fitted(placed)
      if (!isLive(entry, composer)) return
      const id = await composer.addAttachment(grabToFile(prepared))
      if (!isLive(entry, composer)) {
        if (id) void composer.removeAttachment(id).catch(reportTo(REMOVE_FAILED))
        return
      }
      entry.id = id
      if (id) remember(id, grabToPayload(prepared))
      await finishPlacing(entry, placed)
    } finally {
      if (entry.id === null) entry.placing = null
    }
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
    if (!isLive(entry, composer)) return
    const replaced = await composer.replaceAttachment(entry.id, grabToFile(prepared))
    if (!isLive(entry, composer)) {
      if (replaced) void composer.removeAttachment(replaced).catch(reportTo(REMOVE_FAILED))
      return
    }
    forget(entry.id)
    if (replaced) remember(replaced, grabToPayload(prepared))
    drop(entry)
  }

  const finishPlacing = async (entry: StagedEntry, placed: Grab): Promise<void> => {
    if (entry.grounded === null) return
    if (entry.id !== null && placed !== entry.grounded) return settle(entry)
    drop(entry)
  }

  const ground = async (entry: StagedEntry): Promise<void> => {
    entry.grounded = await deps.ground(entry.grab)
    if (entry.grounded === null) {
      if (entry.id !== null) drop(entry)
      return
    }
    setPending((current) => [...current])
    await settle(entry)
  }

  const placeThenGround = async (entry: StagedEntry): Promise<void> => {
    await ensureOnComposer(entry).catch(reportTo(ADD_FAILED))
    await ground(entry)
  }

  const stage = (grab: Grab): void => {
    const entry: StagedEntry = {grab, forChat: port() !== null, id: null, grounded: null, placing: null}
    setPending((current) => [...current, entry])
    void placeThenGround(entry).catch(reportTo(ADD_FAILED))
  }

  const staged = (): readonly Grab[] => {
    const composer = port()
    const known = placedGrabs()
    const placed = (composer?.attachments() ?? []).filter(isGrabAttachment).flatMap((attachment) => {
      const grab = known.get(attachment.id)
      return grab ? [grab] : []
    })
    return [...placed, ...waiting().map((entry) => entry.grounded ?? entry.grab)]
  }

  const remove = (grab: Grab): void => {
    const placed = [...placedGrabs()].find(([, known]) => known === grab)
    if (placed) {
      void port()?.removeAttachment(placed[0]).catch(reportTo(REMOVE_FAILED))
      return
    }
    const entry = waiting().find((candidate) => candidate.grab === grab || candidate.grounded === grab)
    if (entry) drop(entry)
  }

  const clear = (): void => {
    const composer = port()
    if (!composer) {
      const cleared = waiting()
      setPending((current) => difference(current, cleared))
      return
    }
    setPending([])
    for (const attachment of composer.attachments().filter(isGrabAttachment))
      void composer.removeAttachment(attachment.id).catch(reportTo(REMOVE_FAILED))
  }

  const hydrate = async (attachment: AttachmentState, file: File): Promise<void> => {
    const payload = parseGrabPayload(await file.text())
    const stillLive = (port()?.attachments() ?? []).some((entry) => entry.id === attachment.id)
    if (payload && stillLive) remember(attachment.id, payload)
  }

  const reconcile = (attachments: readonly AttachmentState[]): void => {
    const grabs = attachments.filter(isGrabAttachment)
    const live = new Set(grabs.map((attachment) => attachment.id))
    setPlacedGrabs((current) => new Map([...current].filter(([id]) => live.has(id))))
    for (const attachment of grabs) {
      const file = attachment.file
      if (placedGrabs().has(attachment.id) || !file) continue
      void hydrate(attachment, file).catch(reportTo(LOAD_FAILED))
    }
  }

  const connect = (next: ComposerGrabPort): void => {
    setPort(() => next)
    for (const entry of pending().filter((candidate) => candidate.id === null))
      void ensureOnComposer(entry).catch(reportTo(ADD_FAILED))
  }

  const disconnect = (): void => {
    setPort(null)
  }

  return {stage, staged, remove, clear, reconcile, connect, disconnect}
}

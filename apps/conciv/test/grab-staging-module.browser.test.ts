import {createEffect, createRoot} from 'solid-js'
import {expect, it} from 'vitest'
import {GRAB_MIME, grabToFile, MAX_PAYLOAD_BYTES, parseGrabPayload} from '@conciv/grab/grab-attachment'
import type {Grab} from '@conciv/grab'
import type {AttachmentState} from '@conciv/ui-kit-chat'
import {makeGrabStaging, type ComposerGrabPort, type GrabStaging} from '../src/pane/grab-staging.js'

const GRAB: Grab = {
  text: '<h1>Payroll Deposit</h1> at src/routes/index.tsx:12:9',
  snippet: '<h1>Payroll Deposit</h1>',
  preview: {kind: 'dom', html: '<p>Payroll Deposit clone</p>', width: 200, height: 40},
  source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
  rect: {x: 0, y: 0, width: 200, height: 40},
}

const GROUNDED: Grab = {...GRAB, text: '<h1>Payroll Deposit</h1> at src/routes/hero.tsx:4:1'}

type FakeComposer = ComposerGrabPort & {
  list: () => AttachmentState[]
  nextAdd: () => Promise<AttachmentState>
  nextRemove: () => Promise<string>
  nextAddStart: () => Promise<void>
  nextReplace: () => Promise<AttachmentState>
  holdAdds: () => () => void
  failNextAdd: () => void
}

function fakeComposer(): FakeComposer {
  const entries: AttachmentState[] = []
  const addWaiters: ((attachment: AttachmentState) => void)[] = []
  const removeWaiters: ((id: string) => void)[] = []
  const startWaiters: (() => void)[] = []
  const replaceWaiters: ((attachment: AttachmentState) => void)[] = []
  const gate: {open: Promise<void> | null; release: () => void} = {open: null, release: () => {}}
  const failure = {pending: 0}
  let nextId = 0
  const entryFor = (id: string, file: File): AttachmentState => ({
    id,
    type: 'document',
    name: file.name,
    contentType: file.type,
    file,
    status: {type: 'requires-action', reason: 'composer-send'},
  })
  return {
    list: () => entries,
    nextAdd: () => new Promise<AttachmentState>((resolve) => addWaiters.push(resolve)),
    nextRemove: () => new Promise<string>((resolve) => removeWaiters.push(resolve)),
    nextAddStart: () => new Promise<void>((resolve) => startWaiters.push(resolve)),
    nextReplace: () => new Promise<AttachmentState>((resolve) => replaceWaiters.push(resolve)),
    holdAdds: () => {
      gate.open = new Promise<void>((resolve) => {
        gate.release = resolve
      })
      return () => {
        gate.open = null
        gate.release()
      }
    },
    failNextAdd: () => {
      failure.pending += 1
    },
    attachments: () => entries,
    hasAttachment: (id) => entries.some((entry) => entry.id === id),
    addAttachment: async (file) => {
      startWaiters.splice(0).forEach((resolve) => resolve())
      if (failure.pending > 0) {
        failure.pending -= 1
        throw new Error('the adapter refused the attachment')
      }
      if (gate.open) await gate.open
      nextId += 1
      const id = `attachment-${nextId}`
      const added = entryFor(id, file)
      entries.push(added)
      addWaiters.splice(0).forEach((resolve) => resolve(added))
      return id
    },
    replaceAttachment: async (id, file) => {
      const position = entries.findIndex((entry) => entry.id === id)
      if (position < 0) return null
      nextId += 1
      const next = `attachment-${nextId}`
      const swapped = entryFor(next, file)
      entries.splice(position, 1, swapped)
      replaceWaiters.splice(0).forEach((resolve) => resolve(swapped))
      return next
    },
    removeAttachment: async (id) => {
      const position = entries.findIndex((entry) => entry.id === id)
      if (position >= 0) entries.splice(position, 1)
      removeWaiters.splice(0).forEach((resolve) => resolve(id))
    },
  }
}

async function bodyOf(attachment: AttachmentState): Promise<string> {
  if (!attachment.file) throw new Error('expected the attachment to carry a file')
  return attachment.file.text()
}

async function grabTextOf(attachment: AttachmentState): Promise<string | undefined> {
  return parseGrabPayload(await bodyOf(attachment))?.text
}

function imageGrab(width: number, height: number): Grab {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('expected a canvas context')
  const pixels = context.createImageData(width, height)
  let noise = 1
  for (let index = 0; index < pixels.data.length; index += 1) {
    noise = (noise * 1_103_515_245 + 12_345) % 2_147_483_648
    pixels.data[index] = index % 4 === 3 ? 255 : noise % 256
  }
  context.putImageData(pixels, 0, 0)
  return {...GRAB, preview: {kind: 'image', dataUrl: canvas.toDataURL('image/png'), width, height}}
}

function stagedWhen(staging: GrabStaging, count: number): Promise<readonly Grab[]> {
  let release = () => {}
  const settledStaged = new Promise<readonly Grab[]>((resolve) => {
    createRoot((disposeRoot) => {
      release = disposeRoot
      createEffect(() => {
        const value = staging.staged()
        if (value.length === count) resolve(value)
      })
    })
  })
  return settledStaged.finally(() => release())
}

function neverGrounds(): Promise<Grab | null> {
  return Promise.resolve(null)
}

it('attaches optimistically and replaces the payload once grounding resolves', async () => {
  const composer = fakeComposer()
  const staging = makeGrabStaging({ground: async () => GROUNDED})
  staging.connect(composer)
  const replaced = composer.nextReplace()

  staging.stage(GRAB)
  await replaced

  expect(composer.list()).toHaveLength(1)
  expect(await grabTextOf(composer.list()[0] ?? never())).toBe(GROUNDED.text)
})

it('keeps the optimistic attachment when grounding yields nothing', async () => {
  const composer = fakeComposer()
  const staging = makeGrabStaging({ground: neverGrounds})
  staging.connect(composer)
  const added = composer.nextAdd()

  staging.stage(GRAB)
  await added

  expect(composer.list()).toHaveLength(1)
  expect(await grabTextOf(composer.list()[0] ?? never())).toBe(GRAB.text)
})

it('attaches a grab staged before the composer connected, carrying its grounded payload', async () => {
  const composer = fakeComposer()
  const staging = makeGrabStaging({ground: async () => GROUNDED})

  staging.stage(GRAB)
  expect(await stagedWhen(staging, 1)).toHaveLength(1)
  expect(composer.list()).toHaveLength(0)

  const added = composer.nextAdd()
  staging.connect(composer)
  await added

  expect(composer.list()).toHaveLength(1)
  expect(await grabTextOf(composer.list()[0] ?? never())).toBe(GROUNDED.text)
})

it('attaches a grab staged before the composer connected even when grounding yields nothing', async () => {
  const composer = fakeComposer()
  const staging = makeGrabStaging({ground: neverGrounds})

  staging.stage(GRAB)
  expect(await stagedWhen(staging, 1)).toHaveLength(1)

  const added = composer.nextAdd()
  staging.connect(composer)
  await added

  expect(composer.list()).toHaveLength(1)
  expect(await grabTextOf(composer.list()[0] ?? never())).toBe(GRAB.text)
})

it('reports a staged grab reactively once its payload is known', async () => {
  const composer = fakeComposer()
  const staging = makeGrabStaging({ground: neverGrounds})
  staging.connect(composer)
  const seen: number[] = []
  const dispose = createRoot((disposeRoot) => {
    createEffect(() => seen.push(staging.staged().length))
    return disposeRoot
  })

  staging.stage(GRAB)
  await stagedWhen(staging, 1)

  expect(seen.at(-1)).toBe(1)
  dispose()
})

it('clears only the grab attachments', async () => {
  const composer = fakeComposer()
  const staging = makeGrabStaging({ground: neverGrounds})
  staging.connect(composer)
  await composer.addAttachment(new File(['hello'], 'notes.txt', {type: 'text/plain'}))
  const added = composer.nextAdd()
  staging.stage(GRAB)
  await added

  const removed = composer.nextRemove()
  staging.clear()
  await removed

  expect(composer.list().map((entry) => entry.name)).toEqual(['notes.txt'])
  expect(staging.staged()).toHaveLength(0)
})

it('hydrates a restored grab attachment and prunes one that is gone', async () => {
  const composer = fakeComposer()
  const staging = makeGrabStaging({ground: neverGrounds})
  staging.connect(composer)
  const restored = await composer.addAttachment(grabToFile(GRAB))
  if (!restored) throw new Error('expected the restored attachment to be added')

  staging.reconcile(composer.attachments())

  expect((await stagedWhen(staging, 1)).map((grab) => grab.text)).toEqual([GRAB.text])

  await composer.removeAttachment(restored)
  staging.reconcile(composer.attachments())

  expect(await stagedWhen(staging, 0)).toHaveLength(0)
})

it('does not hydrate a payload whose attachment was removed while it decoded', async () => {
  const composer = fakeComposer()
  const staging = makeGrabStaging({ground: neverGrounds})
  staging.connect(composer)
  const body = grabToFile(GRAB)
  const restored = await composer.addAttachment(body)
  if (!restored) throw new Error('expected the restored attachment to be added')

  staging.reconcile(composer.attachments())
  await composer.removeAttachment(restored)
  await body.text()

  expect(staging.staged()).toHaveLength(0)
})

it('fits an oversized image preview into the payload budget instead of dropping it', async () => {
  const composer = fakeComposer()
  const oversized = imageGrab(1600, 1600)
  const preview = oversized.preview
  if (preview.kind !== 'image') throw new Error('expected an image preview')
  expect(new TextEncoder().encode(preview.dataUrl).length).toBeGreaterThan(MAX_PAYLOAD_BYTES)
  const staging = makeGrabStaging({ground: neverGrounds})
  staging.connect(composer)
  const added = composer.nextAdd()

  staging.stage(oversized)

  const payload = parseGrabPayload(await bodyOf(await added))
  expect(payload?.preview?.kind).toBe('image')
  expect(
    payload?.preview?.kind === 'image' ? new TextEncoder().encode(payload.preview.dataUrl).length : 0,
  ).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES)
})

it('stages through a port that arrives and leaves again', async () => {
  const composer = fakeComposer()
  const staging: GrabStaging = makeGrabStaging({ground: async () => GROUNDED})
  staging.connect(composer)
  const replaced = composer.nextReplace()
  staging.stage(GRAB)
  await replaced
  await stagedWhen(staging, 1)

  staging.disconnect()

  expect(staging.staged()).toHaveLength(0)
  expect(composer.list()).toHaveLength(1)
  expect(composer.list()[0]?.contentType).toBe(GRAB_MIME)
})

function never(): never {
  throw new Error('expected an attachment')
}

it('a clear while a placement is in flight does not put the grab back on the composer', async () => {
  const composer = fakeComposer()
  const release = composer.holdAdds()
  const staging = makeGrabStaging({ground: neverGrounds})
  staging.connect(composer)
  const started = composer.nextAddStart()

  staging.stage(GRAB)
  await started
  const added = composer.nextAdd()
  const removed = composer.nextRemove()
  staging.clear()
  release()
  await added
  await removed

  expect(composer.list()).toHaveLength(0)
  expect(staging.staged()).toHaveLength(0)
})

it('a placement that lands after disconnect is redirected to the composer connected next', async () => {
  const first = fakeComposer()
  const second = fakeComposer()
  const release = first.holdAdds()
  const staging = makeGrabStaging({ground: neverGrounds})
  staging.connect(first)
  const started = first.nextAddStart()

  staging.stage(GRAB)
  await started
  const firstAdded = first.nextAdd()
  const firstRemoved = first.nextRemove()
  staging.disconnect()
  release()
  await firstAdded
  await firstRemoved

  const secondAdded = second.nextAdd()
  staging.connect(second)
  await secondAdded

  expect(first.list()).toHaveLength(0)
  expect(second.list()).toHaveLength(1)
})

it('a grab whose placement fails can still be placed on the next connection', async () => {
  const composer = fakeComposer()
  composer.failNextAdd()
  const grounding: {reached: () => void} = {reached: () => {}}
  const groundingReached = new Promise<void>((resolve) => {
    grounding.reached = resolve
  })
  const staging = makeGrabStaging({
    ground: async () => {
      grounding.reached()
      return null
    },
  })
  staging.connect(composer)

  staging.stage(GRAB)
  await groundingReached

  const added = composer.nextAdd()
  staging.connect(composer)
  await added

  expect(composer.list()).toHaveLength(1)
})

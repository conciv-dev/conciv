import {composeGrabText, sourceLabel} from './grab-label.js'
import type {ComposerNote, MountedSession, Screen} from '@conciv/plugin/experimental'
import type {Grab, GrabPicker} from '@conciv/plugin/experimental/grab'
import type {Page} from '@conciv/plugin/experimental/page'
import {fitImagePreview} from './grab-preview.js'
import {Definition, GRAB_NOTE_ORIGIN, grabHref, type GrabId, type StoredGrab} from './rpc.js'

const PREVIEW_BYTES = 750_000

type Deps = {
  session: () => MountedSession | undefined
  screen: Screen
  symbolicate: Page['symbolicate']
}

async function grounded(grab: Grab, symbolicate: Page['symbolicate']): Promise<Grab> {
  const frames = grab.frames ?? []
  if (grab.source || frames.length === 0) return grab
  const source = await symbolicate({frames}).catch(() => null)
  if (!source) return grab
  return {
    ...grab,
    source: {componentName: null, filePath: source.file, lineNumber: source.line},
    text: composeGrabText(grab.snippet ?? '', source, grab.text),
  }
}

async function fitted(grab: Grab): Promise<StoredGrab> {
  const preview = grab.preview.kind === 'image' ? await fitImagePreview(grab.preview, PREVIEW_BYTES) : grab.preview
  return {
    text: grab.text,
    ...(grab.snippet === undefined ? {} : {snippet: grab.snippet}),
    source: grab.source,
    rect: grab.rect,
    preview,
  }
}

function grabNote(id: GrabId, grab: StoredGrab): ComposerNote {
  const where = grab.source ? sourceLabel(grab.source) : ''
  const component = grab.source?.componentName
  return {
    type: 'note',
    origin: GRAB_NOTE_ORIGIN,
    commentId: id,
    label: 'Grabbed element',
    title: component ?? 'Grabbed element',
    ...(where === '' ? {} : {subtitle: where}),
    icon: 'crosshair',
    subject: `the grabbed ${component ? `${component} ` : ''}element ${grab.text}`,
    comment: '',
    href: grabHref(id),
  }
}

export function makeGrabNotePicker(actions: GrabPicker, deps: Deps): GrabPicker {
  const pickAsNote = async (picking: () => Promise<Grab | null>): Promise<Grab | null> => {
    const grab = await picking()
    const session = deps.session()
    const composer = deps.screen.current()?.composer
    if (!grab || !session || !composer) return grab
    const ready = await grounded(grab, deps.symbolicate)
    const stored = await fitted(ready)
    const {id} = await session.server.client.rpc(Definition)['grabs.save']({grab: stored})
    composer.attach(grabNote(id, stored))
    return ready
  }
  return {
    pick: () => pickAsNote(actions.pick),
    comment: () => pickAsNote(actions.comment),
    cancel: actions.cancel,
    isActive: actions.isActive,
    ...(actions.grabbable ? {grabbable: actions.grabbable} : {}),
  }
}

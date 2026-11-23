import {sourceLabel, type Grab} from '@conciv/grab'
import type {ComposerNote, MountedSession, Screen} from '@conciv/plugin/experimental'
import type {GrabPicker} from '@conciv/plugin/experimental/grab'
import {Definition, GRAB_NOTE_ORIGIN, grabHref, StoredGrab, type GrabId, type GrabMode} from './rpc.js'

type NativePicker = {
  readonly view: {readonly picking: boolean; readonly grabbable: boolean}
  readonly pick: (mode: GrabMode) => Promise<Grab | null>
  readonly cancel: () => void
}

type Deps = {
  session: () => MountedSession | undefined
  screen: Screen
}

export function sourceLine(grab: StoredGrab): string {
  return grab.source ? sourceLabel(grab.source) : ''
}

function storedGrab(grab: Grab): StoredGrab | null {
  const parsed = StoredGrab.safeParse({
    text: grab.text,
    source: grab.source,
    rect: grab.rect,
    preview: grab.preview.kind === 'image' ? grab.preview : null,
  })
  return parsed.success ? parsed.data : null
}

function grabNote(id: GrabId, grab: StoredGrab): ComposerNote {
  const where = sourceLine(grab)
  const component = grab.source?.componentName
  return {
    type: 'note',
    origin: GRAB_NOTE_ORIGIN,
    commentId: id,
    label: 'Grabbed view',
    title: component ?? 'Grabbed view',
    ...(where === '' ? {} : {subtitle: where}),
    icon: 'crosshair',
    subject: `the grabbed ${component ? `${component} ` : ''}native view ${grab.text}`,
    comment: '',
    href: grabHref(id),
  }
}

export function readGrab(
  session: MountedSession | undefined,
  id: GrabId,
  signal: AbortSignal | undefined,
): Promise<StoredGrab | null> {
  if (session === undefined) return Promise.resolve(null)
  return session.server.client.rpc(Definition)['grabs.get']({id}, signal ? {signal} : undefined)
}

export function makeGrabNotePicker(native: NativePicker, deps: Deps): GrabPicker {
  const pickAsNote = async (mode: GrabMode): Promise<Grab | null> => {
    const grab = await native.pick(mode)
    const session = deps.session()
    const composer = deps.screen.current()?.composer
    if (!grab || !session || !composer) return grab
    const stored = storedGrab(grab)
    if (!stored) return grab
    const {id} = await session.server.client.rpc(Definition)['grabs.save']({grab: stored})
    composer.attach(grabNote(id, stored))
    return grab
  }
  return {
    pick: () => pickAsNote('activate'),
    comment: () => pickAsNote('comment'),
    cancel: native.cancel,
    isActive: () => native.view.picking,
    grabbable: () => native.view.grabbable,
  }
}

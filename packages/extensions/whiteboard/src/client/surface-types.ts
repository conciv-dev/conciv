import type {Accessor} from 'solid-js'
import type {ElementRect, ElementSource} from '@conciv/grab'

export type Self = {peerId: string; name: string; color: string}

export type CommentPick = {source: ElementSource | null; rect: ElementRect | null}

export type SurfaceState = {
  engaged: Accessor<boolean>
  open: Accessor<boolean>
  visible: Accessor<boolean>
  close: () => void
  settleCompose: () => void
  registerComment: (write: (pick: CommentPick) => void) => void
}

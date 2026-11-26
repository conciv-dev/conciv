import type {Deferred} from 'effect'
import type {ElementRect} from '@conciv/frontend-plugin-api/grab'
import type {ComposeTarget} from './comments-model.js'

export * as WhiteboardComposeMachine from './comment-compose-machine.js'

export type ComposePhase =
  | {readonly status: 'idle'}
  | {readonly status: 'picking'}
  | {
      readonly status: 'composing'
      readonly target: ComposeTarget
      readonly anchor: ElementRect
      readonly reply: Deferred.Deferred<string>
    }

type ComposeEvent =
  | {readonly type: 'started'}
  | {
      readonly type: 'picked'
      readonly target: ComposeTarget
      readonly anchor: ElementRect
      readonly reply: Deferred.Deferred<string>
    }
  | {readonly type: 'finished'}

export const initialCompose: ComposePhase = {status: 'idle'}

export function transitionCompose(phase: ComposePhase, event: ComposeEvent): ComposePhase {
  if (event.type === 'finished') return initialCompose
  if (event.type === 'started') return phase.status === 'idle' ? {status: 'picking'} : phase
  if (phase.status !== 'picking') return phase
  return {status: 'composing', target: event.target, anchor: event.anchor, reply: event.reply}
}

export function selectReply(phase: ComposePhase): Deferred.Deferred<string> | undefined {
  return phase.status === 'composing' ? phase.reply : undefined
}

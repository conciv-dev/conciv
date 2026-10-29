import {createContext, createSignal, useContext, type Accessor, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {PermissionScope} from '@conciv/protocol/chat-types'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {parseInput} from './tool-util.js'

const CommandInputSchema = z.object({command: z.string().min(1)})

export type PermissionDecision = 'approved' | 'denied' | undefined

type PermissionContextValue = {
  pending: Accessor<boolean>
  decision: Accessor<PermissionDecision>
  rememberable: Accessor<boolean>
  approve: () => void
  approveForSession: () => void
  reject: () => void
}

const PermissionContext = createContext<PermissionContextValue>()

export function usePermission(): PermissionContextValue {
  const context = useContext(PermissionContext)
  if (!context) throw new Error('Permission.* must be used within Permission.Root')
  return context
}

function recordedDecision(approved: boolean | undefined): PermissionDecision {
  if (approved === undefined) return undefined
  return approved ? 'approved' : 'denied'
}

function Root(props: {part: ToolCallPart; ctx: ToolViewCtx; children: JSX.Element}): JSX.Element {
  const [answered, setAnswered] = createSignal<PermissionDecision>()
  const approval = () => props.part.approval
  const decision = (): PermissionDecision => answered() ?? recordedDecision(approval()?.approved)
  const pending = () =>
    decision() === undefined &&
    props.part.state === 'approval-requested' &&
    approval() !== undefined &&
    Boolean(props.ctx.respondApproval)
  const rememberable = () => parseInput(CommandInputSchema, props.part) !== undefined
  const decide = (approved: boolean, scope: PermissionScope) => {
    const id = approval()?.id
    if (!id) return
    setAnswered(approved ? 'approved' : 'denied')
    props.ctx.respondApproval?.(id, approved, scope)
  }
  return (
    <PermissionContext.Provider
      value={{
        pending,
        decision,
        rememberable,
        approve: () => decide(true, 'once'),
        approveForSession: () => decide(true, 'session'),
        reject: () => decide(false, 'once'),
      }}
    >
      {props.children}
    </PermissionContext.Provider>
  )
}

export const Permission = Object.assign(Root, {Root})

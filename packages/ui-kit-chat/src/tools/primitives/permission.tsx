import {createContext, createSignal, useContext, type Accessor, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCallPart} from '@conciv/types/chat-message-types'
import type {PermissionReply} from '@conciv/types/chat-types'
import type {ToolViewCtx} from '@conciv/types/tool-view-types'

const PermissionMetadataSchema = z.object({permission: z.object({always: z.boolean()})})

export type PermissionDecision = 'approved' | 'denied' | undefined

type PermissionContextValue = {
  pending: Accessor<boolean>
  decision: Accessor<PermissionDecision>
  savable: Accessor<boolean>
  approve: () => void
  always: () => void
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
  const savable = () => PermissionMetadataSchema.safeParse(props.part.metadata).data?.permission.always ?? false
  const decide = (reply: PermissionReply) => {
    const id = approval()?.id
    if (!id) return
    setAnswered(reply === 'reject' ? 'denied' : 'approved')
    props.ctx.respondApproval?.(id, reply)
  }
  return (
    <PermissionContext.Provider
      value={{
        pending,
        decision,
        savable,
        approve: () => decide('once'),
        always: () => decide('always'),
        reject: () => decide('reject'),
      }}
    >
      {props.children}
    </PermissionContext.Provider>
  )
}

export const Permission = Object.assign(Root, {Root})

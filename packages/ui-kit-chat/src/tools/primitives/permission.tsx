import {createContext, createSignal, useContext, type Accessor, type JSX} from 'solid-js'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'

type PermissionContextValue = {
  pending: Accessor<boolean>
  approve: () => void
  reject: () => void
}

const PermissionContext = createContext<PermissionContextValue>()

export function usePermission(): PermissionContextValue {
  const context = useContext(PermissionContext)
  if (!context) throw new Error('Permission.* must be used within Permission.Root')
  return context
}

function Root(props: {part: ToolCallPart; ctx: ToolViewCtx; children: JSX.Element}): JSX.Element {
  const [answered, setAnswered] = createSignal(false)
  const approval = () => props.part.approval
  const pending = () =>
    !answered() &&
    props.part.state === 'approval-requested' &&
    approval() !== undefined &&
    Boolean(props.ctx.respondApproval)
  const decide = (approved: boolean) => {
    const id = approval()?.id
    if (!id) return
    setAnswered(true)
    props.ctx.respondApproval?.(id, approved)
  }
  return (
    <PermissionContext.Provider value={{pending, approve: () => decide(true), reject: () => decide(false)}}>
      {props.children}
    </PermissionContext.Provider>
  )
}

export const Permission = Object.assign(Root, {Root})
